import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { documentToMarkdown, type PdfPage } from "./pdf-markdown.ts";

/**
 * PDF plumbing for the pdf-reader sub-agent — sources v0 (2026-09): Node
 * ports of the four pdf-reader skill scripts (pdf_info / pdf_extract /
 * pdf_search / pdf_render), on the user-chosen hybrid stack:
 *
 * - TEXT (info / extract / search): pdfjs-dist — pure JS, no native deps.
 *   extract and search read pdf-markdown's Markdown, so words and lines
 *   survive (the raw text items glued "lecture" + "Plants").
 * - RENDER: subagents/headless.ts uses the same pdfjs engine with
 *   @napi-rs/canvas (Skia), in-process — no browser needed.
 *
 * Doctrine (the skill's reading strategy, mirrored in the sub-agent's system
 * prompt): triage with pdf_info FIRST, then size-based strategy — short PDFs
 * render all pages, medium render flagged (math/image-heavy) pages, long
 * ones search for targeted lookups before reading anything at length.
 *
 * These are pure library functions — no model in sight. The pdf-reader
 * agent (pdf-reader.ts) drives them through its own tool loop.
 */

export interface PdfPageInfo {
	page: number;
	text_length: number;
	image_count: number;
	/** Fraction of math-flavored chars — the render-this-page signal (port
	 *  of the skill's unicode-range density heuristic). */
	math_density: number;
}

export interface PdfInfo {
	path: string;
	page_count: number;
	/** Mean chars/page — the size class the strategy branches on. */
	mean_text_length: number;
	pages: PdfPageInfo[];
}

/** Load the legacy pdfjs build (runs headless in plain node, no worker). */
async function loadPdfjs() {
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	return pdfjs;
}

/** Standard-font data dir (live-smoke finding 2026-09-19: without it pdfjs
 *  warns and falls back on non-embedded standard fonts — Helvetica, Times…).
 *  The node side takes a plain filesystem path, shared by text and rendering;
 *  pdfjs requires its trailing slash. */
export function standardFontsDir(): string {
	return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "node_modules", "pdfjs-dist", "standard_fonts") + "/";
}

/**
 * The legacy build in plain node reads every document on one main-thread
 * fake worker, and a document's teardown (the loading task's destroy(), the
 * worker's Terminate) clears that worker's module-wide caches: the WASM image
 * decoder, patterns, primitives. A read still running in another document
 * then waits on promises that never settle, and the process exits mid-await
 * (18 Nov 2026: a 1,127-page textbook measured beside an 80-page deck). So
 * documents read side by side, a teardown waits until none is reading, and
 * once one is due no new document opens until it is done, so documents never
 * pile up waiting for a quiet moment. The gate lives on globalThis: pdfjs is
 * one server-external module, while Next bundles this file into every route
 * and into instrumentation, so a gate per copy would let one copy's teardown
 * run under another copy's read.
 */
interface PdfGate { reading: number; ending: PDFDocumentLoadingTask[]; due: Promise<void> | null; done: () => void }
type PdfGateGlobal = { __lhPdfGate?: PdfGate };
const gate: PdfGate = ((globalThis as typeof globalThis & PdfGateGlobal).__lhPdfGate ??= { reading: 0, ending: [], due: null, done: () => {} });

async function tearDown(): Promise<void> {
	while (gate.ending.length > 0) await gate.ending.shift()!.destroy().catch(() => {});
	const done = gate.done;
	gate.due = null;
	done();
}

/** Open a PDF, read it with `use`, and tear it down once no other document
 *  is reading. Every pdfjs document in this process goes through here. */
export async function readPdf<T>(data: Uint8Array, use: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
	const pdfjs = await loadPdfjs();
	while (gate.due) await gate.due;
	gate.reading++;
	// verbosity 0 = errors only — scanned PDFs (JBIG2 XObjects) otherwise
	// flood the log with per-page warnings (live-smoke finding 2026-09-19).
	const task = pdfjs.getDocument({ data, standardFontDataUrl: standardFontsDir(), verbosity: 0 });
	try {
		return await use(await task.promise);
	} finally {
		gate.reading--;
		gate.ending.push(task);
		gate.due ??= new Promise<void>((resolve) => (gate.done = resolve));
		if (gate.reading === 0) void tearDown();
	}
}

async function readPdfFile<T>(filePath: string, use: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
	return readPdf(new Uint8Array(await fs.readFile(filePath)), use);
}

/** Concatenate a page's text items into a body string. */
function itemsToText(items: unknown[]): string {
	let out = "";
	for (const it of items) {
		if (it && typeof it === "object" && "str" in (it as Record<string, unknown>)) {
			const str = (it as { str?: unknown }).str;
			if (typeof str === "string") out += str;
		}
	}
	return out;
}

/** Math-flavored char fraction — the skill's heuristic, verbatim ranges. */
function mathDensity(text: string): number {
	let mathChars = 0;
	for (const c of text) {
		const code = c.codePointAt(0)!;
		if (
			(code >= 0x2200 && code <= 0x22ff) || // Mathematical Operators
			(code >= 0x2100 && code <= 0x214f) || // Letterlike Symbols
			(code >= 0x2190 && code <= 0x21ff) || // Arrows
			(code >= 0x27c0 && code <= 0x27ef) || // Misc Mathematical Symbols-A
			(code >= 0x2980 && code <= 0x29ff) || // Misc Mathematical Symbols-B
			(code >= 0x2a00 && code <= 0x2aff) || // Supplemental Mathematical Operators
			(code >= 0x0370 && code <= 0x03ff) || // Greek
			(code >= 0x1d400 && code <= 0x1d7ff) || // Mathematical Alphanumeric Symbols
			"∫∑∏√∂∇∞≈≠≤≥±×÷∈∉⊂⊃∪∩∧∨¬∀∃∅".includes(c)
		) {
			mathChars++;
		}
	}
	return mathChars / Math.max(text.length, 1);
}

/** Cheap validity probe: getDocument resolves only for parseable PDFs —
 *  no page walk, no text extraction (unlike pdfInfo). The reader's upfront
 *  unreadable-source gate; garbage files throw pdfjs's precise error. */
export async function pdfProbe(filePath: string): Promise<void> {
	await readPdfFile(filePath, async () => {});
}

/** A PDF's front: the title its metadata gives (the Info dictionary's, else
 *  its XMP `dc:title`), and its first page's text runs, each with its type
 *  size, in reading order (round 18, m23: a book is named by its title, never
 *  by its file's name). */
export interface PdfFront {
	title: string | null;
	runs: { text: string; size: number }[];
}

export async function pdfFront(filePath: string): Promise<PdfFront> {
	return readPdfFile(filePath, async (doc) => {
		const meta = await doc.getMetadata().catch(() => null);
		const info = (meta?.info ?? {}) as { Title?: unknown };
		const xmp = meta?.metadata?.get("dc:title");
		const title = [info.Title, xmp].find((t): t is string => typeof t === "string" && t.trim() !== "")?.trim() ?? null;
		const page = await doc.getPage(1);
		const content = await page.getTextContent();
		const runs = (content.items as { str?: unknown; transform?: number[] }[]).flatMap((item) => {
			const text = typeof item.str === "string" ? item.str.trim() : "";
			const [, , c = 0, d = 0] = item.transform ?? [];
			return text ? [{ text, size: Math.round(Math.hypot(c, d) * 10) / 10 }] : [];
		});
		return { title, runs };
	});
}

/** pdf_info: page count + per-page triage signals. ALWAYS run first. */
export async function pdfInfo(filePath: string): Promise<PdfInfo> {
	const pdfjs = await loadPdfjs(); // OPS constant for the operator-list scan
	return readPdfFile(filePath, (doc) => documentInfo(filePath, doc, pdfjs.OPS.paintImageXObject));
}

async function documentInfo(filePath: string, doc: PDFDocumentProxy, paintImage: number): Promise<PdfInfo> {
	const pages: PdfPageInfo[] = [];
	let totalText = 0;
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i);
		const content = await page.getTextContent();
		const text = itemsToText(content.items as unknown[]);
		// count page images: paintImageXObject ops in the operator list
		const ops = await page.getOperatorList();
		let imageCount = 0;
		for (const fn of ops.fnArray) {
			if (fn === paintImage) imageCount++;
		}
		totalText += text.length;
		pages.push({
			page: i,
			text_length: text.length,
			image_count: imageCount,
			math_density: Math.round(mathDensity(text) * 10000) / 10000,
		});
	}
	return {
		path: filePath,
		page_count: doc.numPages,
		mean_text_length: Math.round(totalText / Math.max(doc.numPages, 1)),
		pages,
	};
}

/** Parse 'all' | '1-5' | '1,3,7' | '3' into a sorted 1-indexed page list. */
export function parsePageSpec(spec: string, total: number): number[] {
	const trimmed = spec.trim().toLowerCase();
	if (trimmed === "all") return Array.from({ length: total }, (_, i) => i + 1);
	const pages = new Set<number>();
	for (const part of spec.split(",")) {
		const p = part.trim();
		if (!p) continue;
		if (p.includes("-")) {
			const [startRaw, endRaw] = p.split("-", 2) as [string, string];
			const start = Math.max(1, parseInt(startRaw, 10));
			const end = Math.min(total, parseInt(endRaw, 10));
			for (let pg = start; pg <= end; pg++) pages.add(pg);
		} else {
			const pg = parseInt(p, 10);
			if (pg >= 1 && pg <= total) pages.add(pg);
		}
	}
	return [...pages].sort((a, b) => a - b);
}

export type PdfConversion =
	| { kind: "converted"; pages: PdfPage[] }
	| { kind: "too-long"; pageCount: number }
	/** Broken, encrypted, or not a PDF at all: pdfjs could not read it. */
	| { kind: "unreadable" };

/** An uploaded PDF's pages as Markdown (the notes import's door). The page
 *  cap is checked before any page is read. */
export async function convertPdf(data: Uint8Array, maxPages: number): Promise<PdfConversion> {
	try {
		return await readPdf<PdfConversion>(data, async (doc) =>
			doc.numPages > maxPages ? { kind: "too-long", pageCount: doc.numPages } : { kind: "converted", pages: await documentToMarkdown(doc) },
		);
	} catch {
		return { kind: "unreadable" };
	}
}

/** A page's Markdown, or "" for a page with no text (the agent renders those). */
function pageMarkdown(page: PdfPage): string {
	return page.kind === "text" ? page.markdown : "";
}

/** pdf_extract: Markdown of the requested pages, `--- Page N ---` headed. */
export async function pdfExtract(filePath: string, pageSpec: string): Promise<string> {
	return readPdfFile(filePath, async (doc) => {
		const pages = parsePageSpec(pageSpec, doc.numPages);
		if (pages.length === 0) return "No pages selected — page spec matched nothing.";
		const converted = await documentToMarkdown(doc, pages);
		return converted.map((page) => `--- Page ${page.number} ---\n${pageMarkdown(page)}`).join("\n");
	});
}

export interface PdfSearchHit {
	page: number;
	line: number;
	/** contextLines around the hit, `>>>` marking the hit line. */
	context: string;
}

/** pdf_search: keyword/regex across all pages with context lines.
 *  pageTexts rides along so the agent can extract a hit's full page without
 *  a second pass (the skill pipelines `search → extract` the same way). */
export async function pdfSearch(
	filePath: string,
	query: string,
	opts?: { contextLines?: number; literal?: boolean },
): Promise<{ hits: PdfSearchHit[]; pageTexts: Map<number, string> }> {
	const contextLines = opts?.contextLines ?? 3;
	let pattern: RegExp;
	if (opts?.literal) {
		pattern = new RegExp(escapeRegex(query), "i");
	} else {
		try {
			pattern = new RegExp(query, "i");
		} catch (err) {
			throw new Error(`Invalid regex: ${(err as Error).message}`);
		}
	}
	const hits: PdfSearchHit[] = [];
	const pageTexts = new Map<number, string>();
	const converted = await readPdfFile(filePath, (doc) => documentToMarkdown(doc));
	for (const page of converted) {
		const i = page.number;
		const text = pageMarkdown(page);
		pageTexts.set(i, text);
		const lines = text.split("\n");
		for (let ln = 0; ln < lines.length; ln++) {
			if (!pattern.test(lines[ln]!)) continue;
			const start = Math.max(0, ln - contextLines);
			const end = Math.min(lines.length, ln + contextLines + 1);
			const context = lines
				.slice(start, end)
				.map((l, j) => `${start + j === ln ? ">>>" : "   "} ${l}`)
				.join("\n");
			hits.push({ page: i, line: ln + 1, context });
		}
	}
	return { hits, pageTexts };
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Where rendered pages land (mirrors the skill's /tmp convention). */
export function renderDir(filePath: string): string {
	// FNV-1a short hash of the absolute path — stable per file, no deps.
	const abs = path.resolve(filePath);
	let h = 0x811c9dc5;
	for (let i = 0; i < abs.length; i++) {
		h ^= abs.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return path.join("/tmp", `lh-pdf-${h.toString(16).padStart(8, "0")}`);
}