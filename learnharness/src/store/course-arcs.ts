/**
 * The arc half of the engine's `map` output, parsed: the arc block whole or
 * not at all, so a topic never vanishes from a partial arc list, and each
 * planned start's reason.
 */

import { isArcState, type ArcHandle, type CourseMapArc } from "../core/contracts/course-arcs.ts";
import type { StartsWhy, TopicHandle } from "../core/contracts/course-map.ts";

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** A map topic as far as its arc goes: its handle, whether the course
 *  leaves it out, and the arc it names. */
export interface ArcMember {
	handle: string;
	excluded: boolean;
	arc: string | null;
}

/** The map's arcs he sees, the engine's arc of "You are here" among them,
 *  and the arc handle a topic or a reason names, when it is one of them;
 *  nothing when the course has no arcs. */
export interface ArcBlock {
	arcs?: CourseMapArc[];
	currentArc?: ArcHandle;
	arcOf: (arc: string | null) => ArcHandle | undefined;
}

const NO_ARCS: ArcBlock = { arcOf: () => undefined };

const warned = new Set<string>();

/** Once per course: an arc block the app cannot read leaves the course
 *  shown as it was before arcs. */
function unreadable(workspace: string, why: string): ArcBlock {
	if (!warned.has(workspace)) {
		warned.add(workspace);
		console.warn(`[course map] ${workspace}: ${why}; showing it without arcs`);
	}
	return NO_ARCS;
}

/** The map's `arcs` and `current_arc` against its parsed topics. Every
 *  arc needs a handle, a title and an engine state, and every topic the
 *  course keeps names a listed arc; otherwise no arcs at all. Hidden arcs
 *  (every topic left out) are dropped, and their topics name none. */
export function arcBlockOf(workspace: string, map: Record<string, unknown>, topics: readonly ArcMember[]): ArcBlock {
	const entries = Array.isArray(map.arcs) ? map.arcs : [];
	if (entries.length === 0) return topics.some((t) => t.arc !== null) ? unreadable(workspace, "its topics name arcs the map does not list") : NO_ARCS;
	const listed = new Set<string>(topics.map((t) => t.handle));
	const all = new Set<string>();
	const shown: CourseMapArc[] = [];
	for (const entry of entries) {
		const e = record(entry);
		const handle = str(e?.arc);
		const title = str(e?.title);
		if (!e || !handle || !title || !isArcState(e.state) || all.has(handle)) return unreadable(workspace, `an arc entry is incomplete or repeated (${handle ?? "no handle"})`);
		all.add(handle);
		if (e.hidden === true) continue;
		shown.push({ handle: handle as ArcHandle, title, state: e.state, entry: strings(e.entry).filter((h) => listed.has(h)) as TopicHandle[] });
	}
	const visible = new Set<string>(shown.map((a) => a.handle));
	const stray = topics.find((t) => !t.excluded && (t.arc === null || !visible.has(t.arc)));
	if (stray) return unreadable(workspace, `topic ${stray.handle} names no arc the map shows`);
	const current = str(map.current_arc);
	return {
		arcs: shown,
		...(current && visible.has(current) ? { currentArc: current as ArcHandle } : {}),
		arcOf: (arc) => (arc !== null && visible.has(arc) ? (arc as ArcHandle) : undefined),
	};
}

/** The engine's `starts_why` for a topic: its arc when the map shows it,
 *  and only topics the map lists. Absent for a kind the app does not know. */
export function startsWhyOf(value: unknown, listed: ReadonlySet<string>, arcOf: ArcBlock["arcOf"]): StartsWhy | undefined {
	const w = record(value);
	if (!w) return undefined;
	const arc = arcOf(str(w.arc));
	const at = arc ? { arc } : {};
	const handles = (v: unknown) => strings(v).filter((h) => listed.has(h)) as TopicHandle[];
	switch (w.kind) {
		case "begun": {
			const then = str(w.then);
			return { kind: "begun", ...at, ...(then ? { then } : {}) };
		}
		case "next":
			return { kind: "next", ...at };
		case "after":
			return { kind: "after", ...at, needs: handles(w.needs), partners: handles(w.partners) };
		case "early":
			return { kind: "early", ...at, waitingOn: handles(w.waiting_on), exam: w.exam === true };
		default:
			return undefined;
	}
}
