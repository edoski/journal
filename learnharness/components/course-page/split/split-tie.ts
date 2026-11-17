import type { CourseMapEdge, TopicHandle } from "@/src/core";
import { chainOf, type TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
import type { CourseGroup, CourseTopic, GroupId } from "@/components/course-page/course-model";

/** One section of the list: a group, or an arc of a course with arcs,
 *  whose header the walk stops on, then its Check it when it has one. */
export interface ListSection {
	id: string;
	topics: readonly CourseTopic[];
	/** An arc ready for its check: its line holds Check it. */
	checkable?: boolean;
}

/**
 * What ties the split page's two panes (spec: split-course.md): the topic
 * he points at or focuses, and the pane it is in; which groups the list
 * shows; and where the map opens. Pure.
 */
export interface Pointed {
	handle: TopicHandle;
	from: "list" | "map";
}

/** The topics the map lights for what he points at: a row lights its
 *  topic with its whole prerequisite chain, as a hover on the map does;
 *  a node lights itself (the map draws that), so nothing more. */
export function litOf(pointed: Pointed | null, edges: readonly CourseMapEdge[]): ReadonlySet<TopicHandle> | null {
	return pointed?.from === "list" ? chainOf(pointed.handle, edges) : null;
}

/** The row the list marks for what he points at: a node's topic. */
export function markedOf(pointed: Pointed | null): TopicHandle | null {
	return pointed?.from === "map" ? pointed.handle : null;
}

/** The topic the map brings into view for what he points at: a row's. */
export function revealOf(pointed: Pointed | null): TopicHandle | null {
	return pointed?.from === "list" ? pointed.handle : null;
}

/** The groups the left pane shows: the four in their order, an empty one
 *  left out so no header reads 0. */
export function shownGroups(groups: readonly CourseGroup[]): CourseGroup[] {
	return groups.filter((g) => g.topics.length > 0);
}

/** Which groups show their rows when the page opens (Edo, 14 Nov 2026):
 *  what needs him and what he is learning; Not started and On your own
 *  wait folded under their headers until he opens them, for the visit. */
export const OPEN_AT_FIRST: Readonly<Record<GroupId, boolean>> = { "needs-you": true, learning: true, "not-started": false, "on-your-own": false };

/** One stop of the list's arrow walk: a section's header, an arc's Check
 *  it, or a row. */
export type Stop = { kind: "group"; id: string } | { kind: "check"; id: string } | { kind: "row"; handle: TopicHandle };

/** A stop's key, for the element that takes its focus. */
export const stopKey = (stop: Stop): string => (stop.kind === "row" ? `row:${stop.handle}` : `${stop.kind}:${stop.id}`);

/** What the arrows walk, top to bottom: each section's header, its Check
 *  it when it has one, then its rows while it is open; a folded section's
 *  rows are skipped. */
export function walkStops(sections: readonly ListSection[], open: Readonly<Record<string, boolean>>): Stop[] {
	return sections.flatMap((g): Stop[] => [
		{ kind: "group", id: g.id },
		...(g.checkable ? [{ kind: "check" as const, id: g.id }] : []),
		...(open[g.id] ? g.topics.map((t): Stop => ({ kind: "row", handle: t.topic.handle })) : []),
	]);
}

/** The topic the map opens on, as every course map opens: where he is
 *  ("You are here"), else the first the header's button takes up that is
 *  on the map, else the list's first row. */
export function aimOf(current: TopicHandle | null, next: readonly TopicHandle[], groups: readonly ListSection[], layout: TopicMapLayout): TopicHandle | null {
	if (current && layout.topics.has(current)) return current;
	return next.find((handle) => layout.topics.has(handle)) ?? groups[0]?.topics[0]?.topic.handle ?? null;
}

/** The topic a pointer or focus event on the map is about: the React Flow
 *  node it sits in names its topic in `data-id` (the node's id is the
 *  topic's handle). Null between nodes. */
export function topicAt(target: EventTarget | null): TopicHandle | null {
	const el = target as { closest?: (selector: string) => { getAttribute: (name: string) => string | null } | null } | null;
	const node = el && typeof el.closest === "function" ? el.closest(".react-flow__node") : null;
	return (node?.getAttribute("data-id") as TopicHandle | null | undefined) ?? null;
}

/** Where a key walks the list's rows from row `at` of `count`: Down and
 *  Up step (stopping at the ends), Home and End jump. `at` null is no row
 *  focused yet: Down and Home enter at the first, Up and End at the last.
 *  Null for any other key, or nowhere to go. */
export function walkTo(key: string, at: number | null, count: number): number | null {
	if (count === 0) return null;
	switch (key) {
		case "ArrowDown":
			return at === null ? 0 : at + 1 < count ? at + 1 : null;
		case "ArrowUp":
			return at === null ? count - 1 : at > 0 ? at - 1 : null;
		case "Home":
			return at === 0 ? null : 0;
		case "End":
			return at === count - 1 ? null : count - 1;
		default:
			return null;
	}
}
