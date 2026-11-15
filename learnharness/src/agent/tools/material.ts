import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { serverExecute, type ImageFileResult } from "../tool-execute.ts";
import { pdfExtract, pdfInfo, pdfSearch, parsePageSpec, type PdfInfo } from "../subagents/pdf-ops.ts";
import { getHeadless } from "../subagents/headless.ts";
import { processImage } from "../image-processing/index.ts";
import { fetchAndExtract } from "./web.ts";

/**
 * The course map builder's reading tools: a course's registered material,
 * named by source handle, never by path, so the agent reads only what the
 * course registered. Text comes page by page (PDFs) or line by line (text
 * files); a page with no text layer, a scan, is rendered to an image.
 *
 * Tool contract (the web.ts law): never throw into the agent loop; every
 * failure is a sentence the agent can act on.
 */

/** One read returns at most this much text, the read tool's own ceiling
 *  (tools/read.ts), so a long source never floods the context at once. */
export const READ_BYTES = 50 * 1024;
/** Pages one render shows, the pdf reader's own limit per call. */
export const RENDER_PAGES = 6;
/** 100 DPI is the pdf reader's guidance for text pages. */
const RENDER_DPI = 100;

/** Files read as text. Anything else registered (slides as .pptx, .docx)
 *  cannot be read here, and the agent says so under `unread`. */
const TEXT_SUFFIXES = new Set([".md", ".txt", ".tex", ".py", ".csv", ".html", ".org", ".rst", ".ipynb"]);

/** `folder`: a linked folder, read through its own registered files. */
export type MaterialKind = "pdf" | "text" | "unreadable" | "folder";

/** One registered source, located and measured before the agent starts. */
export interface MaterialFile {
	handle: string;
	title?: string;
	/** As registered (relative to the course's material folder, absolute,
	 *  or a website's address). */
	registered: string;
	absolute: string;
	kind: MaterialKind;
	/** Why it cannot be read, for an unreadable one. */
	problem?: string;
	/** PDFs: pages, and the pages with no text layer. */
	pages?: number;
	scanned?: number[];
	/** Characters of text it holds. */
	chars: number;
}

/** A website's readable text, fetched once per build into the system's
 *  temporary folder, so it reads like a text file. */
async function fetchWebsite(url: string, fetchPage: (url: string) => Promise<string>): Promise<{ absolute: string; chars: number } | { problem: string }> {
	try {
		const page = await fetchPage(url);
		const folder = path.join(os.tmpdir(), "learnharness-websites");
		await fs.mkdir(folder, { recursive: true });
		const absolute = path.join(folder, `${createHash("sha1").update(url).digest("hex")}.md`);
		await fs.writeFile(absolute, page);
		return { absolute, chars: page.length };
	} catch (err) {
		return { problem: `the website could not be read (${(err as Error).message})` };
	}
}

/** Locate and measure every source. Never throws: a missing or broken
 *  file, or a website that does not answer, comes back unreadable with
 *  its reason. A website is fetched now (`fetchPage`, the web tool's
 *  reader); a folder is marked as one. */
export async function measureMaterial(
	directory: string,
	sources: ReadonlyArray<{ handle: string; path: string; title?: string }>,
	fetchPage: (url: string) => Promise<string> = fetchAndExtract,
): Promise<MaterialFile[]> {
	return Promise.all(
		sources.map(async (s): Promise<MaterialFile> => {
			const named = { handle: s.handle, ...(s.title ? { title: s.title } : {}), registered: s.path };
			if (/^https?:\/\//i.test(s.path)) {
				const page = await fetchWebsite(s.path, fetchPage);
				return "problem" in page ? { ...named, absolute: s.path, kind: "unreadable", problem: page.problem, chars: 0 } : { ...named, ...page, kind: "text" };
			}
			const absolute = path.isAbsolute(s.path) ? s.path : path.join(directory, s.path);
			const base = { ...named, absolute };
			const suffix = path.extname(absolute).toLowerCase();
			try {
				if ((await fs.stat(absolute)).isDirectory()) return { ...base, kind: "folder", chars: 0 };
			} catch {
				return { ...base, kind: "unreadable", problem: "the file is missing", chars: 0 };
			}
			if (suffix === ".pdf") {
				let info: PdfInfo;
				try {
					info = await pdfInfo(absolute);
				} catch (err) {
					return { ...base, kind: "unreadable", problem: `the PDF could not be opened (${(err as Error).message})`, chars: 0 };
				}
				return {
					...base,
					kind: "pdf",
					pages: info.page_count,
					scanned: info.pages.filter((p) => p.text_length === 0).map((p) => p.page),
					chars: info.pages.reduce((n, p) => n + p.text_length, 0),
				};
			}
			if (TEXT_SUFFIXES.has(suffix)) {
				const stat = await fs.stat(absolute);
				return { ...base, kind: "text", chars: stat.size };
			}
			return { ...base, kind: "unreadable", problem: `a ${suffix || "file without a suffix"} cannot be read here; export it as PDF`, chars: 0 };
		}),
	);
}

/** How many tool rounds reading the material can take: one per read-sized
 *  share of its text, one per render-sized run of scanned pages. The
 *  agent may batch several calls in a round, so this is an upper bound. */
export function readingRounds(files: readonly MaterialFile[]): number {
	return files.reduce((n, f) => n + Math.ceil(f.chars / READ_BYTES) + Math.ceil((f.scanned?.length ?? 0) / RENDER_PAGES), 0);
}

const sourceInput = Type.String({ description: "The source's handle, as listed in the material." });

/** A PDF's text, page by page, converted once per build. */
type PageTexts = (file: MaterialFile) => Promise<Map<number, string>>;

function pageTextsCache(): PageTexts {
	const cache = new Map<string, Promise<Map<number, string>>>();
	return (file) => {
		let pages = cache.get(file.absolute);
		if (!pages) {
			pages = pdfExtract(file.absolute, "all").then((all) => {
				const byPage = new Map<number, string>();
				for (const chunk of all.split(/^(?=--- Page \d+ ---$)/m)) {
					const page = Number(/^--- Page (\d+) ---$/m.exec(chunk)?.[1]);
					if (page) byPage.set(page, chunk.trimEnd());
				}
				return byPage;
			});
			cache.set(file.absolute, pages);
		}
		return pages;
	};
}

/** The pages of `spec` whose text fits one read, and the pages left. */
async function pdfRead(file: MaterialFile, spec: string, texts: PageTexts): Promise<string> {
	const total = file.pages ?? 0;
	const wanted = parsePageSpec(spec, total);
	if (wanted.length === 0) return `No pages of ${file.handle} match "${spec}"; it has ${total} pages.`;
	const scanned = new Set(file.scanned ?? []);
	const byPage = await texts(file);
	let out = "";
	let last = 0;
	for (const page of wanted) {
		const body = scanned.has(page) ? `--- Page ${page} ---\n(no text layer: see it with render_pages)` : (byPage.get(page) ?? `--- Page ${page} ---`);
		if (out && Buffer.byteLength(`${out}\n${body}`, "utf-8") > READ_BYTES) break;
		out += (out ? "\n" : "") + body;
		last = page;
	}
	const rest = wanted.filter((p) => p > last);
	return rest.length > 0 ? `${out}\n\n[${rest.length} more of the asked pages; continue with pages "${rest[0]}-${rest.at(-1)}".]` : out;
}

/** Lines of a text file from `offset`, as many as fit one read. */
async function textRead(file: MaterialFile, offset: number): Promise<string> {
	const lines = (await fs.readFile(file.absolute, "utf-8")).split("\n");
	if (offset > lines.length) return `${file.handle} has ${lines.length} lines.`;
	const picked: string[] = [];
	for (let i = offset - 1; i < lines.length; i++) {
		if (picked.length > 0 && Buffer.byteLength([...picked, lines[i]].join("\n"), "utf-8") > READ_BYTES) break;
		picked.push(lines[i]!);
	}
	const next = offset + picked.length;
	return next <= lines.length ? `${picked.join("\n")}\n\n[Lines ${offset}-${next - 1} of ${lines.length}; continue with offset ${next}.]` : picked.join("\n");
}

export function createMaterialTools(files: readonly MaterialFile[], model?: Pick<Model<Api>, "input" | "inputLimits">): Record<string, AgentTool<any>> {
	const byHandle = new Map(files.map((f) => [f.handle, f]));
	const texts = pageTextsCache();
	const find = (handle: string): MaterialFile | string => {
		const file = byHandle.get(handle);
		if (!file) return `No source "${handle}". The sources are: ${files.map((f) => f.handle).join(", ")}.`;
		if (file.kind === "unreadable") return `${handle} cannot be read: ${file.problem}. List it under unread.`;
		return file;
	};
	const readInput = Type.Object({
		source: sourceInput,
		pages: Type.Optional(Type.String({ description: "PDFs: the pages to read, as '1-12', '3,7' or 'all' (default). A long read stops at a page and says where to continue." })),
		offset: Type.Optional(Type.Integer({ minimum: 1, description: "Text files: the line to start from (default 1)." })),
	});
	const searchInput = Type.Object({
		source: sourceInput,
		query: Type.String({ description: "Words to find, case-insensitive." }),
	});
	const renderInput = Type.Object({
		source: sourceInput,
		pages: Type.String({ description: `PDF pages to see as images, at most ${RENDER_PAGES}: '4', '4-9' or '4,8'. For pages with no text layer, and diagrams the text misses.` }),
	});
	return {
		read_material: {
			name: "read_material",
			label: "read_material",
			description: "Read a source of the course's material: a PDF by pages, a text file or a website by lines.",
			parameters: readInput,
			execute: serverExecute("read_material", readInput, async ({ source, pages, offset }) => {
				const file = find(source);
				if (typeof file === "string") return file;
				try {
					return file.kind === "pdf" ? await pdfRead(file, pages ?? "all", texts) : await textRead(file, offset ?? 1);
				} catch (err) {
					return `${source} could not be read: ${(err as Error).message}`;
				}
			}),
		},
		search_material: {
			name: "search_material",
			label: "search_material",
			description: "Find words in a source: the pages (or lines) and their context.",
			parameters: searchInput,
			execute: serverExecute("search_material", searchInput, async ({ source, query }) => {
				const file = find(source);
				if (typeof file === "string") return file;
				try {
					if (file.kind === "pdf") {
						const { hits } = await pdfSearch(file.absolute, query, { literal: true });
						if (hits.length === 0) return `No match for "${query}" in ${source}.`;
						return hits.slice(0, 20).map((h) => `p${h.page}:\n${h.context}`).join("\n\n");
					}
					const needle = query.toLowerCase();
					const hits = (await fs.readFile(file.absolute, "utf-8")).split("\n").flatMap((line, i) => (line.toLowerCase().includes(needle) ? [`${i + 1}: ${line}`] : []));
					return hits.length > 0 ? hits.slice(0, 40).join("\n") : `No match for "${query}" in ${source}.`;
				} catch (err) {
					return `${source} could not be searched: ${(err as Error).message}`;
				}
			}),
		},
		render_pages: {
			name: "render_pages",
			label: "render_pages",
			description: `See up to ${RENDER_PAGES} pages of a PDF as images: for scanned pages with no text layer, and for diagrams and formulas the text misses.`,
			parameters: renderInput,
			execute: serverExecute("render_pages", renderInput, async ({ source, pages }): Promise<string | ImageFileResult> => {
				const file = find(source);
				if (typeof file === "string") return file;
				if (file.kind !== "pdf") return `${source} is not a PDF; read it with read_material.`;
				const wanted = parsePageSpec(pages, file.pages ?? 0);
				if (wanted.length === 0) return `No pages of ${source} match "${pages}"; it has ${file.pages} pages.`;
				if (wanted.length > RENDER_PAGES) return `At most ${RENDER_PAGES} pages a call; ask for ${wanted[0]}-${wanted[RENDER_PAGES - 1]} first.`;
				if (model && !model.input.includes("image")) return "This model cannot see images; list the scanned pages under unread.";
				try {
					const rendered = await getHeadless().renderPdfPages(file.absolute, wanted, { dpi: RENDER_DPI });
					const images: { data: string; mimeType: string }[] = [];
					const notes: string[] = [];
					for (const page of rendered) {
						const processed = await processImage(page.png, "image/png", { resizeOptions: model?.inputLimits?.images?.resize });
						if (processed.ok) {
							images.push({ data: processed.data, mimeType: processed.mimeType });
							notes.push(`Page ${page.page}`);
						} else notes.push(`Page ${page.page}: ${processed.message}`);
					}
					return { text: `${source}, ${notes.join("; ")}, in order:`, images };
				} catch (err) {
					return `${source} pages ${pages} could not be rendered: ${(err as Error).message}`;
				}
			}),
		},
	};
}
