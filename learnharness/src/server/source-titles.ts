/**
 * A source as he reads it: the title of the document itself, never its
 * file's name (round 18, m23: the topic page's material read "Hefferon
 * linear algebra", "Hefferon answers" and "Grinstead snell probability",
 * the files' stems cased, beside the books' own titles). A course made from
 * files titles each source with its stem, so where the record's title is
 * only that, the document's own title stands in: a PDF's metadata title, a
 * Markdown or text file's first heading, a web page's <title>. Two sources
 * of one title (a book and its answers) each add the word of their file's
 * name the other lacks. A source with no title of its own is left unnamed,
 * and its row shows only the place in it.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface SourceFacts {
	handle: string;
	/** The record's title for it. */
	title: string | null;
	/** Its path as the record keeps it. */
	path: string | null;
	/** The title the document gives itself, when it gives one. */
	own: string | null;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const stemOf = (file: string | null) => file?.split("/").pop()?.replace(/\.[^.]+$/, "") ?? null;

/** The record's title, when it is a real one: not the file's name, nor
 *  the handle the engine made from it. Pure. */
export function recordTitle(handle: string, title: string | null, file: string | null): string | null {
	return title && title !== stemOf(file) && title !== handle ? title : null;
}

/** Words set in capitals read as words: "LINEAR ALGEBRA" is "Linear Algebra". */
function unshouted(text: string): string {
	return /\p{Lu}/u.test(text) && text === text.toUpperCase() ? text.toLowerCase().replace(/(^|\s)(\p{Ll})/gu, (_, gap: string, c: string) => gap + c.toUpperCase()) : text;
}

const capital = (text: string) => text[0]!.toLocaleUpperCase() + text.slice(1);

/** The title a document gives itself, as a name: one line, out of capitals,
 *  with the course's own name dropped from its front ("Linear Algebra:
 *  problem sheets" in Linear Algebra is "Problem sheets"). Pure. */
export function documentTitle(own: string | null, course: string | null): string | null {
	let title = own?.replace(/\s+/g, " ").trim();
	if (!title || title.length > 120) return null;
	title = unshouted(title);
	const lead = course ? `${course}:` : null;
	if (lead && title.toLowerCase().startsWith(lead.toLowerCase()) && title.length > lead.length) title = title.slice(lead.length).trim();
	return capital(title);
}

const words = (text: string | null) => (text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Each source's name, by handle: the record's real title, else the
 *  document's own (`documentTitle`); of two or more of one name, each that
 *  can adds the words of its file's name in neither the title nor every
 *  other's file name ("Linear Algebra" and "Linear Algebra: Answers" for
 *  hefferon-linear-algebra and hefferon-answers); null for a source that
 *  names itself nowhere. Pure. */
export function sourceTitles(sources: readonly SourceFacts[], course: string | null): Map<string, string | null> {
	const names = new Map<string, string | null>();
	for (const s of sources) names.set(s.handle, recordTitle(s.handle, s.title, s.path) ?? documentTitle(s.own, course));
	const settled = new Map(names);
	for (const s of sources) {
		const name = settled.get(s.handle);
		if (!name || recordTitle(s.handle, s.title, s.path)) continue;
		const twins = sources.filter((o) => o !== s && settled.get(o.handle)?.toLowerCase() === name.toLowerCase());
		if (twins.length === 0) continue;
		const known = new Set(words(name));
		const shared = (w: string) => twins.every((o) => words(stemOf(o.path) ?? o.handle).includes(w));
		const extra = words(stemOf(s.path) ?? s.handle).filter((w) => !known.has(w) && !shared(w));
		if (extra.length > 0) names.set(s.handle, `${name}: ${capital(extra.join(" "))}`);
	}
	return names;
}

/** Where the course's material is: the folder its workspace names, else
 *  the course's own folder (the engine's `Workspace.sources`). */
export async function materialOf(workspace: string): Promise<string> {
	try {
		const manifest = JSON.parse(await fs.readFile(path.join(workspace, ".study", "workspace.json"), "utf8")) as { sources?: unknown };
		return str(manifest.sources) ?? workspace;
	} catch {
		return workspace;
	}
}

type TitleCache = Map<string, Promise<string | null>>;
const cache: TitleCache = ((globalThis as typeof globalThis & { __lhSourceTitles?: TitleCache }).__lhSourceTitles ??= new Map());

/** The title a file gives itself, read once per version of the file. */
async function ownTitleOf(file: string): Promise<string | null> {
	const stat = await fs.stat(file).catch(() => null);
	if (!stat?.isFile()) return null;
	const key = `${file}\0${stat.mtimeMs}\0${stat.size}`;
	let title = cache.get(key);
	if (!title) {
		title = readOwnTitle(file).catch(() => null);
		cache.set(key, title);
	}
	return title;
}

async function readOwnTitle(file: string): Promise<string | null> {
	const ext = path.extname(file).toLowerCase();
	if (ext === ".pdf") return pdfTitle(file);
	if (![".md", ".txt", ".html", ".htm"].includes(ext)) return null;
	const handle = await fs.open(file, "r");
	try {
		const { buffer, bytesRead } = await handle.read(Buffer.alloc(16_384), 0, 16_384, 0);
		const head = buffer.subarray(0, bytesRead).toString("utf8");
		const heading = ext.startsWith(".htm") ? /<title[^>]*>([^<]+)<\/title>/i.exec(head)?.[1] : /^#{1,2}\s+(.+?)\s*#*\s*$/m.exec(head)?.[1];
		return str(heading?.replace(/[*_`]/g, ""));
	} finally {
		await handle.close();
	}
}

/** How much of each end of a PDF is read for its title: its trailer and
 *  document information sit at its end, its XMP metadata at either end. */
const PDF_END = 2 << 20;

/** A PDF's own title, read from its bytes with no PDF library (pdfjs held
 *  some 450 MB to say it): the document information dictionary's /Title,
 *  else its XMP metadata's dc:title; null when neither is in plain text. */
async function pdfTitle(file: string): Promise<string | null> {
	const handle = await fs.open(file, "r");
	try {
		const { size } = await handle.stat();
		const read = async (at: number, length: number) => {
			const { buffer, bytesRead } = await handle.read(Buffer.alloc(length), 0, length, at);
			return buffer.subarray(0, bytesRead).toString("latin1");
		};
		const head = await read(0, Math.min(size, PDF_END));
		const tail = size > PDF_END ? await read(size - PDF_END, PDF_END) : "";
		return pdfInfoTitle(head + "\n" + tail);
	} finally {
		await handle.close();
	}
}

/** The /Title the trailer's /Info names, else XMP's dc:title, in a PDF's
 *  bytes read as latin1. Pure. */
export function pdfInfoTitle(bytes: string): string | null {
	const info = [...bytes.matchAll(/\/Info\s+(\d+)\s+(\d+)\s+R/g)].at(-1);
	if (info) {
		const object = new RegExp(`(?:^|\\s)${info[1]}\\s+${info[2]}\\s+obj\\s*<<`, "g");
		const found = [...bytes.matchAll(object)].at(-1);
		if (found) {
			const dict = bytes.slice(found.index + found[0].length, bytes.indexOf("endobj", found.index));
			const at = dict.search(/\/Title\s*[(<]/);
			const title = at < 0 ? null : pdfString(dict.slice(at + "/Title".length).trimStart());
			if (title?.trim()) return title.trim();
		}
	}
	const xmp = /<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/.exec(bytes)?.[1];
	return xmp ? decodeXml(Buffer.from(xmp, "latin1").toString("utf8")).trim() || null : null;
}

/** A PDF string at the start of `text`, a literal (…) or a hex <…>, decoded:
 *  UTF-16 after its byte-order mark, else PDFDocEncoding read as latin1. */
function pdfString(text: string): string | null {
	let bytes = "";
	if (text[0] === "<") {
		const hex = /^<([0-9A-Fa-f\s]*)>/.exec(text)?.[1]?.replace(/\s/g, "");
		if (hex === undefined) return null;
		for (let i = 0; i < hex.length; i += 2) bytes += String.fromCharCode(parseInt(hex.slice(i, i + 2).padEnd(2, "0"), 16));
	} else {
		let depth = 0;
		for (let i = 1; i < text.length; i++) {
			const c = text[i]!;
			if (c === "\\") {
				const next = text[++i] ?? "";
				const octal = /^[0-7]{1,3}/.exec(text.slice(i))?.[0];
				if (octal) {
					bytes += String.fromCharCode(parseInt(octal, 8) & 0xff);
					i += octal.length - 1;
				} else bytes += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[next] ?? (next === "\n" || next === "\r" ? "" : next);
				continue;
			}
			if (c === "(") depth++;
			else if (c === ")" && depth-- === 0) return decodePdfBytes(bytes);
			bytes += c;
		}
		return null;
	}
	return decodePdfBytes(bytes);
}

function decodePdfBytes(bytes: string): string {
	const raw = Buffer.from(bytes, "latin1");
	if (raw[0] === 0xfe && raw[1] === 0xff) {
		const body = Buffer.from(raw.subarray(2, 2 + ((raw.length - 2) & ~1)));
		return body.swap16().toString("utf16le");
	}
	return bytes;
}

function decodeXml(text: string): string {
	return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name]!);
}

/** The names of a course's sources (`sourceTitles`), reading each file
 *  whose record title is only its file's name. */
export async function courseSourceTitles(workspace: string, sources: Record<string, unknown>, course: string | null): Promise<Map<string, string | null>> {
	const material = await materialOf(workspace);
	const facts = await Promise.all(
		Object.entries(sources).map(async ([handle, value]): Promise<SourceFacts> => {
			const source = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
			const title = str(source.title);
			const at = str(source.path);
			const local = at && !/^[a-z][a-z0-9+.-]*:/i.test(at) ? (path.isAbsolute(at) ? at : path.join(material, at)) : null;
			const own = local && !recordTitle(handle, title, at) ? await ownTitleOf(local) : null;
			return { handle, title, path: at, own };
		}),
	);
	return sourceTitles(facts, course);
}
