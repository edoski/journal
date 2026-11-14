/**
 * The course's context, from its engine record (spec:
 * components/course-context/course-context.md): the description is the
 * record's `goal`; each registered source is a linked folder (a path that
 * is a folder), a website (an http or https address), a file inside a
 * linked folder (shown as the folder) or a file of its own. Pure: the
 * caller answers where a path is and whether it is a folder.
 */

import type { ContextFile, ContextFolder, ContextWebsite, CourseContext } from "./contracts/course-context.ts";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/** An address the engine keeps as a website source: http or https only. */
export const isWebAddress = (value: string): boolean => /^https?:\/\//i.test(value);

/** Whether `child` is `folder` or inside it, both absolute. */
export function isInside(child: string, folder: string): boolean {
	const base = folder.endsWith("/") ? folder : `${folder}/`;
	return child === folder || child.startsWith(base);
}

/** The last part of a path: a folder's or file's own name. */
export const baseName = (p: string): string => p.replace(/\/+$/, "").split("/").at(-1) || p;

/** A site's name as a link list shows it when no title was given: the
 *  host without its leading www. */
export const siteName = (url: string): string => {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
};

/** What he typed in the website field, as an address: a missing scheme
 *  reads as https; anything but http or https, or no host, is null. */
export function webAddress(input: string): string | null {
	const typed = input.trim();
	if (!typed) return null;
	try {
		const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
		return url.toString();
	} catch {
		return null;
	}
}

/** Sort the record's sources into folders, websites and files. `locate`
 *  turns a registered path absolute (relative ones sit in the course's
 *  material folder); `isFolder` says whether an absolute path is a folder.
 *  A file inside a linked folder is the folder's, so it is not listed on
 *  its own. Pure. */
export function contextOf(workspace: string, record: unknown, locate: (registered: string) => string, isFolder: (absolute: string) => boolean): CourseContext {
	const r = obj(record);
	const folders: ContextFolder[] = [];
	const websites: ContextWebsite[] = [];
	const loose: (ContextFile & { absolute: string })[] = [];
	for (const [handle, value] of Object.entries(obj(r.sources))) {
		const path = text(obj(value).path);
		if (!path) continue;
		const title = text(obj(value).title);
		if (isWebAddress(path)) {
			websites.push({ handle, url: path, title: title ?? siteName(path) });
			continue;
		}
		const absolute = locate(path);
		if (isFolder(absolute)) folders.push({ handle, path: absolute, title: title ?? baseName(absolute) });
		else loose.push({ handle, path, absolute, title: title ?? baseName(path) });
	}
	const files = loose.filter((f) => !folders.some((d) => isInside(f.absolute, d.path))).map(({ absolute: _absolute, ...file }) => file);
	return { workspace, description: text(r.goal) ?? "", folders, websites, files };
}

/** Every source handle a reference in the record cites: a topic's, the
 *  exam's, a knowledge entry's, a task's or an observation's. The engine
 *  refuses to remove a cited source. Pure. */
export function citedSources(record: unknown): Set<string> {
	const r = obj(record);
	const cited = new Set<string>();
	const take = (item: unknown) => {
		for (const ref of Array.isArray(obj(item).refs) ? (obj(item).refs as unknown[]) : []) {
			const source = text(obj(ref).source);
			if (source) cited.add(source);
		}
	};
	take(r.exam);
	for (const map of [r.topics, r.knowledge, r.tasks, r.observations]) for (const item of Object.values(obj(map))) take(item);
	return cited;
}

/** Every handle the record holds: sources, topics, knowledge entries and
 *  tasks share one namespace. Pure. */
export function takenHandles(record: unknown): Set<string> {
	const r = obj(record);
	return new Set([r.sources, r.topics, r.knowledge, r.tasks].flatMap((m) => Object.keys(obj(m))));
}

/** A free handle for a new source, the engine's way (sources.py
 *  `suggest_handle`): a lowercase slug of its name, at most 48 long,
 *  then -2, -3 on a clash. `kind` leads it so it never reads as an
 *  observation id. Pure. */
export function freeHandle(kind: "folder" | "site", name: string, taken: ReadonlySet<string>): string {
	const slug = name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const stem = `${kind}-${slug || kind}`.slice(0, 48).replace(/[-_]+$/, "");
	let handle = stem;
	for (let n = 2; taken.has(handle); n++) handle = `${stem}-${n}`;
	return handle;
}
