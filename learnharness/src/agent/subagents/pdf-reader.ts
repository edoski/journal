import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent, Usage } from "@earendil-works/pi-ai";
import { processImage } from "../image-processing/index.ts";
import { Type } from "typebox";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SdkEngine } from "../models.ts";
import { runSubagent } from "../sdk/task.ts";
import type { PdfResult, PdfToolInput } from "../../core/contracts.ts";
import { getHeadless, type HeadlessApi } from "./headless.ts";
import { pdfExtract, pdfInfo, pdfProbe, pdfSearch } from "./pdf-ops.ts";

/**
 * The pdf-reader sub-agent (sources v0, 2026-09): reads a learner-provided
 * PDF on the teacher's behalf — a hand-rolled loop like the visual-maker's
 * (image-in-the-loop can't ride the execute-tool plumbing: rendered pages
 * are shown to THIS agent's eyes, never delivered onward — user-decided).
 *
 * System prompt = the pdf-reader skill's reading doctrine, verbatim in
 * strategy: triage with pdf_info FIRST, then size-based strategy — short
 * PDFs render all pages, medium render flagged (math/image-heavy) pages,
 * long ones search for targeted lookups before reading anything at length.
 *
 * Its final text IS the brief (researcher idiom), with (p. N) citations;
 * runPdfJob wraps it into PdfResult with pagesConsulted tracked by the loop.
 */

const INSTRUCTIONS = `You are a PDF reading specialist. You work for a teacher agent inside a learning
application: given a PDF path and a question, read the document on the teacher's behalf and
produce a focused brief that the teacher can teach from, with page citations.

You operate in an isolated context. The task gives you the PDF path and the question — that is
everything you know.

Reading doctrine — always in this order:
1. TRIAGE FIRST: call pdf_info. It returns page count plus per-page signals (text_length,
   image_count, math_density). Never read or render anything before this.
2. Pick a strategy by document size:
   - SHORT (≤ 10 pages): extract the full text; render every page that has meaningful
     math_density or images (you read equations and diagrams visually, not as extracted text).
   - MEDIUM (11-40 pages): extract promising pages; render only flagged pages (math- or
     image-heavy, or where extraction looks thin).
   - LONG (> 40 pages): pdf_search for the question's key terms first; extract and render only
     the pages that hit. Never read a long document front-to-back.
3. When the extracted text of a page looks math- or diagram-heavy, or garbled, RENDER that
   page and read it visually before drawing conclusions from it.
4. Render DPI guidance: 100 for text-dominant pages, 150 the default, 200 for dense small
   print (math details, fine diagrams).

Tool outputs may be error strings (file unreadable, invalid regex, no hits). Adapt: narrow the
page spec, change the query, lower DPI. If the document genuinely cannot answer the question,
say so in the brief instead of inventing content.

Your FINAL assistant message is your entire deliverable — it must stand alone, in this format:
2-6 sentences (or short sections) answering the teacher's question from the document, each
claim cited as (p. N). End with a line "Pages consulted: N, N, …" listing every page you
extracted or rendered.`;

const MAX_ITERATIONS = 14;
/** Rendered pages per pdf_render call — the skill renders selectively; a
 *  batch cap keeps one over-eager call from flooding the vision context. */
const RENDER_BATCH_CAP = 6;
/** Extract output ceiling — narrow the spec instead of dumping a book. */
const EXTRACT_CAP = 24_000;

export interface PdfReaderOptions {
	engine: SdkEngine;
	abortSignal?: AbortSignal;
	onUsage?: (usage: Usage) => void;
	onActivity?: (line: string) => void;
	headless?: HeadlessApi;
	maxIterations?: number;
}

export interface PdfReaderInput extends PdfToolInput {}

interface ReaderState {
	/** Every page the reader extracted, rendered or hit in a search (the citation set). */
	consulted: Set<number>;
	/** Pages genuinely READ: extract or render output entered the loop. */
	read: Set<number>;
}

const text = (value: string): AgentToolResult<null> => ({ content: [{ type: "text", text: value }], details: null, ...(value.startsWith("ERROR:") ? { isError: true } : {}) });

/** The reader's tools over one PDF; every page they show joins the citation set. */
export function createPdfTools(pdfPath: string, state: ReaderState, headless: HeadlessApi, engine: SdkEngine, onActivity?: (line: string) => void, signal?: AbortSignal): Record<string, AgentTool<any>> {
	const tool = (name: string, description: string, parameters: AgentTool["parameters"], run: (args: Record<string, unknown>) => Promise<AgentToolResult<null>>): AgentTool<any> => ({
		name, label: name, description, parameters,
		execute: async (_id, params) => {
			try { return await run((params ?? {}) as Record<string, unknown>); }
			catch (err) {
				if (signal?.aborted) throw err;
				return text(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
			}
		},
	});
	return {
		pdf_info: tool("pdf_info", "Metadata + per-page triage signals for the PDF (page count, text length, image count, math density). ALWAYS call this first.", Type.Object({}), async () => {
			onActivity?.("pdf_info: triaging");
			return text(await pdfInfoText(pdfPath));
		}),
		pdf_extract: tool("pdf_extract", "Extract text from pages (spec: 'all', '1-5', '1,3,7', '3'). Use pdf_info first; narrow the spec for big documents.", Type.Object({
			pages: Type.String({ description: "Page spec, e.g. 'all', '1-5', '1,3,7'" }),
		}), async (args) => {
			const spec = String(args.pages ?? "all");
			onActivity?.(`pdf_extract: ${spec}`);
			const result = await pdfExtractText(pdfPath, spec);
			for (const p of specNumbers(spec, Infinity)) { state.consulted.add(p); state.read.add(p); }
			return text(result);
		}),
		pdf_render: tool("pdf_render", "Render pages to images and show them to you for visual reading (equations, diagrams, layout). DPI: 100 text, 150 default, 200 dense small print. Max 6 pages per call.", Type.Object({
			pages: Type.String({ description: "Page spec, e.g. '1-3' or '2,5,8'" }),
			dpi: Type.Optional(Type.Integer({ minimum: 72, maximum: 300, description: "Render DPI (100 text / 150 default / 200 dense)" })),
		}), async (args) => {
			const spec = String(args.pages ?? "1");
			const dpi = numOr(args.dpi, 150);
			onActivity?.(`pdf_render: ${spec} @${dpi}dpi`);
			const pages = await headless.renderPdfPages(pdfPath, specNumbers(spec, RENDER_BATCH_CAP), { dpi });
			if (pages.length === 0) return text("ERROR: no pages rendered (spec matched nothing?)");
			const content: (TextContent | ImageContent)[] = [{ type: "text", text: `Rendered ${pages.length} page(s) at ${dpi} DPI, in order. Read the images carefully (equations, diagrams, layout).` }];
			for (const p of pages) {
				const image = await processImage(p.png, "image/png", { resizeOptions: engine.model.inputLimits?.images?.resize });
				signal?.throwIfAborted();
				if (image.ok) {
					state.consulted.add(p.page); state.read.add(p.page);
					content.push({ type: "text", text: [`Page ${p.page}`, ...image.hints].join("\n") }, { type: "image", data: image.data, mimeType: image.mimeType });
				} else content.push({ type: "text", text: `Page ${p.page}: ${image.message}` });
			}
			return { content, details: null };
		}),
		pdf_search: tool("pdf_search", "Search the PDF's text by keyword or regex (case-insensitive); returns hits with context lines. Use for long documents before reading anything at length.", Type.Object({
			query: Type.String({ description: "Keyword or regex" }),
			context_lines: Type.Optional(Type.Integer({ minimum: 0, maximum: 8, description: "Context lines around each hit (default 3)" })),
			literal: Type.Optional(Type.Boolean({ description: "true = treat the query literally (no regex; default false)" })),
		}), async (args) => {
			const query = String(args.query ?? "");
			onActivity?.(`pdf_search: "${query}"`);
			const { hits } = await pdfSearch(pdfPath, query, { contextLines: numOr(args.context_lines, 3), literal: Boolean(args.literal) });
			for (const h of hits) state.consulted.add(h.page);
			const cap = hits.slice(0, 40);
			return text(cap.length === 0
				? "No hits."
				: cap.map((h) => `=== Page ${h.page}, line ${h.line} ===\n${h.context}`).join("\n") + (hits.length > cap.length ? `\n\n[${hits.length - cap.length} more hits — narrow the query.]` : ""));
		}),
	};
}

/** pdf_info's body (the loop's dispatch target): the triage readout. */
async function pdfInfoText(pdfPath: string): Promise<string> {
	const info = await pdfInfo(pdfPath);
	const lines = [
		`File: ${info.path}`,
		`Pages: ${info.page_count} (mean text length/page: ${info.mean_text_length})`,
		...info.pages.map(
			(p) =>
				`p${p.page}: len=${p.text_length} img=${p.image_count} math=${p.math_density.toFixed(2)}`,
		),
	];
	return lines.join("\n");
}

/** pdf_extract's body: capped text extraction with the narrow-the-spec notice. */
async function pdfExtractText(pdfPath: string, pages: string): Promise<string> {
	const text = await pdfExtract(pdfPath, pages);
	if (text.length > EXTRACT_CAP) {
		return `${text.slice(0, EXTRACT_CAP)}\n\n[Output truncated at ${EXTRACT_CAP} chars — narrow the page spec and extract in smaller batches.]`;
	}
	return text;
}

export async function runPdfReaderAgent(
	input: PdfReaderInput,
	opts: PdfReaderOptions,
): Promise<PdfResult> {
	const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;
	// A path resolves against his home, `~` included.
	const pdfPath = input.path === "~" || input.path.startsWith("~/") ? join(homedir(), input.path.slice(1)) : resolve(homedir(), input.path);
	const openError = await probeReadable(pdfPath);
	if (openError) {
		return { path: pdfPath, question: input.question, brief: `PDF failed: ${openError}`, pagesRead: [], pagesConsulted: [] };
	}
	const headless = opts.headless ?? getHeadless();
	// No Chrome gate (Wave E, 2026-10-10): pdf_render is native now
	// (pdfjs paints into @napi-rs/canvas in-process) — the whole pdf-reader
	// runs browser-free; text tools always worked without one.

	const state: ReaderState = { consulted: new Set(), read: new Set() };
	const pages = () => ({ pagesRead: [...state.read].sort((a, b) => a - b), pagesConsulted: [...state.consulted].sort((a, b) => a - b) });
	const prompt = [
		`PDF path: ${pdfPath}`,
		`Question (what the teacher needs from this document): ${input.question || "(no question — give a structural overview)"}`,
		"",
		"Read the document per your doctrine, then produce your final brief in the required format.",
	].join("\n");
	let finalText: string;
	try {
		const result = await runSubagent(Object.values(createPdfTools(pdfPath, state, headless, opts.engine, opts.onActivity, opts.abortSignal)), {
			engine: opts.engine,
			systemPrompt: INSTRUCTIONS,
			prompt,
			maxTurns: maxIterations,
			abortSignal: opts.abortSignal,
			onUsage: opts.onUsage,
		});
		finalText = result.text.trim();
	} catch (err) {
		return { path: pdfPath, question: input.question, brief: `PDF failed: the reader crashed — ${err instanceof Error ? err.message : String(err)}`, ...pages() };
	}
	// Doctrine gate: a brief that consulted no page is invention, not reading.
	if (state.consulted.size === 0) return { path: pdfPath, question: input.question, brief: "PDF failed: the reader wrote no brief from the document's pages.", ...pages() };
	return { path: pdfPath, question: input.question, brief: finalText || `PDF failed: iteration limit (${maxIterations}) reached without a brief.`, ...pages() };
}

/** Parse a page spec into concrete page numbers, capped. */
function specNumbers(spec: string, cap: number): number[] {
	// total = Infinity: bounds come from the document at execution time; the
	// cap alone protects the batch.
	const parts = spec.trim().toLowerCase() === "all" ? [`${cap}`] : spec.split(",");
	const out = new Set<number>();
	for (const part of parts) {
		const p = part.trim();
		if (!p) continue;
		if (p.includes("-")) {
			const [s, e] = p.split("-", 2) as [string, string];
			const start = Math.max(1, parseInt(s, 10) || 1);
			const end = Math.min(parseInt(e, 10) || start, start + cap - 1);
			for (let pg = start; pg <= end && out.size < cap; pg++) out.add(pg);
		} else {
			const pg = parseInt(p, 10);
			if (Number.isFinite(pg) && pg >= 1 && out.size < cap) out.add(pg);
		}
	}
	return [...out].sort((a, b) => a - b);
}

function numOr(v: unknown, dflt: number): number {
	return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}

/** Cheap upfront readability probe — real parsing happens inside the tools. */
async function probeReadable(pdfPath: string): Promise<string | null> {
	try {
		const fs = await import("node:fs/promises");
		const stat = await fs.stat(pdfPath);
		if (!stat.isFile()) return "not a regular file";
		if (stat.size === 0) return "file is empty";
		// parse probe: pdfProbe throws pdfjs's precise error for garbage files
		await pdfProbe(pdfPath);
		return null;
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
}
