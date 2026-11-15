/**
 * The lesson digest's pure core. When a lesson finishes, a background agent
 * reads what it taught and fills what the tutor's live saves left out of
 * the course record: topic gaps and notes, topics taught but never marked
 * introduced, course knowledge, and where the open task stopped. This file
 * decides which part of the session the digest reads and turns the agent's
 * answer into one engine `save` patch.
 *
 * The patch only merges by handle and never carries observations: graded
 * answers are saved live, and a second copy would count twice.
 */

import { createHash } from "node:crypto";
import type { ChatRecord, DigestLedger } from "./contracts/chat.ts";
import type { PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh } from "./contracts/plan.ts";
import { sessionMarkdown } from "./session-markdown.ts";
import { sessionModeOf, type LhMessage } from "./native-messages.ts";
import { closedTonight } from "./session-end.ts";
import { duplicateOf, placementRange, type NamedTopic } from "./course-map-build.ts";

/** The part of a session one digest reads. */
export interface DigestWindow {
	/** Messages an earlier digest already read: context only. */
	context: LhMessage[];
	/** Messages this digest carries into the record. */
	fresh: LhMessage[];
	fingerprint: string;
	throughMessageId: string;
}

/** The messages after the last finished digest, or null when they show the
 *  learner nothing new or that exact stretch was already digested. Pure. */
export function digestWindow(messages: readonly LhMessage[], ledger: DigestLedger | undefined): DigestWindow | null {
	const last = ledger?.done.at(-1);
	const cut = last ? messages.findIndex((m) => m.id === last.throughMessageId) + 1 : 0;
	const context = messages.slice(0, cut);
	const fresh = messages.slice(cut);
	if (fresh.length === 0 || sessionMarkdown(fresh, { anchors: false }).trim() === "") return null;
	const fingerprint = createHash("sha256")
		.update(JSON.stringify(fresh.map((m) => [m.id, m.role, "content" in m ? m.content : null])))
		.digest("hex");
	if (ledger?.done.some((d) => d.fingerprint === fingerprint)) return null;
	return { context, fresh, fingerprint, throughMessageId: fresh.at(-1)!.id };
}

/** Whether a session is a lesson the digest reads: it studies a course and
 *  teaches (practice sessions write nothing, as for the graph). */
export function digestible(record: ChatRecord): boolean {
	return !!record.course && sessionModeOf(record.messages, record.kind) !== "practice";
}

/** The lesson finished: the tutor closed it for tonight (`lesson_progress`
 *  with `close: true`) and he has not written since. A turn that ends on a
 *  question waiting for his answer, or in words that only sound final,
 *  leaves it open. */
export function lessonFinished(record: ChatRecord): boolean {
	return digestible(record) && closedTonight(record.messages);
}

/** The step a digest names for what the lesson showed before its plan. */
export const WARM_UP = "warm-up";

/** The steps a digest may speak about: the warm-up and every plan step the
 *  lesson reached; null when the lesson had no plan. Pure. */
export function reachedSteps(tree: PlanTree | undefined, messages: readonly LhMessage[]): string[] | null {
	if (!tree || tree.nodes.length === 0) return null;
	const { current, visited } = derivePlanStatusesLh(tree, messages);
	return [WARM_UP, ...tree.nodes.filter((node) => node.id === current || visited.has(node.id)).map((node) => node.id)];
}

/** Every plan step was reached: the lesson's plan has nothing left. */
export function planFinished(tree: PlanTree | undefined, messages: readonly LhMessage[]): boolean {
	if (!tree || tree.nodes.length === 0) return false;
	const { current, visited } = derivePlanStatusesLh(tree, messages);
	return tree.nodes.every((node) => node.id === current || visited.has(node.id));
}

// ─── the agent's answer ──────────────────────────────────────────────────────

export interface DigestTopic {
	handle: string;
	/** The step whose part of the lesson shows this (see reachedSteps). */
	step: string;
	/** Required for a topic the course does not have yet. */
	title?: string;
	needs?: string[];
	introduced?: boolean;
	/** A testable misconception; null once the lesson showed it resolved. */
	gap?: string | null;
	note?: string;
}

export interface DigestKnowledge {
	/** An existing entry's handle, to replace its text; absent for a new fact. */
	handle?: string;
	text: string;
	topics: string[];
	step: string;
}

export interface DigestSubmit {
	topics: DigestTopic[];
	knowledge: DigestKnowledge[];
	task?: { key: string; step?: string; help?: string; finished?: boolean };
	/** The topic the course path should stand on next. */
	current?: string;
}

/** What the course record holds that the patch is checked against. */
export interface DigestCourseView {
	/** Every course topic in path order, with its judged fields. */
	topics: ReadonlyArray<{ handle: string; title: string; introduced: boolean; gap: string | null; note: string | null }>;
	/** The topic the course path stands on. */
	current: string | null;
	/** Whether this session may move the path: a lesson may; a review, or a
	 *  session working on an open task (a problem sheet), never does, since
	 *  "You are here" moves only when he moves on in the course (round 8: a
	 *  problem sheet's session moved it from Eigenvalues to Rank). Absent
	 *  reads as a lesson. */
	movesPath?: boolean;
	/** The session's own topics (the record's `topics`): a lesson moves the
	 *  path only onto one of them or onto a topic not introduced yet, never
	 *  back onto an older topic it merely touched. Absent allows any. */
	own?: readonly string[];
	/** The open tasks this session holds. */
	tasks: readonly string[];
	/** Whether the lesson's plan has nothing left. */
	planFinished: boolean;
	/** The course's knowledge entries. */
	knowledge: ReadonlyArray<{ handle: string; text: string; topics: readonly string[] }>;
	/** reachedSteps for the lesson. */
	reached: readonly string[] | null;
	/** In a course with arcs; absent in one without, which the digest
	 *  treats exactly as before arcs. */
	arcs?: DigestArcs;
	/** The lesson ended on its close, which marked its topics introduced and
	 *  named their days from the plan after that save. A topic introduced or
	 *  created later would move those days, so the patch does neither. */
	closed?: boolean;
}

/** What a digest reads of a course's arcs. */
export interface DigestArcs {
	/** The arcs in `path.arcs` order. */
	order: ReadonlyArray<{ handle: string; title: string }>;
	/** Each topic's arc. */
	topicArc: Readonly<Record<string, string>>;
	/** The arc of the lesson's own topics, the topic it belongs to first. */
	ownArc: string | null;
	/** The names each topic answers to, for the duplicate check. */
	names: Readonly<Record<string, NamedTopic>>;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The course's arcs from `show --all`, with the arc of the session's own
 *  topics; undefined in a course without arcs. Pure. */
export function digestArcs(record: unknown, ownTopics: readonly string[]): DigestArcs | undefined {
	const r = obj(record);
	const arcs = obj(r.arcs);
	const order = strs(obj(r.path).arcs).flatMap((handle) => (typeof obj(arcs[handle]).title === "string" ? [{ handle, title: obj(arcs[handle]).title as string }] : []));
	if (order.length === 0 || order.length !== Object.keys(arcs).length) return undefined;
	const topics = Object.entries(obj(r.topics));
	const topicArc = Object.fromEntries(topics.flatMap(([k, t]) => (typeof obj(t).arc === "string" ? [[k, obj(t).arc as string]] : [])));
	const names = Object.fromEntries(topics.map(([k, t]) => [k, { ...(typeof obj(t).title === "string" ? { title: obj(t).title as string } : {}), aliases: strs(obj(t).aliases) }]));
	const ownArc = ownTopics.map((k) => topicArc[k]).find((a) => a !== undefined) ?? null;
	return { order, topicArc, ownArc, names };
}

/** The existing topic a new one of the answer duplicates, and whether its
 *  arc is one the new topic could join: the lesson's arc, or an arc no
 *  earlier than its prerequisites. Null in a course without arcs, or when
 *  it has no twin. */
function twinOf(t: DigestTopic, arcs: DigestArcs): { twin: string; within: boolean } | null {
	const twin = duplicateOf({ handle: t.handle, ...(t.title ? { title: t.title } : {}) }, arcs.names);
	if (!twin) return null;
	const handles = arcs.order.map((a) => a.handle);
	const [lo, hi] = placementRange(t.needs ?? [], [], (k) => arcs.topicArc[k], handles);
	const arc = arcs.topicArc[twin];
	const at = arc === undefined ? -1 : handles.indexOf(arc);
	return { twin, within: arc === undefined || arc === arcs.ownArc || (at >= lo && at <= hi) };
}

const proposesNew = (t: DigestTopic, view: DigestCourseView) => validHandle(t.handle) && !view.topics.some((k) => k.handle === t.handle) && !!t.title?.trim();

/** What the agent must resolve before the save, in a course with arcs: a
 *  new topic named like a topic in an arc it could not join, which may be
 *  another topic sharing a name, never folded in silence. Null when there
 *  is nothing. Pure. */
export function digestProblems(submit: DigestSubmit, view: DigestCourseView): string | null {
	const arcs = view.arcs;
	if (!arcs) return null;
	const problems = submit.topics.flatMap((t) => {
		const found = proposesNew(t, view) ? twinOf(t, arcs) : null;
		if (!found || found.within) return [];
		const other = arcs.names[found.twin]?.title ?? found.twin;
		const arc = arcs.order.find((a) => a.handle === arcs.topicArc[found.twin])?.title ?? "";
		return [`${t.handle} ("${t.title}") has the name of the course's topic ${found.twin} ("${other}") in "${arc}": if the lesson taught that topic, use the handle ${found.twin}; if not, give the new topic a title that tells the two apart.`];
	});
	return problems.length > 0 ? problems.join("\n") : null;
}

/** The digest's summary with the arc the engine placed each new topic in
 *  (the receipt's `arcs_placed`): "new topic composition in Derivatives". */
export function placedIn(summary: string, arcsPlaced: Readonly<Record<string, string>>, view: DigestCourseView): string {
	const title = (a: string) => view.arcs?.order.find((x) => x.handle === a)?.title ?? a;
	return Object.entries(arcsPlaced).reduce((s, [topic, arc]) => s.replace(new RegExp(`new topic ${topic}(?=;|$)`), `new topic ${topic} in ${title(arc)}`), summary);
}

const HANDLE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const validHandle = (h: string): boolean => HANDLE.test(h) && !/^o\d+$/.test(h);

/** A knowledge entry's handle, from its text alone, so a repeated digest
 *  merges into the same entry instead of adding one. */
export function knowledgeHandle(text: string): string {
	const slug = text
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/, "");
	const hash = createHash("sha256").update(text.trim()).digest("hex").slice(0, 6);
	return `${slug || "k"}-${hash}`;
}

/** Two knowledge texts say the same words, up to case, spacing and a
 *  closing full stop. */
function sameText(a: string, b: string): boolean {
	const plain = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
	return plain(a) === plain(b);
}

/** The answer with each new topic that duplicates a course topic, in an
 *  arc it could join, read as that topic: the handle, every prerequisite,
 *  knowledge link and `current` naming it. In a course without arcs the
 *  answer is as it came. */
function folded(submit: DigestSubmit, view: DigestCourseView): DigestSubmit {
	const arcs = view.arcs;
	if (!arcs) return submit;
	const twins = new Map(
		submit.topics.flatMap((t) => {
			const found = proposesNew(t, view) ? twinOf(t, arcs) : null;
			return found?.within ? [[t.handle, found.twin] as const] : [];
		}),
	);
	if (twins.size === 0) return submit;
	const h = (k: string) => twins.get(k) ?? k;
	return {
		...submit,
		topics: submit.topics.map((t) => {
			if (!twins.has(t.handle)) return { ...t, ...(t.needs ? { needs: t.needs.map(h) } : {}) };
			const { title: _title, needs: _needs, ...rest } = t;
			return { ...rest, handle: h(t.handle), introduced: t.introduced ?? true };
		}),
		knowledge: submit.knowledge.map((k) => ({ ...k, topics: k.topics.map(h) })),
		...(submit.current ? { current: h(submit.current) } : {}),
	};
}

/** Whether a lesson may move the path onto a topic: one of its own, or one
 *  not introduced yet (moving on in the course), never back onto an older
 *  topic it only touched. Pure. */
function movesOnto(handle: string, view: DigestCourseView): boolean {
	if (!view.own) return true;
	return view.own.includes(handle) || !view.topics.some((t) => t.handle === handle && t.introduced);
}

/** The engine patch for an answer, and one line saying what it changes;
 *  null when it changes nothing. It drops whatever names a step the lesson
 *  did not reach. A topic the course lacks is created only with a title,
 *  and takes its place in the path right after its last prerequisite. A
 *  knowledge entry given by handle is replaced; a new one is added only
 *  when no entry has its text. Pure. */
export function digestChanges(input: DigestSubmit, view: DigestCourseView): { changes: Record<string, unknown>; summary: string } | null {
	const submit = folded(input, view);
	const shown = ({ step }: { step: string }) => view.reached === null || view.reached.includes(step);
	const submitTopics = submit.topics.filter(shown);
	const known = new Map(view.topics.map((t) => [t.handle, t]));
	const order = view.topics.map((t) => t.handle);
	const created = new Set(
		view.closed ? [] : submitTopics.filter((t) => validHandle(t.handle) && !known.has(t.handle) && t.title?.trim()).map((t) => t.handle),
	);
	const exists = (h: string) => known.has(h) || created.has(h);
	const arcs = view.arcs;
	const ownArc = arcs?.ownArc ?? null;
	const ownAt = ownArc === null ? -1 : (arcs?.order.findIndex((a) => a.handle === ownArc) ?? -1);
	const inOwnArc = new Map<string, boolean>();
	/** A new topic joins the lesson's arc when every prerequisite sits no
	 *  later; one that cannot is left to the engine, which places it nearest
	 *  where he is. */
	const joinsOwnArc = (handle: string, seen: ReadonlySet<string> = new Set()): boolean => {
		if (!arcs || ownAt < 0 || seen.has(handle)) return false;
		if (inOwnArc.has(handle)) return inOwnArc.get(handle)!;
		const needs = submitTopics.find((t) => t.handle === handle)?.needs ?? [];
		const ok = needs.every((n) =>
			created.has(n) ? joinsOwnArc(n, new Set([...seen, handle])) : !known.has(n) || arcs.order.findIndex((a) => a.handle === arcs.topicArc[n]) <= ownAt,
		);
		inOwnArc.set(handle, ok);
		return ok;
	};
	const arcTitle = arcs?.order[ownAt]?.title;
	const said: string[] = [];
	const topics: Record<string, Record<string, unknown>> = {};
	for (const t of submitTopics) {
		if (!exists(t.handle)) continue;
		const current = known.get(t.handle);
		const patch: Record<string, unknown> = {};
		if (!current) {
			if (topics[t.handle]) continue;
			const needs = (t.needs ?? []).filter((n) => n !== t.handle && exists(n));
			const joins = joinsOwnArc(t.handle);
			Object.assign(patch, { title: t.title!.trim(), introduced: true, ...(needs.length > 0 ? { needs } : {}), ...(joins ? { arc: ownArc } : {}) });
			order.splice(Math.max(-1, ...needs.map((n) => order.indexOf(n))) + 1, 0, t.handle);
			said.push(joins ? `new topic ${t.handle} in ${arcTitle}` : `new topic ${t.handle}`);
		} else if (t.introduced === true && !current.introduced && !view.closed) {
			patch.introduced = true;
			said.push(`introduced ${t.handle}`);
		}
		const gap = typeof t.gap === "string" ? t.gap.trim() || undefined : t.gap;
		if (typeof gap === "string" && gap !== current?.gap) {
			patch.gap = gap;
			said.push(`gap on ${t.handle}`);
		} else if (gap === null && current?.gap) {
			patch.gap = null;
			said.push(`gap resolved on ${t.handle}`);
		}
		const note = t.note?.trim();
		if (note && note !== current?.note) {
			patch.note = note;
			said.push(`note on ${t.handle}`);
		}
		if (Object.keys(patch).length > 0) topics[t.handle] = { ...topics[t.handle], ...patch };
	}
	const entries = new Map(view.knowledge.map((k) => [k.handle, k]));
	const knowledge: Record<string, { text: string; topics?: string[] }> = {};
	let added = 0;
	for (const k of submit.knowledge.filter(shown)) {
		const text = k.text.trim();
		if (!text) continue;
		const linked = k.topics.filter(exists);
		const entry = k.handle === undefined ? undefined : entries.get(k.handle);
		const sameTopics = linked.length === 0 || (entry && linked.length === entry.topics.length && linked.every((h) => entry.topics.includes(h)));
		if (entry && sameText(text, entry.text) && sameTopics) continue;
		if (!entry && [...view.knowledge, ...Object.values(knowledge)].some((e) => sameText(e.text, text))) continue;
		knowledge[entry?.handle ?? knowledgeHandle(text)] = { text, ...(linked.length > 0 ? { topics: linked } : {}) };
		if (!entry) added++;
	}
	const updated = Object.keys(knowledge).length - added;
	if (added > 0) said.push(`${added} new knowledge ${added === 1 ? "entry" : "entries"}`);
	if (updated > 0) said.push(`${updated} knowledge ${updated === 1 ? "entry" : "entries"} updated`);
	const facts = added + updated;
	const changes: Record<string, unknown> = {};
	if (Object.keys(topics).length > 0) changes.topics = topics;
	if (facts > 0) changes.knowledge = knowledge;
	const task = submit.task;
	if (task && view.tasks.includes(task.key)) {
		const step = task.step?.trim();
		const help = task.help?.trim();
		if (task.finished && view.planFinished) {
			changes.tasks = { [task.key]: null };
			said.push(`task ${task.key} finished`);
		} else if (step || help) {
			changes.tasks = { [task.key]: { ...(step ? { step } : {}), ...(help ? { help } : {}) } };
			said.push(`task ${task.key} step`);
		}
	}
	const path: Record<string, unknown> = {};
	if (view.movesPath !== false && submit.current && submit.current !== view.current && exists(submit.current) && movesOnto(submit.current, view)) {
		path.current = submit.current;
		said.push(`path at ${submit.current}`);
	}
	if (created.size > 0) path.order = order;
	if (Object.keys(path).length > 0) changes.path = path;
	if (Object.keys(changes).length === 0) return null;
	return { changes, summary: said.join("; ") };
}
