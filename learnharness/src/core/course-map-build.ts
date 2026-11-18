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
import type { ChatSummary } from "./contracts/chat.ts";

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
	/** The material it could not read, each with why: "notes.pdf (scanned)". */
	unread?: string[];
	/** The notes of a save the engine refused and the builder salvaged:
	 *  arc proposals set aside, and each refused prerequisite. */
	salvaged?: string[];
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

/** One arc of the course, as the record keeps it. */
export interface ViewArc {
	handle: string;
	title: string;
	question: string;
	purpose: string;
	refs: MapRef[];
}

/** Where the learner stands in the arcs, for the builder to keep clear of:
 *  only his words re-cut what he is in. The engine's `arcs` verb says it,
 *  told the app's open lessons (`arcStandingOf`). */
export interface ArcStanding {
	/** Topics with evidence: taught, named by an attempt that stands,
	 *  `path.current`, and the topics of every lesson still open. */
	studied: string[];
	/** Arcs holding a studied topic, plus the current arc. */
	held: string[];
	/** The arc of "You are here" (`arcs.current`). */
	currentArc: string | null;
}

/** The lessons the app has open on a course, which the engine cannot see:
 *  their topics count as studied, and the one in progress says where he is. */
export interface OpenLessons {
	topics: readonly string[];
	/** The topic of the lesson in progress, as `withLessonHere` reads it. */
	here: string | null;
}

export const NO_STANDING: ArcStanding = { studied: [], held: [], currentArc: null };

/** A session he picks up from: it waits on him, the tutor stopped
 *  mid-reply, or he left it for next time (`PICK_UP` in study-facts.ts). */
const openSession = (c: ChatSummary) => c.pendingQuestion || c.pendingProblem || c.ended === "mid-lesson" || c.ended === "cut" || c.ended === "left";

/** The course's open lessons, from the app's session list: every open
 *  lesson's topics, and the topic of the newest session when it is a lesson
 *  still in progress, the topic of it the course has first, as
 *  `withLessonHere` reads it. Pure. */
export function openLessonsOf(chats: readonly ChatSummary[], workspace: string, record: unknown): OpenLessons {
	const topics = obj(obj(record).topics);
	const open = chats.filter((c) => c.course?.workspace === workspace && c.messageCount > 0 && openSession(c));
	return {
		topics: [...new Set(open.flatMap((c) => [...(c.ownTopics ?? []), ...(c.topics ?? [])]))].filter((k) => k in topics),
		here: lessonTopics(chats, workspace).find((k) => k in topics) ?? null,
	};
}

/** The topics of the course's lesson in progress, as `withLessonHere`
 *  reads it: its newest session, when that is a lesson still open and not
 *  left for next time; empty otherwise. Pure. */
export function lessonTopics(chats: readonly ChatSummary[], workspace: string): readonly string[] {
	const newest = chats.filter((c) => c.course?.workspace === workspace && c.messageCount > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
	return newest && newest.kind === "teach" && openSession(newest) && newest.ended !== "left" ? (newest.ownTopics ?? []) : [];
}

/** What the course record holds that a build's patch is merged into. */
export interface MapCourseView extends ArcStanding {
	topics: Record<string, ViewTopic>;
	order: string[];
	basis: string | null;
	exam: { coverage?: string; format?: string };
	/** Every registered source handle. */
	sources: string[];
	/** Handles knowledge entries and tasks hold: a topic cannot take one. */
	taken: string[];
	/** The arcs in `path.arcs` order; empty in a course without arcs. */
	arcs: ViewArc[];
	/** Each topic's arc. */
	topicArc: Record<string, string>;
	/** The next exam's arcs (`exam.arcs`). */
	examArcs: string[];
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

/** The arcs in `path.arcs` order. A bad entry drops the whole list, so the
 *  builder then sees a course without arcs and sends no arc field. Pure. */
function arcsOf(r: Json): ViewArc[] {
	const arcs = obj(r.arcs);
	const order = strs(obj(r.path).arcs);
	const read = order.map((handle) => {
		const a = obj(arcs[handle]);
		const title = text(a.title);
		const question = text(a.question);
		const purpose = text(a.purpose);
		return title && question && purpose ? { handle, title, question, purpose, refs: refsOf(a.refs) } : null;
	});
	return read.length === Object.keys(arcs).length && read.every((a) => a !== null) ? (read as ViewArc[]) : [];
}

/** Where the learner stands, from the engine's `arcs` verb. Pure. */
export function arcStandingOf(json: unknown): ArcStanding {
	const r = obj(json);
	return { studied: strs(r.studied), held: strs(r.held), currentArc: text(r.current_arc) ?? null };
}

/** The view, from the engine's `show --all` (the whole record) and, in a
 *  course with arcs, where he stands (`arcStandingOf`; `NO_STANDING` without
 *  arcs). Required, so a caller cannot forget the arcs he holds. Pure. */
export function courseView(record: unknown, standing: ArcStanding): MapCourseView {
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
	const arcs = arcsOf(r);
	const coverage = text(exam.coverage);
	const format = text(exam.format);
	return {
		topics,
		order: strs(path.order),
		basis: text(path.basis) ?? null,
		exam: { ...(coverage ? { coverage } : {}), ...(format ? { format } : {}) },
		sources: Object.keys(obj(r.sources)),
		taken: [...Object.keys(obj(r.knowledge)), ...Object.keys(obj(r.tasks))],
		arcs,
		topicArc: arcs.length > 0 ? Object.fromEntries(Object.entries(obj(r.topics)).flatMap(([k, t]) => (text(obj(t).arc) ? [[k, text(obj(t).arc)!]] : []))) : {},
		examArcs: arcs.length > 0 ? strs(exam.arcs) : [],
		...(arcs.length > 0 ? standing : NO_STANDING),
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
	/** In a course with arcs: the arc a new topic joins, existing or new;
	 *  absent, the engine places it. */
	arc?: string;
}

/** An arc for a new unit of the material. */
export interface NewArc {
	handle: string;
	title: string;
	question: string;
	purpose: string;
	refs?: MapRef[];
	/** The arc it follows in `path.arcs`. */
	after: string;
	/** The material's heading for the unit. */
	unit: string;
}

/** A topic the material puts in another arc. */
export interface ArcMove {
	topic: string;
	arc: string;
	reason: string;
}

export interface MapSubmit {
	topics: MapTopic[];
	/** Every topic it proposes, in study order. */
	order: string[];
	/** Where the order comes from. */
	basis?: string;
	exam?: { coverage?: string; format?: string };
	/** Sources it could not read, each with why. */
	unread?: { source: string; reason: string }[];
	/** In a course with arcs: arcs for new units of the material. */
	newArcs?: NewArc[];
	/** In a course with arcs: topics to move between arcs he is not in. */
	moves?: ArcMove[];
	/** In a course with arcs: a conflict between the material and the arcs. */
	arcNote?: string;
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

/** What a duplicate check reads of an existing topic. */
export type NamedTopic = { title?: string; aliases: readonly string[] };

/** The names an existing topic answers to: its title, its aliases, and its
 *  handle read as words. */
function namesOf(handle: string, t: NamedTopic): string[] {
	return [t.title ?? "", ...t.aliases, handle.replace(/[-_]+/g, " ")].filter((n) => n.trim());
}

/** The existing topic a new one duplicates by meaning, else null. In a
 *  course with arcs, `within` says whether a twin's arc is one the new
 *  topic could join; a twin outside it is another topic that shares a name
 *  (the same feature in another product's arc), never folded. Pure. */
export function duplicateOf(
	topic: { handle: string; title?: string; aliases?: readonly string[] },
	existing: Readonly<Record<string, NamedTopic>>,
	within: (twin: string) => boolean = () => true,
): string | null {
	if (topic.handle in existing) return null;
	const names = [topic.title ?? "", ...(topic.aliases ?? []), topic.handle.replace(/[-_]+/g, " ")].filter((n) => n.trim());
	for (const [handle, t] of Object.entries(existing)) {
		if (within(handle) && names.some((n) => namesOf(handle, t).some((m) => sameName(n, m)))) return handle;
	}
	return null;
}

// ─── arcs ────────────────────────────────────────────────────────────────────

/** The arc indices a new topic may take, as the engine places it: from the
 *  last arc holding one of its prerequisites to the first arc holding a
 *  topic that needs it. Topics with no arc yet bound nothing. Pure. */
export function placementRange(needs: readonly string[], dependents: readonly string[], arcOf: (topic: string) => string | undefined, arcs: readonly string[]): [number, number] {
	const at = (ks: readonly string[]) => ks.map(arcOf).flatMap((a) => (a !== undefined && arcs.includes(a) ? [arcs.indexOf(a)] : []));
	return [Math.max(0, ...at(needs)), Math.min(arcs.length - 1, ...at(dependents))];
}

/** `path.arcs` with an answer's new arcs spliced in after the arc each
 *  follows, as new topics join `path.order`; a new arc whose `after` names
 *  no arc before it is left out. Pure. */
function arcOrderWith(arcs: readonly string[], fresh: readonly NewArc[]): string[] {
	const order = [...arcs];
	for (const a of fresh) if (!order.includes(a.handle) && order.includes(a.after)) order.splice(order.indexOf(a.after) + 1, 0, a.handle);
	return order;
}

/** Where an answer's topic would sit: its stated arc when it names one, an
 *  existing topic's arc otherwise. */
function answerArcs(submit: MapSubmit, view: MapCourseView, arcs: readonly string[]): (topic: string) => string | undefined {
	const stated = new Map(submit.topics.flatMap((t) => (t.arc && arcs.includes(t.arc) && !(t.handle in view.topics) ? [[t.handle, t.arc] as const] : [])));
	return (k) => view.topicArc[k] ?? stated.get(k);
}

/** Whether an existing topic's arc is one a new topic of the answer could
 *  join: its stated arc, or an arc in its placement range. */
function twinWithin(t: MapTopic, submit: MapSubmit, view: MapCourseView, arcs: readonly string[]): (twin: string) => boolean {
	if (view.arcs.length === 0) return () => true;
	const arcOf = answerArcs(submit, view, arcs);
	const dependents = submit.topics.filter((o) => (o.needs ?? []).includes(t.handle)).map((o) => o.handle);
	const [lo, hi] = placementRange(t.needs ?? [], dependents, arcOf, arcs);
	return (twin) => {
		const arc = view.topicArc[twin];
		if (arc === undefined || arc === t.arc) return true;
		const i = arcs.indexOf(arc);
		return i >= lo && i <= hi;
	};
}

/** Why a move is set aside: it would re-cut what he is in or has studied,
 *  which only his words can ask for. Null when it may go ahead. */
function heldMove(move: ArcMove, view: MapCourseView): string | null {
	const from = view.topicArc[move.topic];
	const title = (a: string | undefined) => view.arcs.find((x) => x.handle === a)?.title ?? a ?? "";
	if (view.studied.includes(move.topic)) return `"${move.topic}" has evidence`;
	if (from && view.held.includes(from)) return `"${title(from)}" is an arc he is in or has studied`;
	if (view.held.includes(move.arc)) return `"${title(move.arc)}" is an arc he is in or has studied`;
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
	const arcs = arcOrderWith(view.arcs.map((a) => a.handle), submit.newArcs ?? []);
	const arcTitle = (a: string | undefined) => view.arcs.find((x) => x.handle === a)?.title ?? submit.newArcs?.find((x) => x.handle === a)?.title ?? a ?? "";
	for (const t of submit.topics) {
		if (!validHandle(t.handle)) problems.push(`"${t.handle}" is not a handle: 1–64 lowercase letters, digits, - or _, starting with a letter or digit, and not o followed by digits.`);
		if (seen.has(t.handle)) problems.push(`"${t.handle}" is listed twice; give each topic once.`);
		seen.add(t.handle);
		if (!t.title?.trim() && !view.topics[t.handle]?.title) problems.push(`${t.handle} has no title.`);
		const twin = duplicateOf(t, view.topics);
		if (twin && !twinWithin(t, submit, view, arcs)(twin)) {
			problems.push(
				`${t.handle} ("${t.title}") has the name of the course's topic ${twin} ("${view.topics[twin]!.title ?? twin}") in "${arcTitle(view.topicArc[twin])}", an arc its prerequisites do not put it in: if it is the same idea, use the handle ${twin} and add only what is new; if not, give it a title that tells the two apart.`,
			);
		} else if (twin) problems.push(`${t.handle} ("${t.title}") is the course's existing topic ${twin} ("${view.topics[twin]!.title ?? twin}"): use the handle ${twin} and add only what is new.`);
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
	const unordered = submit.topics.filter((t) => !(t.handle in view.topics) && !submit.order.includes(t.handle)).map((t) => t.handle);
	if (unordered.length > 0) problems.push(`order leaves out ${unordered.join(", ")}: list every new topic's handle in study order.`);
	if (view.arcs.length > 0) problems.push(...arcProblems(submit, view, arcs));
	return problems.length > 0 ? [...new Set(problems)].join("\n") : null;
}

/** What is wrong with an answer's arcs: a new arc for a new unit only, with
 *  its unit and two of the answer's new topics; arcs named that exist; moves
 *  of course topics only. Moves he must ask for are no problem here: the
 *  merge sets them aside as a note. */
function arcProblems(submit: MapSubmit, view: MapCourseView, arcs: readonly string[]): string[] {
	const problems: string[] = [];
	const existing = new Set(view.arcs.map((a) => a.handle));
	const listed = `the arcs are ${arcs.join(", ")}`;
	const earlier = new Set(existing);
	const topicHandles = new Set([...Object.keys(view.topics), ...submit.topics.map((t) => t.handle), ...view.taken]);
	for (const a of submit.newArcs ?? []) {
		if (existing.has(a.handle)) {
			problems.push(`newArcs lists "${a.handle}", which the course has: never send an arc it has; give its new topics arc "${a.handle}".`);
			continue;
		}
		if (!validHandle(a.handle) || topicHandles.has(a.handle)) problems.push(`new arc "${a.handle}" needs a handle no topic, task, knowledge entry or arc has: lowercase letters, digits, - or _.`);
		for (const field of ["title", "question", "purpose", "unit"] as const) if (!a[field]?.trim()) problems.push(`new arc "${a.handle}" has no ${field}.`);
		if (!earlier.has(a.after)) problems.push(`new arc "${a.handle}" follows "${a.after}", which is no arc listed before it; ${listed}.`);
		earlier.add(a.handle);
		const members = submit.topics.filter((t) => t.arc === a.handle && !(t.handle in view.topics)).length;
		if (members < 2) {
			problems.push(
				`new arc "${a.handle}" holds ${members === 0 ? "none" : "one"} of this answer's new topics: a new arc is for a unit of the material with at least two new topics; give its topics an existing arc, or leave arc out and the engine places them.`,
			);
		}
	}
	for (const t of submit.topics) {
		if (t.arc === undefined) continue;
		if (!arcs.includes(t.arc)) problems.push(`${t.handle} names arc "${t.arc}", which is neither an arc of the course nor in newArcs; ${listed}.`);
		else if (t.handle in view.topics && view.topicArc[t.handle] !== t.arc) problems.push(`${t.handle} is in the course's arc "${view.topicArc[t.handle]}": leave arc out for a topic the course has, or list it under moves.`);
	}
	for (const m of submit.moves ?? []) {
		if (!(m.topic in view.topics)) problems.push(`moves names "${m.topic}", which is no topic of the course; a new topic takes its arc from arc.`);
		else if (!arcs.includes(m.arc)) problems.push(`moves puts ${m.topic} in "${m.arc}", which is no arc; ${listed}.`);
		else if (view.topicArc[m.topic] === m.arc) problems.push(`moves puts ${m.topic} in "${m.arc}", where it is already.`);
		if (!m.reason?.trim()) problems.push(`the move of ${m.topic} has no reason.`);
	}
	return problems;
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
	/** New arcs, for new units of the material. */
	arcs: number;
	/** Topics moved to another arc. */
	moved: number;
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
 *    puts before them; `basis` is set only where none is. `path.current`
 *    is never set: it says where he is, which the engine counts as
 *    studied, and a build knows only the material.
 *  - In a course with arcs: a new topic carries its answer's `arc`, or none
 *    and the engine places it; new arcs are spliced into `path.arcs` after
 *    the arc each follows; an existing arc's texts are never sent; a move
 *    goes ahead only between arcs he is not in, of a topic with no
 *    evidence, and is otherwise kept as a note; `arc_change` says why. In a
 *    course without arcs every arc field of the answer is ignored. */
export function mapChanges(submit: MapSubmit, view: MapCourseView): { changes: Json; counts: MapCounts; summary: string } | null {
	const taken = new Set(view.taken);
	const answerArcOrder = arcOrderWith(view.arcs.map((a) => a.handle), submit.newArcs ?? []);
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
		const twin = duplicateOf(t, kept, twinWithin(t, submit, view, answerArcOrder));
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
	const counts: MapCounts = { created: 0, extended: 0, needs: 0, contrasts: 0, refs: 0, excluded: 0, arcs: 0, moved: 0 };
	const topics: Record<string, Json> = {};
	const created = new Set(proposed.filter((t) => exists.has(t.handle) && !(t.handle in view.topics)).map((t) => t.handle));
	const fresh = view.arcs.length > 0 ? acceptedArcs(submit.newArcs ?? [], view, proposed, created) : [];
	const arcs = arcOrderWith(view.arcs.map((a) => a.handle), fresh);

	for (const t of proposed) {
		if (!exists.has(t.handle)) continue;
		const old = view.topics[t.handle];
		const patch: Json = {};
		if (!old) {
			patch.title = t.title.trim();
			if (view.arcs.length > 0 && t.arc && arcs.includes(t.arc)) patch.arc = t.arc;
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
	// A topic folded into another names it twice: its first place counts, so what follows is never spliced in there.
	const wanted = [...new Set(submit.order.map(h).filter((k) => exists.has(k)))];
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
	if (!view.basis && submit.basis?.trim()) path.basis = submit.basis.trim();

	const exam: Json = {};
	if (!view.exam.coverage && submit.exam?.coverage?.trim()) exam.coverage = submit.exam.coverage.trim();
	if (!view.exam.format && submit.exam?.format?.trim()) exam.format = submit.exam.format.trim();

	const changes: Json = {};
	const why: string[] = [];
	if (view.arcs.length > 0) {
		const title = (a: string | undefined) => view.arcs.find((x) => x.handle === a)?.title ?? fresh.find((x) => x.handle === a)?.title ?? a ?? "";
		if (fresh.length > 0) {
			changes.arcs = Object.fromEntries(
				fresh.map((a) => [a.handle, { title: a.title.trim(), question: a.question.trim(), purpose: a.purpose.trim(), ...(a.refs?.length ? { refs: a.refs.filter((r) => sources.has(r.source)) } : {}) }]),
			);
			path.arcs = arcs;
			counts.arcs = fresh.length;
			why.push(...fresh.map((a) => `new arc "${a.title.trim()}" for the material's unit "${a.unit.trim()}"`));
		}
		const moved = new Set<string>();
		for (const m of submit.moves ?? []) {
			const from = view.topicArc[m.topic];
			if (!(m.topic in view.topics) || !from || !arcs.includes(m.arc) || from === m.arc || moved.has(m.topic) || !m.reason?.trim()) continue;
			const held = heldMove(m, view);
			if (held) {
				why.push(`kept "${m.topic}" in "${title(from)}", since ${held}; the material puts it in "${title(m.arc)}": ${m.reason.trim()}`);
				continue;
			}
			moved.add(m.topic);
			topics[m.topic] = { ...topics[m.topic], arc: m.arc };
			counts.moved++;
			why.push(`moved "${m.topic}" to "${title(m.arc)}": ${m.reason.trim()}`);
		}
		if (submit.arcNote?.trim()) why.push(submit.arcNote.trim());
	}
	if (Object.keys(topics).length > 0) changes.topics = topics;
	if (Object.keys(path).length > 0) changes.path = path;
	if (Object.keys(exam).length > 0) changes.exam = exam;
	if (why.length > 0) changes.arc_change = { reason: why.join("; ") };
	if (Object.keys(changes).length === 0) return null;
	return { changes, counts, summary: summaryOf(counts) };
}

/** The answer's new arcs the merge takes: a new handle, its texts and unit,
 *  an arc to follow, and at least two of the answer's new topics. */
function acceptedArcs(fresh: readonly NewArc[], view: MapCourseView, proposed: readonly MapTopic[], created: ReadonlySet<string>): NewArc[] {
	const order = new Set(view.arcs.map((a) => a.handle));
	const used = new Set([...order, ...Object.keys(view.topics), ...view.taken, ...proposed.map((t) => t.handle)]);
	const accepted: NewArc[] = [];
	for (const a of fresh) {
		const filled = [a.title, a.question, a.purpose, a.unit].every((x) => x?.trim());
		const members = proposed.filter((t) => created.has(t.handle) && t.arc === a.handle).length;
		if (!validHandle(a.handle) || used.has(a.handle) || !filled || !order.has(a.after) || members < 2) continue;
		accepted.push(a);
		order.add(a.handle);
		used.add(a.handle);
	}
	return accepted;
}

// ─── salvage ─────────────────────────────────────────────────────────────────

/** The answer with its arc proposals set aside: no new arcs, no moves, no
 *  topic's `arc`, so the engine places every new topic. Its note stays. */
export function withoutArcs(submit: MapSubmit): MapSubmit {
	const { newArcs: _newArcs, moves: _moves, ...rest } = submit;
	return { ...rest, topics: submit.topics.map(({ arc: _arc, ...t }) => t) };
}

/** Whether an answer proposes any arc change the engine could refuse. */
export const proposesArcs = (submit: MapSubmit): boolean => (submit.newArcs?.length ?? 0) > 0 || (submit.moves?.length ?? 0) > 0 || submit.topics.some((t) => t.arc !== undefined);

/** Appends a line to the patch's `arc_change` reason. */
export function withArcNote(changes: Json, note: string): Json {
	const reason = text(obj(changes.arc_change).reason);
	return { ...changes, arc_change: { reason: reason ? `${reason}; ${note}` : note } };
}

/** The new prerequisites a refusal names, as `[topic, need]`: the engine's
 *  backward-need refusal ("no topic may need a later arc") and its empty
 *  placement range ("its prerequisite … needs it"). */
function edgesNamed(message: string): Array<[string, string]> {
	const backward = /topics\.([a-z0-9][a-z0-9_-]*)\.needs: "[^"]*" \(in .*?\) needs "([a-z0-9][a-z0-9_-]*)"/.exec(message);
	if (backward) return [[backward[1]!, backward[2]!]];
	const range = /topics\.([a-z0-9][a-z0-9_-]*): its prerequisite "([a-z0-9][a-z0-9_-]*)" sits in .*? and "([a-z0-9][a-z0-9_-]*)" in the earlier/.exec(message);
	return range ? [[range[1]!, range[2]!], [range[3]!, range[1]!]] : [];
}

/**
 * One rung down the salvage ladder for a save the engine refused: the patch
 * without the one new prerequisite the refusal names, and that edge kept in
 * an `arc_change` note so the tutor can raise it. Null when the refusal
 * names no edge this patch adds: nothing more can be dropped. Topics are
 * never dropped, so each rung removes one new edge and the ladder ends
 * within their number. Pure.
 */
export function dropRefusedEdge(changes: Json, refusal: string, view: MapCourseView): { changes: Json; note: string } | null {
	const topics = obj(changes.topics);
	for (const [topic, need] of edgesNamed(refusal)) {
		const patch = obj(topics[topic]);
		const needs = strs(patch.needs);
		const old = view.topics[topic]?.needs ?? [];
		if (!needs.includes(need) || old.includes(need)) continue;
		const kept = needs.filter((n) => n !== need);
		const { needs: _needs, ...rest } = patch;
		const next = kept.length > old.length ? { ...rest, needs: kept } : rest;
		const others = Object.fromEntries(Object.entries(topics).filter(([k]) => k !== topic));
		const note = `proposed need: "${topic}" needs "${need}"; refused: ${refusal}`;
		return { changes: withArcNote({ ...changes, topics: Object.keys(next).length > 0 ? { ...others, [topic]: next } : others }, note), note };
	}
	return null;
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
		c.arcs === 1 ? "a new arc" : c.arcs > 1 ? "new arcs" : "",
		c.moved === 1 ? "a topic moved to another arc" : c.moved > 1 ? "topics moved to other arcs" : "",
	].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : "nothing new";
}
