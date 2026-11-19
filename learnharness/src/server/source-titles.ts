/**
 * A source as he reads it: the title of the document itself, never its
 * file's name (round 18, m23: the topic page's material read "Hefferon
 * linear algebra", "Hefferon answers" and "Grinstead snell probability",
 * the files' stems cased, beside the books' own titles). A course made from
 * files titles each source with its stem, so where the record's title is
 * only that, the document's own title stands in: a PDF's metadata title,
 * else the largest type on its first page; a Markdown or text file's first
 * heading; a web page's <title>. Two sources that share a title (a book
 * and its answers) each add the first-page line the other lacks. A source
 * with no title of its own is left unnamed, and its row shows only the
 * place in it.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pdfFront, type PdfFront } from "../agent/subagents/pdf-ops.ts";

/** A document's own title and its first page's lines (a PDF's runs, each
 *  with its type size); null when nothing in it names it. */
export type DocumentFront = PdfFront;

export interface SourceFacts {
	handle: string;
	/** The record's title for it. */
	title: string | null;
	/** Its path as the record keeps it. */
	path: string | null;
	/** What the document says of itself, when it could be read. */
	front: DocumentFront | null;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The record's title, when it is a real one: not the file's name, nor
 *  the handle the engine made from it. Pure. */
export function recordTitle(handle: string, title: string | null, file: string | null): string | null {
	const stem = file?.split("/").pop()?.replace(/\.[^.]+$/, "") ?? null;
	return title && title !== stem && title !== handle ? title : null;
}

/** Words set in capitals read as words: "LINEAR ALGEBRA" is "Linear Algebra". */
function unshouted(text: string): string {
	return /\p{Lu}/u.test(text) && text === text.toUpperCase() ? text.toLowerCase().replace(/(^|\s)(\p{Ll})/gu, (_, gap: string, c: string) => gap + c.toUpperCase()) : text;
}

/** A line that can name a document: words, not a link, a page number or a mark. */
const wordy = (text: string) => /\p{L}{2}/u.test(text) && !/^(https?:|www\.)/i.test(text);

/** The document's title: its metadata's, else its first page's largest
 *  type, with the course's own name dropped from its front ("Linear Algebra:
 *  problem sheets" in Linear Algebra is "Problem sheets"). Pure. */
export function documentTitle(front: DocumentFront, course: string | null): string | null {
	let title = front.title;
	if (!title) {
		const lines = front.runs.filter((r) => wordy(r.text));
		const top = Math.max(0, ...lines.map((r) => r.size));
		title = lines.filter((r) => r.size >= top - 0.5).map((r) => r.text).join(" ").trim() || null;
	}
	if (!title || title.length > 120) return null;
	title = unshouted(title.replace(/\s+/g, " "));
	if (course) {
		const lead = `${course}:`;
		if (title.toLowerCase().startsWith(lead.toLowerCase()) && title.length > lead.length) title = title.slice(lead.length).trim();
	}
	return title[0]!.toLocaleUpperCase() + title.slice(1);
}

/** Each source's name, by handle: the record's real title, else the
 *  document's (`documentTitle`), with two sources of one name each given
 *  the first-page line, largest first, that the other's first page lacks;
 *  null for a source that names itself nowhere. Pure. */
export function sourceTitles(sources: readonly SourceFacts[], course: string | null): Map<string, string | null> {
	const names = new Map<string, string | null>();
	const derived: SourceFacts[] = [];
	for (const s of sources) {
		const own = recordTitle(s.handle, s.title, s.path);
		if (own) names.set(s.handle, own);
		else {
			names.set(s.handle, s.front ? documentTitle(s.front, course) : null);
			derived.push(s);
		}
	}
	const lines = (s: SourceFacts) => new Set((s.front?.runs ?? []).map((r) => r.text.toLowerCase()));
	for (const s of derived) {
		const name = names.get(s.handle);
		if (!name) continue;
		const twins = sources.filter((o) => o !== s && names.get(o.handle)?.toLowerCase() === name.toLowerCase());
		if (twins.length === 0) continue;
		const theirs = twins.map(lines);
		const own = [...(s.front?.runs ?? [])]
			.sort((a, b) => b.size - a.size)
			.find((r) => wordy(r.text) && r.text.toLowerCase() !== name.toLowerCase() && theirs.every((t) => !t.has(r.text.toLowerCase())));
		if (own) names.set(s.handle, `${name}: ${unshouted(own.text)}`);
	}
	return names;
}

/** Where the course's material is: the folder its workspace names, else
 *  the course's own folder (the engine's `Workspace.sources`). */
async function materialOf(workspace: string): Promise<string> {
	try {
		const manifest = JSON.parse(await fs.readFile(path.join(workspace, ".study", "workspace.json"), "utf8")) as { sources?: unknown };
		return str(manifest.sources) ?? workspace;
	} catch {
		return workspace;
	}
}

type FrontCache = Map<string, Promise<DocumentFront | null>>;
const cache: FrontCache = ((globalThis as typeof globalThis & { __lhFronts?: FrontCache }).__lhFronts ??= new Map());

/** A file's front, read once per version of the file. */
async function frontOf(file: string): Promise<DocumentFront | null> {
	const stat = await fs.stat(file).catch(() => null);
	if (!stat?.isFile()) return null;
	const key = `${file}\0${stat.mtimeMs}\0${stat.size}`;
	let front = cache.get(key);
	if (!front) {
		front = readFront(file).catch(() => null);
		cache.set(key, front);
	}
	return front;
}

async function readFront(file: string): Promise<DocumentFront | null> {
	const ext = path.extname(file).toLowerCase();
	if (ext === ".pdf") return pdfFront(file);
	if (![".md", ".txt", ".html", ".htm"].includes(ext)) return null;
	const handle = await fs.open(file, "r");
	try {
		const { buffer, bytesRead } = await handle.read(Buffer.alloc(16_384), 0, 16_384, 0);
		const head = buffer.subarray(0, bytesRead).toString("utf8");
		const heading = ext.startsWith(".htm") ? /<title[^>]*>([^<]+)<\/title>/i.exec(head)?.[1] : /^#{1,2}\s+(.+?)\s*#*\s*$/m.exec(head)?.[1];
		return { title: str(heading?.replace(/[*_`]/g, "")), runs: [] };
	} finally {
		await handle.close();
	}
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
			const front = local && !recordTitle(handle, title, at) ? await frontOf(local) : null;
			return { handle, title, path: at, front };
		}),
	);
	return sourceTitles(facts, course);
}
