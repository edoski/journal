/**
 * The course map builder's pure core. When a course gets material, a
 * background agent reads it and proposes the course's topic map: topics,
 * true prerequisites, competing methods, references, chapters the exam
 * leaves out, and an order. This file decides which material a build reads,
 * checks the agent's answer, and merges it into one engine `save` patch.
 *
 * The merge only adds: handles stay, a title is set only where none is,
 * lists grow and are sent whole, nothing is removed, and observations,
 * tasks, knowledge, levels and reviews are never touched. So a rerun on
 * the same material changes nothing, and a build after new material
 * extends the map in place.
 */

import { createHash } from "node:crypto";

// ─── the ledger ──────────────────────────────────────────────────────────────

/** One registered source as the engine lists it. */
export interface MapSource {
	handle: string;
	path: string;
	title?: string;
}

/** A finished build: the sources it read, and what its save changed. */
export interface CourseMapBuild {
	sources: string[];
	fingerprint: string;
	at: string;
	/** What the save changed, in one line, or why nothing was saved. */
	outcome: string;
}

/** A build that stopped before its save: nothing in the course changed. */
export interface CourseMapFailure {
	sources: string[];
	at: string;
	/** Why, in words the learner reads. */
	reason: string;
}

/** The map builder's ledger for one course. `pending` is written before a
 *  build starts and cleared when it ends, so the app's next start finishes
 *  a build a quit cut short. */
export interface CourseMapLedger {
	done: CourseMapBuild[];
	pending?: { fingerprint: string; sources: string[] };
	/** The latest build that failed, until one succeeds. */
	failed?: CourseMapFailure;
}

/** A source's identity in the ledger: its handle and where it lives, so a
 *  file registered again under the same handle is not read twice. */
const sourceKey = (s: MapSource): string => `${s.handle}\u0000${s.path}`;

export const ledgerSources = (sources: readonly MapSource[]): string[] => sources.map(sourceKey);

/** The material a build reads: every registered source no finished build
 *  read. Null when there is none. Pure. */
export function buildWindow(sources: readonly MapSource[], ledger: CourseMapLedger | undefined): { fresh: MapSource[]; fingerprint: string } | null {
	const read = new Set((ledger?.done ?? []).flatMap((b) => b.sources));
	const fresh = sources.filter((s) => !read.has(sourceKey(s))).sort((a, b) => a.handle.localeCompare(b.handle));
	if (fresh.length === 0) return null;
	const fingerprint = createHash("sha256").update(JSON.stringify(fresh.map(sourceKey))).digest("hex");
	return { fresh, fingerprint };
}

// ─── the course as the build sees it ─────────────────────────────────────────

export interface MapRef {
	source: string;
	locator?: string;
}

export interface ViewTopic {
	title?: string;
	needs: string[];
	contrasts: string[];
	refs: MapRef[];
	aliases: string[];
	excluded?: string;
}

/** What the course record holds that a build's patch is merged into. */
export interface MapCourseView {
	topics: Record<string, ViewTopic>;
	order: string[];
	current: string | null;
	basis: string | null;
	exam: { coverage?: string; format?: string };
	/** Every registered source handle. */
	sources: string[];
	/** Handles knowledge entries and tasks hold: a topic cannot take one. */
	taken: string[];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

function refsOf(v: unknown): MapRef[] {
	return (Array.isArray(v) ? v : []).flatMap((r) => {
		const source = text(obj(r).source);
		const locator = text(obj(r).locator);
		return source ? [{ source, ...(locator ? { locator } : {}) }] : [];
	});
}

/** The view, from the engine's `show --all` (the whole record). Pure. */
export function courseView(record: unknown): MapCourseView {
	const r = obj(record);
	const topics: Record<string, ViewTopic> = {};
	for (const [handle, value] of Object.entries(obj(r.topics))) {
		const t = obj(value);
		const title = text(t.title);
		const excluded = text(t.excluded);
		topics[handle] = {
			...(title ? { title } : {}),
			needs: strs(t.needs),
			contrasts: strs(t.contrasts),
			refs: refsOf(t.refs),
			aliases: strs(t.aliases),
			...(excluded ? { excluded } : {}),
		};
	}
	const path = obj(r.path);
	const exam = obj(r.exam);
	const coverage = text(exam.coverage);
	const format = text(exam.format);
	return {
		topics,
		order: strs(path.order),
		current: text(path.current) ?? null,
		basis: text(path.basis) ?? null,
		exam: { ...(coverage ? { coverage } : {}), ...(format ? { format } : {}) },
		sources: Object.keys(obj(r.sources)),
		taken: [...Object.keys(obj(r.knowledge)), ...Object.keys(obj(r.tasks))],
	};
}

/** The registered sources, from the same record. Pure. */
export function sourcesOf(record: unknown): MapSource[] {
	return Object.entries(obj(obj(record).sources)).flatMap(([handle, value]) => {
		const path = text(obj(value).path);
		const title = text(obj(value).title);
		return path ? [{ handle, path, ...(title ? { title } : {}) }] : [];
	});
}

// ─── the agent's answer ──────────────────────────────────────────────────────

export interface MapTopic {
	handle: string;
	title: string;
	needs?: string[];
	contrasts?: string[];
	refs?: MapRef[];
	aliases?: string[];
	/** Why the exam leaves it out, when the material says so. */
	excluded?: string;
}

export interface MapSubmit {
	topics: MapTopic[];
	/** Every topic it proposes, in study order. */
	order: string[];
	current?: string;
	/** Where the order comes from. */
	basis?: string;
	exam?: { coverage?: string; format?: string };
	/** Sources it could not read, each with why. */
	unread?: { source: string; reason: string }[];
}

// ─── duplicates by meaning ───────────────────────────────────────────────────

/** Words that carry no meaning in a topic's name, in the languages his
 *  courses use (English and Italian). */
const FILLER = new Set(["the", "a", "an", "of", "and", "for", "in", "on", "to", "with", "its", "il", "lo", "la", "i", "gli", "le", "di", "del", "della", "dei", "delle", "e", "per", "con", "un", "una"]);

/** A name's meaningful words: lowercase, accents and math markup dropped,
 *  filler words out, a plural's final s off. */
export function nameWords(name: string): string[] {
	return name
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/\\[a-z]+/g, (m) => ` ${m.slice(1)} `)
		.split(/[^\p{L}\p{N}]+/u)
		.filter((w) => w && !FILLER.has(w))
		.map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Edits between two words, stopping once it passes one. */
function withinOneEdit(a: string, b: string): boolean {
	if (a === b) return true;
	if (Math.abs(a.length - b.length) > 1) return false;
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

/** Two names for the same topic: the same meaningful words in any order,
 *  each word equal or, from five letters up, one typo or inflection apart.
 *  Shorter words must match exactly, so "Type I error" and "Type II
 *  error", or "LU" and "QR", stay apart. */
export function sameName(a: string, b: string): boolean {
	const x = nameWords(a);
	const y = nameWords(b);
	if (x.length === 0 || x.length !== y.length) return false;
	const left = [...y];
	for (const w of x) {
		const i = left.findIndex((v) => v === w || (w.length >= 5 && v.length >= 5 && withinOneEdit(w, v)));
		if (i < 0) return false;
		left.splice(i, 1);
	}
	return true;
}

/** The names an existing topic answers to: its title, its aliases, and its
 *  handle read as words. */
function namesOf(handle: string, t: ViewTopic): string[] {
	return [t.title ?? "", ...t.aliases, handle.replace(/[-_]+/g, " ")].filter((n) => n.trim());
}

/** The existing topic a new one duplicates by meaning, else null. Pure. */
export function duplicateOf(topic: { handle: string; title?: string; aliases?: string[] }, existing: Record<string, ViewTopic>): string | null {
	if (topic.handle in existing) return null;
	const names = [topic.title ?? "", ...(topic.aliases ?? []), topic.handle.replace(/[-_]+/g, " ")].filter((n) => n.trim());
	for (const [handle, t] of Object.entries(existing)) {
		if (names.some((n) => namesOf(handle, t).some((m) => sameName(n, m)))) return handle;
	}
	return null;
}

const HANDLE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const validHandle = (h: string): boolean => HANDLE.test(h) && !/^o\d+$/.test(h);

/** What is wrong with an answer, for the agent to fix before it counts;
 *  null when it can be merged. Pure. */
export function answerProblems(submit: MapSubmit, view: MapCourseView): string | null {
	const problems: string[] = [];
	const proposed = new Set(submit.topics.map((t) => t.handle));
	const known = (h: string) => proposed.has(h) || h in view.topics;
	const sources = new Set(view.sources);
	const seen = new Set<string>();
	for (const t of submit.topics) {
		if (!validHandle(t.handle)) problems.push(`"${t.handle}" is not a handle: 1–64 lowercase letters, digits, - or _, starting with a letter or digit, and not o followed by digits.`);
		if (seen.has(t.handle)) problems.push(`"${t.handle}" is listed twice; give each topic once.`);
		seen.add(t.handle);
		if (!t.title?.trim() && !view.topics[t.handle]?.title) problems.push(`${t.handle} has no title.`);
		const twin = duplicateOf(t, view.topics);
		if (twin) problems.push(`${t.handle} ("${t.title}") is the course's existing topic ${twin} ("${view.topics[twin]!.title ?? twin}"): use the handle ${twin} and add only what is new.`);
		const earlier = submit.topics.slice(0, submit.topics.indexOf(t)).find((o) => o.handle !== t.handle && !(o.handle in view.topics) && !(t.handle in view.topics) && sameName(o.title, t.title));
		if (earlier) problems.push(`${t.handle} and ${earlier.handle} name the same topic ("${t.title}"); give it once.`);
		for (const n of t.needs ?? []) if (!known(n)) problems.push(`${t.handle} needs "${n}", which is neither proposed nor in the course.`);
		for (const c of t.contrasts ?? []) if (!known(c)) problems.push(`${t.handle} contrasts with "${c}", which is neither proposed nor in the course.`);
		for (const ref of t.refs ?? []) {
			if (!sources.has(ref.source)) problems.push(`${t.handle} cites source "${ref.source}"; cite only these registered sources: ${view.sources.join(", ")}.`);
		}
	}
	if (submit.topics.length === 0 && Object.keys(view.topics).length === 0 && (submit.unread ?? []).length === 0) {
		problems.push("No topics: read the material and propose its topics, or list every source you could not read under unread.");
	}
	for (const h of submit.order) if (!known(h)) problems.push(`order lists "${h}", which is neither proposed nor in the course.`);
	if (submit.current && !known(submit.current)) problems.push(`current "${submit.current}" is neither proposed nor in the course.`);
	return problems.length > 0 ? [...new Set(problems)].join("\n") : null;
}

// ─── the merge ───────────────────────────────────────────────────────────────

/** Whether `to` is reachable from `from` along `needs` in `graph`. */
function reaches(graph: Map<string, Set<string>>, from: string, to: string): boolean {
	const seen = new Set<string>();
	const stack = [from];
	while (stack.length > 0) {
		const at = stack.pop()!;
		if (at === to) return true;
		if (seen.has(at)) continue;
		seen.add(at);
		stack.push(...(graph.get(at) ?? []));
	}
	return false;
}

const refKey = (r: MapRef): string => `${r.source}\u0000${r.locator ?? ""}`;

/** What a build's save changes, counted for the learner's line. */
export interface MapCounts {
	created: number;
	extended: number;
	needs: number;
	contrasts: number;
	refs: number;
	excluded: number;
}

/** The engine patch that merges an answer into the course, and what it
 *  changes; null when it changes nothing. Pure.
 *
 *  - A proposed topic the course lacks is created with its title; one it
 *    has keeps its handle and title (a title is set only where none is).
 *  - `needs`, `contrasts`, `refs` and `aliases` only grow, and each list is
 *    sent whole, its other entries kept. A prerequisite that would close a
 *    loop is left out.
 *  - `excluded` is set when the material leaves a topic out, taught or
 *    not (the engine keeps its answers), and never cleared: an exclusion
 *    the learner or the tutor lifted is theirs to set again.
 *  - New topics join `path.order` after the topic the answer's own order
 *    puts before them; `current` and `basis` are set only where none is. */
export function mapChanges(submit: MapSubmit, view: MapCourseView): { changes: Json; counts: MapCounts; summary: string } | null {
	const taken = new Set(view.taken);
	const rename = new Map<string, string>();
	for (const t of submit.topics) {
		if (t.handle in view.topics || !taken.has(t.handle)) continue;
		let n = 2;
		while (taken.has(`${t.handle}-${n}`) || `${t.handle}-${n}` in view.topics) n++;
		rename.set(t.handle, `${t.handle}-${n}`);
	}
	const kept: Record<string, ViewTopic> = { ...view.topics };
	for (const t of submit.topics) {
		if (rename.has(t.handle) || t.handle in view.topics) continue;
		const twin = duplicateOf(t, kept);
		if (twin) rename.set(t.handle, twin);
		else kept[t.handle] = { title: t.title, needs: [], contrasts: [], refs: [], aliases: t.aliases ?? [] };
	}
	const h = (handle: string) => rename.get(handle) ?? handle;
	const byHandle = new Map<string, MapTopic>();
	for (const t of submit.topics) {
		const handle = h(t.handle);
		if (!validHandle(handle)) continue;
		const first = byHandle.get(handle);
		const union = <T>(a: T[] | undefined, b: T[] | undefined) => [...(a ?? []), ...(b ?? [])];
		byHandle.set(
			handle,
			first
				? { ...first, needs: union(first.needs, t.needs), contrasts: union(first.contrasts, t.contrasts), refs: union(first.refs, t.refs), aliases: union(first.aliases, t.aliases), excluded: first.excluded ?? t.excluded }
				: { ...t, handle },
		);
	}
	const proposed = [...byHandle.values()];
	const exists = new Set([...Object.keys(view.topics), ...proposed.filter((t) => t.title?.trim()).map((t) => t.handle)]);
	const sources = new Set(view.sources);
	const graph = new Map<string, Set<string>>(Object.entries(view.topics).map(([k, t]) => [k, new Set(t.needs.filter((n) => n in view.topics))]));
	const pairs = new Set<string>();
	for (const [k, t] of Object.entries(view.topics)) for (const c of t.contrasts) pairs.add([k, c].sort().join("\u0000"));
	const counts: MapCounts = { created: 0, extended: 0, needs: 0, contrasts: 0, refs: 0, excluded: 0 };
	const topics: Record<string, Json> = {};

	for (const t of proposed) {
		if (!exists.has(t.handle)) continue;
		const old = view.topics[t.handle];
		const patch: Json = {};
		if (!old) {
			patch.title = t.title.trim();
			counts.created++;
		} else if (!old.title && t.title?.trim()) {
			patch.title = t.title.trim();
		}
		if (!graph.has(t.handle)) graph.set(t.handle, new Set());
		const needs = [...(old?.needs ?? [])];
		for (const n of (t.needs ?? []).map(h)) {
			if (n === t.handle || !exists.has(n) || needs.includes(n) || reaches(graph, n, t.handle)) continue;
			needs.push(n);
			graph.get(t.handle)!.add(n);
			counts.needs++;
		}
		if (needs.length !== (old?.needs.length ?? 0)) patch.needs = needs;
		const contrasts = [...(old?.contrasts ?? [])];
		for (const c of (t.contrasts ?? []).map(h)) {
			const pair = [t.handle, c].sort().join("\u0000");
			if (c === t.handle || !exists.has(c) || pairs.has(pair)) continue;
			pairs.add(pair);
			contrasts.push(c);
			counts.contrasts++;
		}
		if (contrasts.length !== (old?.contrasts.length ?? 0)) patch.contrasts = contrasts;
		const refs = [...(old?.refs ?? [])];
		const cited = new Set(refs.map(refKey));
		for (const ref of t.refs ?? []) {
			const locator = ref.locator?.trim();
			const clean: MapRef = locator ? { source: ref.source, locator } : { source: ref.source };
			if (!sources.has(ref.source) || cited.has(refKey(clean))) continue;
			cited.add(refKey(clean));
			refs.push(clean);
			counts.refs++;
		}
		if (refs.length !== (old?.refs.length ?? 0)) patch.refs = refs;
		const aliases = [...(old?.aliases ?? [])];
		for (const a of t.aliases ?? []) if (a.trim() && !aliases.includes(a.trim())) aliases.push(a.trim());
		if (aliases.length !== (old?.aliases.length ?? 0)) patch.aliases = aliases;
		if (t.excluded?.trim() && !old?.excluded) {
			patch.excluded = t.excluded.trim();
			counts.excluded++;
		}
		if (Object.keys(patch).length === 0) continue;
		if (old) counts.extended++;
		topics[t.handle] = patch;
	}

	const order = [...view.order];
	const placed = new Set(order);
	const wanted = submit.order.map(h).filter((k) => exists.has(k));
	for (const t of proposed) if (exists.has(t.handle) && !wanted.includes(t.handle)) wanted.push(t.handle);
	for (const [i, k] of wanted.entries()) {
		if (placed.has(k)) continue;
		const before = wanted.slice(0, i).reverse().find((p) => placed.has(p));
		order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, k);
		placed.add(k);
	}
	const isExcluded = (k: string) => !!(view.topics[k]?.excluded ?? topics[k]?.excluded);
	const path: Json = {};
	if (order.length !== view.order.length) path.order = order;
	const current = submit.current ? h(submit.current) : undefined;
	if (!view.current && current && exists.has(current) && !isExcluded(current)) path.current = current;
	else if (!view.current && order.length > 0) path.current = order.find((k) => !isExcluded(k)) ?? order[0];
	if (!view.basis && submit.basis?.trim()) path.basis = submit.basis.trim();

	const exam: Json = {};
	if (!view.exam.coverage && submit.exam?.coverage?.trim()) exam.coverage = submit.exam.coverage.trim();
	if (!view.exam.format && submit.exam?.format?.trim()) exam.format = submit.exam.format.trim();

	const changes: Json = {};
	if (Object.keys(topics).length > 0) changes.topics = topics;
	if (Object.keys(path).length > 0) changes.path = path;
	if (Object.keys(exam).length > 0) changes.exam = exam;
	if (Object.keys(changes).length === 0) return null;
	return { changes, counts, summary: summaryOf(counts) };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The save in one line: "23 new topics, 31 prerequisites, 6 pairs of competing methods". */
export function summaryOf(c: MapCounts): string {
	const parts = [
		c.created > 0 ? plural(c.created, "new topic", "new topics") : "",
		c.extended > 0 ? plural(c.extended, "topic extended", "topics extended") : "",
		c.needs > 0 ? plural(c.needs, "prerequisite", "prerequisites") : "",
		c.contrasts > 0 ? plural(c.contrasts, "pair of competing methods", "pairs of competing methods") : "",
		c.refs > 0 ? plural(c.refs, "reference", "references") : "",
		c.excluded > 0 ? `${plural(c.excluded, "topic", "topics")} left out of the exam` : "",
	].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : "nothing new";
}
