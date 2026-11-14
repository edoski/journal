/**
 * The grouping pass's pure core: the only producer that cuts a course into
 * arcs. It runs in two steps, each a fresh agent (agent/subagents/arc-former.ts):
 *
 * 1. The edges. An agent that never sees an arc answers the prerequisite test
 *    for every stored `needs` edge and names the true ones the graph misses.
 *    Its verdicts are applied, or only proposed, as per-topic diffs against
 *    the record as it is at save time, so a need a tutor added meanwhile
 *    stays.
 * 2. The cut. A second agent groups the settled graph into arcs from the
 *    material's units. Its answer has no field for `needs`, and the merge
 *    never sends one: an edge it doubts is kept as a note.
 *
 * The merge forms the arcs in one save and never removes, merges or renames a
 * topic: it only gives untitled topics a title and drops a shared leading
 * label ("GTM:") that the topic's arc now names. The engine holds every
 * structural rule (`save --check`); this file holds only what the app checks
 * of an answer's shape.
 */

import { sameName, validHandle, type MapCourseView, type MapRef } from "./course-map-build.ts";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// ─── the ledger ──────────────────────────────────────────────────────────────

/**
 * Where a course stands with the pass:
 * - `new`: the app created the course after the pass shipped; a live run may form its arcs;
 * - `proposed`: a copy run exists and awaits Edo;
 * - `approved`: Edo approved the copy, and `--apply` formed the arcs;
 * - `formed`: a live run formed the arcs;
 * - `none`: the pass judged the course gets no arcs, with its reason;
 * - `failed`: with its reason.
 *
 * A course with no ledger entry (every course made before the pass, or
 * outside the app: SMM, AIKR, Amoreg) never gets a live run.
 */
export type ArcPassState = "new" | "proposed" | "approved" | "formed" | "none" | "failed";

export interface ArcPassLedger {
	state: ArcPassState;
	at: string;
	/** Live topics when the state was written: a `none` or `failed` course
	 *  is tried again only once this count changes. */
	topics: number;
	/** The record's revision the formation saved. */
	revision?: number;
	/** The copy run's folder, for `proposed` and `approved`. */
	run?: string;
	reason?: string;
	/** His words, for `approved`. */
	approval?: string;
}

/** The engine's `MIN_ARCS` (arc_rules.py): one live arc is the course again. */
const MIN_ARCS = 2;
/** At least two arcs of at least two topics each (R6): below this the pass
 *  says `none` without asking a model. */
export const ARC_PASS_MIN_TOPICS = MIN_ARCS * 2;

/** The topics not left out of the course. Pure. */
export function liveTopics(record: unknown): string[] {
	return Object.entries(obj(obj(record).topics))
		.filter(([, t]) => !text(obj(t).excluded))
		.map(([k]) => k);
}

const hasArcs = (record: unknown) => Object.keys(obj(obj(record).arcs)).length > 0;

/** Whether a live run is due for this course: only a course the app made
 *  (`new`), with no arcs and enough topics; a `none` or `failed` one only
 *  once its topics changed in number. Every other state has had its run.
 *  Pure. */
export function passDue(ledger: ArcPassLedger | undefined, record: unknown): boolean {
	if (!ledger || hasArcs(record)) return false;
	const live = liveTopics(record).length;
	if (live < ARC_PASS_MIN_TOPICS) return false;
	if (ledger.state === "new") return true;
	return (ledger.state === "none" || ledger.state === "failed") && live !== ledger.topics;
}

// ─── step 1: the edges ───────────────────────────────────────────────────────

/** The prerequisite test answered for one stored edge: does `topic` truly need `need`? */
export interface EdgeVerdict {
	topic: string;
	need: string;
	keep: boolean;
	reason: string;
}

/** A true prerequisite the graph misses. */
export interface EdgeAdd {
	topic: string;
	need: string;
	reason: string;
}

export interface EdgeSubmit {
	/** Every stored edge, once. */
	verdicts: EdgeVerdict[];
	add: EdgeAdd[];
}

/** One change the edge step makes or proposes. */
export interface EdgeDiff {
	topic: string;
	need: string;
	change: "drop" | "add";
	reason: string;
}

const edgeKey = (topic: string, need: string) => `${topic}\u0000${need}`;

/** Every stored `needs` edge as `[topic, need]`, excluded topics included. */
export function storedEdges(view: Pick<MapCourseView, "topics">): Array<[string, string]> {
	return Object.entries(view.topics).flatMap(([k, t]) => t.needs.map((n) => [k, n] as [string, string]));
}

/** Whether `needs` has a loop. */
function cyclic(needs: ReadonlyMap<string, readonly string[]>): boolean {
	const state = new Map<string, "open" | "done">();
	const visit = (k: string): boolean => {
		if (state.get(k) === "done") return false;
		if (state.get(k) === "open") return true;
		state.set(k, "open");
		for (const n of needs.get(k) ?? []) if (needs.has(n) && visit(n)) return true;
		state.set(k, "done");
		return false;
	};
	return [...needs.keys()].some(visit);
}

/** What is wrong with an edge answer, for the agent to fix; null when it
 *  can be used. Every stored edge needs one verdict with its reason; an
 *  added edge names two topics, is new, and closes no loop. Pure. */
export function edgeProblems(submit: EdgeSubmit, view: Pick<MapCourseView, "topics">): string | null {
	const problems: string[] = [];
	const stored = new Set(storedEdges(view).map(([t, n]) => edgeKey(t, n)));
	const judged = new Set<string>();
	for (const v of submit.verdicts) {
		const key = edgeKey(v.topic, v.need);
		if (!stored.has(key)) problems.push(`verdicts lists "${v.topic}" needs "${v.need}", which is no stored edge; judge only the edges listed.`);
		else if (judged.has(key)) problems.push(`verdicts lists "${v.topic}" needs "${v.need}" twice; judge each edge once.`);
		judged.add(key);
		if (!v.reason?.trim()) problems.push(`the verdict on "${v.topic}" needs "${v.need}" gives no reason: answer the prerequisite test for it.`);
	}
	const missing = storedEdges(view).filter(([t, n]) => !judged.has(edgeKey(t, n)));
	if (missing.length > 0) problems.push(`no verdict for ${missing.map(([t, n]) => `"${t}" needs "${n}"`).join(", ")}: judge every stored edge.`);
	const added = new Set<string>();
	for (const a of submit.add) {
		const key = edgeKey(a.topic, a.need);
		if (!(a.topic in view.topics) || !(a.need in view.topics)) problems.push(`add names "${a.topic}" needs "${a.need}"; both must be topics of the course.`);
		else if (a.topic === a.need) problems.push(`add says "${a.topic}" needs itself.`);
		else if (stored.has(key)) problems.push(`add lists "${a.topic}" needs "${a.need}", which is stored already; give it a verdict instead.`);
		else if (added.has(key)) problems.push(`add lists "${a.topic}" needs "${a.need}" twice.`);
		added.add(key);
		if (!a.reason?.trim()) problems.push(`the added edge "${a.topic}" needs "${a.need}" gives no reason: say why an exercise on it cannot be done without it.`);
	}
	if (problems.length === 0 && cyclic(settledNeeds(view, edgeDiffs(submit)))) problems.push("the edges you keep and add form a loop; a prerequisite cannot depend on what needs it.");
	return problems.length > 0 ? [...new Set(problems)].join("\n") : null;
}

/** The changes an edge answer makes: each drop, then each add. Pure. */
export function edgeDiffs(submit: EdgeSubmit): EdgeDiff[] {
	return [
		...submit.verdicts.filter((v) => !v.keep).map((v) => ({ topic: v.topic, need: v.need, change: "drop" as const, reason: v.reason.trim() })),
		...submit.add.map((a) => ({ topic: a.topic, need: a.need, change: "add" as const, reason: a.reason.trim() })),
	];
}

/** Every topic's needs once `diffs` are applied to the view's. */
function settledNeeds(view: Pick<MapCourseView, "topics">, diffs: readonly EdgeDiff[]): Map<string, string[]> {
	const needs = new Map(Object.entries(view.topics).map(([k, t]) => [k, [...t.needs]]));
	for (const d of diffs) {
		const list = needs.get(d.topic);
		if (!list || !needs.has(d.need)) continue;
		if (d.change === "drop") needs.set(d.topic, list.filter((n) => n !== d.need));
		else if (!list.includes(d.need)) list.push(d.need);
	}
	return needs;
}

/**
 * The save that applies `diffs` to the record as it is now (`view`, read at
 * save time): each touched topic's needs as stored now, less its drops, plus
 * its adds, so a need added since the agent read the course stays. A drop of
 * an edge already gone, or an add whose topic is gone, is skipped; so is an
 * add that would close a loop with what is stored now. Null when nothing
 * changes. Pure.
 */
export function edgeChanges(diffs: readonly EdgeDiff[], view: Pick<MapCourseView, "topics">): { changes: Json; applied: EdgeDiff[]; skipped: EdgeDiff[] } | null {
	const needs = new Map(Object.entries(view.topics).map(([k, t]) => [k, [...t.needs]]));
	const applied: EdgeDiff[] = [];
	const skipped: EdgeDiff[] = [];
	for (const d of diffs) {
		const list = needs.get(d.topic);
		const present = list?.includes(d.need) ?? false;
		if (!list || !needs.has(d.need) || (d.change === "drop") !== present) {
			skipped.push(d);
			continue;
		}
		const next = d.change === "drop" ? list.filter((n) => n !== d.need) : [...list, d.need];
		const trial = new Map(needs).set(d.topic, next);
		if (d.change === "add" && cyclic(trial)) {
			skipped.push(d);
			continue;
		}
		needs.set(d.topic, next);
		applied.push(d);
	}
	const touched = [...new Set(applied.map((d) => d.topic))];
	if (touched.length === 0) return null;
	return { changes: { topics: Object.fromEntries(touched.map((k) => [k, { needs: needs.get(k)! }])) }, applied, skipped };
}

/** Each proposed edge change read against a cut: an added edge whose
 *  prerequisite sits in a later arc than its topic would point backward, so
 *  accepting it needs a boundary moved first. Pure. */
export function againstCut(diffs: readonly EdgeDiff[], topicArc: Readonly<Record<string, string>>, arcOrder: readonly string[]): Array<EdgeDiff & { arcs: [string, string]; backward: boolean }> {
	return diffs.flatMap((d) => {
		const [a, b] = [topicArc[d.topic], topicArc[d.need]];
		if (a === undefined || b === undefined) return [];
		return [{ ...d, arcs: [a, b] as [string, string], backward: d.change === "add" && arcOrder.indexOf(b) > arcOrder.indexOf(a) }];
	});
}

/** The edge changes in one line, for the formation's reason: "dropped
 *  "riemann-sums" needs "derivative" (…); added …". */
export function edgeWords(diffs: readonly EdgeDiff[]): string {
	return diffs.map((d) => `${d.change === "drop" ? "dropped" : "added"} "${d.topic}" needs "${d.need}" (${d.reason})`).join("; ");
}

// ─── step 2: the cut ─────────────────────────────────────────────────────────

/** One arc of the answer, in order. */
export interface ArcPlan {
	handle: string;
	title: string;
	question: string;
	purpose: string;
	refs?: MapRef[];
	/** Why a one-topic arc stands alone (rules.md, the edge case). */
	single?: string;
	/** Why it shares a unit of the material with another arc. */
	shares?: string;
	/** Its topics, every one exactly once across the answer. */
	topics: string[];
}

export interface ArcSubmit {
	/** Titles, only for topics that have none. */
	titles?: { topic: string; title: string }[];
	arcs: ArcPlan[];
	/** The next exam's arcs, when the material states its scope. */
	examArcs?: string[];
	/** Topics of those arcs the exam leaves out. */
	leavesOut?: string[];
	/** Edges it thinks false: recorded, never applied. */
	doubts?: { topic: string; need: string; reason: string }[];
	/** Why the course gets no arcs (R6), instead of arcs. */
	none?: string;
	/** Where the cut comes from, in one line: the formation's reason. */
	basis: string;
}

/** What the cut reads of the course. */
export interface ArcPassView extends MapCourseView {
	/** The exam's day, when it has one. */
	examDate: string | null;
}

/** The view, from the record and the topics he has studied. */
export function arcPassView(view: MapCourseView, record: unknown): ArcPassView {
	return { ...view, examDate: text(obj(obj(record).exam).date) ?? null };
}

/** A ref's unit of the material: its source and locator. */
const unitOf = (r: MapRef) => (r.locator ? `${r.source} ${r.locator.trim().toLowerCase()}` : null);

/** What is wrong with a cut, for the agent to fix; null when it can go to
 *  the engine's dry run. The engine holds every structural rule; these are
 *  the shape rules only the app can name. Pure. */
export function arcPassProblems(submit: ArcSubmit, view: ArcPassView): string | null {
	const problems: string[] = [];
	const topics = Object.keys(view.topics);
	if (submit.none?.trim()) {
		if (submit.arcs.length > 0) problems.push("none says the course gets no arcs, yet arcs lists some: send one or the other.");
		return problems.length > 0 ? problems.join("\n") : null;
	}
	if (!submit.basis?.trim()) problems.push("basis is empty: say in one line which units of the material the cut follows.");
	if (submit.arcs.length < MIN_ARCS) problems.push(`arcs lists ${submit.arcs.length === 0 ? "none" : "one"}: form at least two, or send none with the reason the course gets no arcs.`);
	const taken = new Set([...topics, ...view.taken, ...view.sources]);
	const handles = new Set<string>();
	const home = new Map<string, string>();
	for (const a of submit.arcs) {
		if (!validHandle(a.handle) || taken.has(a.handle)) problems.push(`arc "${a.handle}" needs a handle no topic, source, task or knowledge entry has: lowercase letters, digits, - or _.`);
		if (handles.has(a.handle)) problems.push(`arc "${a.handle}" is listed twice.`);
		handles.add(a.handle);
		for (const field of ["title", "question", "purpose"] as const) if (!a[field]?.trim()) problems.push(`arc "${a.handle}" has no ${field}.`);
		if (a.topics.length === 0) problems.push(`arc "${a.handle}" holds no topic.`);
		if (a.topics.length === 1 && !a.single?.trim()) {
			problems.push(`arc "${a.handle}" holds one topic: merge it with the neighbour whose question it serves, or say in single why it stands alone (the edge-case rule).`);
		}
		for (const t of a.topics) {
			if (!(t in view.topics)) problems.push(`arc "${a.handle}" lists "${t}", which is no topic of the course.`);
			else if (home.has(t)) problems.push(`"${t}" is in both "${home.get(t)}" and "${a.handle}": give each topic one arc.`);
			else home.set(t, a.handle);
		}
		for (const r of a.refs ?? []) if (!view.sources.includes(r.source)) problems.push(`arc "${a.handle}" cites source "${r.source}"; cite only these: ${view.sources.join(", ")}.`);
		if (view.sources.length > 0 && (a.refs ?? []).length === 0) problems.push(`arc "${a.handle}" cites no unit of the material: give its refs the chapter, section or lecture block it follows.`);
	}
	const unplaced = topics.filter((t) => !home.has(t));
	if (unplaced.length > 0) problems.push(`these topics are in no arc: ${unplaced.join(", ")}. Every topic, left-out ones too, sits in exactly one arc.`);
	const units = new Map<string, string[]>();
	for (const a of submit.arcs) for (const unit of new Set((a.refs ?? []).flatMap((r) => unitOf(r) ?? []))) units.set(unit, [...(units.get(unit) ?? []), a.handle]);
	for (const [unit, arcs] of units) {
		if (arcs.length < 2) continue;
		const silent = arcs.filter((h) => !submit.arcs.find((a) => a.handle === h)?.shares?.trim());
		if (silent.length > 0) problems.push(`arcs ${arcs.join(", ")} each cite "${unit}": two arcs share a unit of the material only with a reason, in shares, on each.`);
	}
	if (submit.examArcs?.length) {
		if (!view.examDate) problems.push("examArcs names the exam's arcs, but the course has no exam date: leave it out.");
		for (const a of submit.examArcs) if (!handles.has(a)) problems.push(`examArcs names "${a}", which is no arc of the answer.`);
	}
	if (submit.leavesOut?.length) {
		if (!submit.examArcs?.length) problems.push("leavesOut needs examArcs: it lists topics of the exam's arcs the exam leaves out, only when the material states such an exam.");
		for (const t of submit.leavesOut) if (!submit.examArcs?.includes(home.get(t) ?? "")) problems.push(`leavesOut lists "${t}", which is in none of examArcs.`);
	}
	for (const t of submit.titles ?? []) {
		if (!(t.topic in view.topics)) problems.push(`titles names "${t.topic}", which is no topic of the course.`);
		else if (view.topics[t.topic]!.title) problems.push(`titles renames "${t.topic}", which has a title: give titles only to topics with none.`);
	}
	const stored = new Set(storedEdges(view).map(([t, n]) => edgeKey(t, n)));
	for (const d of submit.doubts ?? []) if (!stored.has(edgeKey(d.topic, d.need))) problems.push(`doubts names "${d.topic}" needs "${d.need}", which is no stored edge.`);
	return problems.length > 0 ? [...new Set(problems)].join("\n") : null;
}

/** A leading label, as Amoreg's titles carry them ("GTM: Pricing"). */
const LABEL = /^([A-Z][\w-]*):\s+/;

/**
 * The titles that drop a leading label the arc now names (Edo, 14 Nov 2026):
 * a label two or more of the arc's topics share is dropped from each of
 * them. A label one topic carries alone stays ("Railway: deploys"). A title
 * that would be left empty, or would read as another topic's title in the
 * same arc, keeps its label, so the strip never makes two topics of one arc
 * look like one. Topics only change titles; none is merged. Pure.
 */
export function stripPrefixes(arcs: readonly { topics: readonly string[] }[], titleOf: (topic: string) => string | undefined): Record<string, string> {
	const stripped: Record<string, string> = {};
	for (const arc of arcs) {
		const labelled = arc.topics.flatMap((t) => {
			const title = titleOf(t);
			const m = title ? LABEL.exec(title) : null;
			return m ? [{ topic: t, label: m[1]!, rest: title!.slice(m[0].length).trim() }] : [];
		});
		const count = new Map<string, number>();
		for (const l of labelled) count.set(l.label, (count.get(l.label) ?? 0) + 1);
		const after = new Map(arc.topics.map((t) => [t, titleOf(t) ?? ""]));
		for (const l of labelled) if ((count.get(l.label) ?? 0) >= 2 && l.rest) after.set(l.topic, l.rest);
		for (const l of labelled) {
			const title = after.get(l.topic)!;
			if (title === titleOf(l.topic)) continue;
			const twin = arc.topics.some((o) => o !== l.topic && sameName(after.get(o) ?? "", title));
			if (!twin) stripped[l.topic] = title;
		}
	}
	return stripped;
}

/** What a formation save holds, beyond the engine patch. */
export interface Formation {
	changes: Json;
	/** Topics whose label was dropped, with the new title. */
	stripped: Record<string, string>;
	/** Topics of the answer the course no longer has. */
	gone: string[];
	/** Topics the course has that the answer did not place: the engine places them. */
	placedByEngine: string[];
}

/**
 * The engine patch that forms the answer's arcs on the record as it is now
 * (`view`, read at save time). Pure.
 *
 * - `arcs` with each arc's title, question, purpose and refs; `path.arcs` in
 *   the answer's order.
 * - Each topic the answer places and the course still has gets its `arc`.
 *   A topic added since the agent read the course gets none, and the engine
 *   places it.
 * - `path.order` is re-derived arc by arc, each arc's topics in their order
 *   before: a hint the engine's own order agrees with.
 * - Titles only for topics that have none, and the label strip. No `needs`,
 *   ever: an edge the cut doubts goes in its note.
 * - `exam.arcs` and `exam.leaves_out` when the answer states the scope and
 *   the course has an exam date.
 * - `arc_change`: the basis, the edges settled first, and `asked` when his
 *   words are given.
 */
export function arcPassChanges(submit: ArcSubmit, view: ArcPassView, extra: { edges?: string; asked?: string; reason?: string } = {}): Formation | null {
	if (submit.none?.trim()) return null;
	const exists = (t: string) => t in view.topics;
	const arcs = submit.arcs.map((a) => ({ ...a, topics: a.topics.filter(exists) }));
	const gone = [...new Set(submit.arcs.flatMap((a) => a.topics.filter((t) => !exists(t))))];
	const placed = new Set(arcs.flatMap((a) => a.topics));
	const titles = new Map((submit.titles ?? []).filter((t) => exists(t.topic) && !view.topics[t.topic]!.title && t.title.trim()).map((t) => [t.topic, t.title.trim()]));
	const titleOf = (t: string) => titles.get(t) ?? view.topics[t]?.title;
	const stripped = stripPrefixes(arcs, titleOf);
	const sources = new Set(view.sources);
	const topics: Record<string, Json> = {};
	for (const a of arcs) {
		for (const t of a.topics) {
			const title = stripped[t] ?? titles.get(t);
			topics[t] = { ...(title ? { title } : {}), arc: a.handle };
		}
	}
	const index = new Map(view.order.map((t, i) => [t, i]));
	const rank = (t: string) => index.get(t) ?? Number.MAX_SAFE_INTEGER;
	const onPath = (t: string) => index.has(t) || !view.topics[t]!.excluded;
	const order = [
		...arcs.flatMap((a) => [...a.topics].sort((x, y) => rank(x) - rank(y))),
		...Object.keys(view.topics)
			.filter((t) => !placed.has(t))
			.sort((x, y) => rank(x) - rank(y)),
	].filter(onPath);
	const exam: Json = {};
	const handles = arcs.map((a) => a.handle);
	if (view.examDate && submit.examArcs?.length) {
		exam.arcs = handles.filter((h) => submit.examArcs!.includes(h));
		const left = (submit.leavesOut ?? []).filter(exists);
		if (left.length > 0) exam.leaves_out = left;
	}
	const reason = [extra.reason, submit.basis.trim(), extra.edges ? `edges settled first: ${extra.edges}` : ""].filter(Boolean).join("; ");
	const changes: Json = {
		arcs: Object.fromEntries(
			arcs.map((a) => {
				const refs = (a.refs ?? []).filter((r) => sources.has(r.source)).map((r) => (r.locator?.trim() ? { source: r.source, locator: r.locator.trim() } : { source: r.source }));
				return [a.handle, { title: a.title.trim(), question: a.question.trim(), purpose: a.purpose.trim(), ...(refs.length > 0 ? { refs } : {}) }];
			}),
		),
		topics,
		path: { arcs: handles, order },
		...(Object.keys(exam).length > 0 ? { exam } : {}),
		arc_change: { reason, ...(extra.asked ? { asked: extra.asked } : {}) },
	};
	return { changes, stripped, gone, placedByEngine: Object.keys(view.topics).filter((t) => !placed.has(t)) };
}

/** The note a cut's doubts leave in the arc log, saved after the arcs:
 *  each edge it thinks false, kept as it is. Null with none. Pure. */
export function doubtNote(submit: ArcSubmit): Json | null {
	const doubts = (submit.doubts ?? []).filter((d) => d.reason?.trim());
	if (doubts.length === 0) return null;
	return { arc_change: { reason: `prerequisites the grouping pass doubts, kept as they are: ${doubts.map((d) => `"${d.topic}" needs "${d.need}" (${d.reason.trim()})`).join("; ")}` } };
}

/** The formation in one line, for the ledger and the dock: "5 arcs". */
export function formationWords(submit: ArcSubmit): string {
	if (submit.none?.trim()) return `no arcs: ${submit.none.trim()}`;
	return `${submit.arcs.length} arcs: ${submit.arcs.map((a) => a.title.trim()).join(", ")}`;
}
