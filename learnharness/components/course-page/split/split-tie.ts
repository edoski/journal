import type { CourseMapEdge, TopicHandle } from "@/src/core";
import { LAYER_GAP, NODE_GAP, NODE_SIZE, WHOLE_COURSE_ZOOM, chainOf, type NodeSize, type TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
import type { CourseGroup, CourseTopic } from "@/components/course-page/course-model";

/**
 * What ties the split page's two panes (spec: split-course.md): the topic
 * he points at or focuses, and the pane it is in; which groups the list
 * shows; and where the map pane scrolls to. Pure.
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

const waits = (row: CourseTopic) => row.fact?.kind === "your-turn";

/**
 * The groups the left pane shows: the four in their order, an empty one
 * left out so no header reads 0, and every topic a session waits on him
 * for ("Your turn") at the top of Needs you, so Learning holds only the
 * topics he is learning and a full pie never sits under it.
 */
export function shownGroups(groups: readonly CourseGroup[]): CourseGroup[] {
	const waiting = groups.flatMap((g) => g.topics.filter(waits));
	return groups
		.map((g) => {
			const rest = g.topics.filter((row) => !waits(row));
			return { ...g, topics: g.id === "needs-you" ? [...waiting, ...rest] : rest };
		})
		.filter((g) => g.topics.length > 0);
}

/** The topic the map opens on: the first the header's button takes up
 *  that is on the map, else the list's first row. */
export function aimOf(next: readonly TopicHandle[], groups: readonly CourseGroup[], layout: TopicMapLayout): TopicHandle | null {
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

/** The scroll position that brings a row wholly into a pane, moving as
 *  little as it can; null when it is already in view. `room` keeps that
 *  much clear above and below it (the focus ring). */
export function scrollToShow(row: { top: number; height: number }, view: { scrollTop: number; height: number }, room = 0): number | null {
	if (row.top - room < view.scrollTop) return Math.max(0, row.top - room);
	if (row.top + row.height + room > view.scrollTop + view.height) return row.top + row.height + room - view.height;
	return null;
}

export interface Size {
	width: number;
	height: number;
}
export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface Scroll {
	left: number;
	top: number;
}

export interface Surface extends Size {
	/** The scale the map draws the course at on it. */
	zoom: number;
}

/** The empty room the surface keeps past the course's room on an axis the
 *  course overflows: one topic and its gap, so the pane can always scroll
 *  a topic at the course's edge wholly out of view instead of cutting it. */
export function slackOf(node: NodeSize): { x: number; y: number } {
	return { x: node.width + NODE_GAP, y: node.height + LAYER_GAP };
}

/**
 * The map's drawing surface in the map pane, which the map fits whole, so
 * it never moves its own camera; the pane scrolls the surface instead.
 * When the whole course with `room` around it (and `tag` more above and
 * below, the room the map keeps for its "You are here" tag) fits the pane
 * at the map's own floor for a whole course (`WHOLE_COURSE_ZOOM`, 75%) or
 * more, the surface is the pane's width and the course's height at that
 * scale, so it shows whole from the pane's top with nothing to scroll.
 * Else it is the course at 100%, in the surface's middle: on an axis the
 * course overflows, the course and `slackOf` its node on each side; on one it fits,
 * the pane's width, or the course's height from the pane's top. Pure.
 */
export function surfaceOf(layout: TopicMapLayout, pane: Size, room: { x: number; y: number }, tag: number): Surface {
	const width = layout.width + room.x * 2;
	const height = layout.height + (room.y + tag) * 2;
	const slack = slackOf(layout.node);
	const whole = pane.width > 0 && pane.height > 0 ? Math.min(1, pane.width / width, pane.height / height) : 1;
	if (whole >= WHOLE_COURSE_ZOOM && whole < 1) return { width: pane.width, height: Math.floor(height * whole), zoom: whole };
	return {
		width: width > pane.width ? width + slack.x * 2 : pane.width,
		height: height > pane.height ? height + slack.y * 2 : height,
		zoom: 1,
	};
}

/** Every topic's box on that surface: the map draws the course in the
 *  frame's middle at the surface's scale. */
export function boxesOf(layout: TopicMapLayout, surface: Surface): Map<TopicHandle, Box> {
	const { zoom } = surface;
	const left = (surface.width - layout.width * zoom) / 2;
	const top = (surface.height - layout.height * zoom) / 2;
	const boxes = new Map<TopicHandle, Box>();
	for (const [handle, at] of layout.topics) boxes.set(handle, { x: left + at.x * zoom, y: top + at.y * zoom, width: layout.node.width * zoom, height: layout.node.height * zoom });
	return boxes;
}

/**
 * How far the map pane's vignette reaches in from its sides: `least`,
 * unless the pane is too narrow to show two topics side by side clear of
 * that. Then it shows one, and the fade widens until the topics beside it
 * fall wholly inside the fade instead of being cut where they show. Pure.
 */
export function fadeAcross(pane: number, least: number, node: NodeSize = NODE_SIZE): number {
	if (pane <= 0 || pane >= node.width * 2 + NODE_GAP + least * 2) return least;
	return Math.max(least, Math.floor((pane - node.width) / 2 - NODE_GAP));
}

/** What a topic cut at the pane's edge costs, and what a whole topic in
 *  view earns for the opening view, against moving one pixel: a whole
 *  picture first, then the most topics, then the least movement. */
const CUT = 1000;
const WHOLE = 450;

/**
 * Where the map pane scrolls to show `target`: wholly inside the part the
 * fade leaves clear, with as few other topics as it can cut at the pane's
 * edges (a topic cut where it shows reads as overflow, not as a fade).
 * `settle` "near" leaves a target already clear where it is (null) and
 * then moves as little as it can; "centre", for the opening view, then
 * shows as many whole topics as it can, as near the target at the pane's
 * middle as it can. Pure.
 */
export function scrollOn(
	boxes: ReadonlyMap<TopicHandle, Box>,
	target: TopicHandle,
	view: Size & Scroll,
	surface: Size,
	fade: { x: number; y: number },
	settle: "near" | "centre",
): Scroll | null {
	const at = boxes.get(target);
	if (!at) return null;
	const all = [...boxes.values()];
	const maxLeft = Math.max(0, surface.width - view.width);
	const maxTop = Math.max(0, surface.height - view.height);
	const clear = (lo: number, size: number, s: number, span: number, f: number) => lo >= s + f && lo + size <= s + span - f;
	if (settle === "near" && clear(at.x, at.width, view.left, view.width, fade.x) && clear(at.y, at.height, view.top, view.height, fade.y)) return null;

	const from: Scroll =
		settle === "near"
			? { left: view.left, top: view.top }
			: { left: at.x + at.width / 2 - view.width / 2, top: at.y + at.height / 2 - view.height / 2 };

	/** One axis's candidates: each topic's edge just clear of the fade, the
	 *  ends, and where it starts; those that keep the target clear (or, in a
	 *  pane too small for that, wholly in view). */
	const axis = (lo: (b: Box) => number, size: (b: Box) => number, span: number, f: number, max: number, start: number) => {
		const clamp = (s: number) => Math.round(Math.min(max, Math.max(0, s)));
		const options = [...new Set([start, 0, max, ...all.flatMap((b) => [lo(b) - f, lo(b) + size(b) + f - span])].map(clamp))];
		const t0 = lo(at);
		const t1 = t0 + size(at);
		const keepsClear = options.filter((s) => t0 >= s + f && t1 <= s + span - f);
		if (keepsClear.length) return keepsClear;
		const inView = options.filter((s) => t0 >= s && t1 <= s + span);
		return inView.length ? inView : [clamp(start)];
	};
	const lefts = axis((b) => b.x, (b) => b.width, view.width, fade.x, maxLeft, from.left);
	const tops = axis((b) => b.y, (b) => b.height, view.height, fade.y, maxTop, from.top);

	/** What a view costs: a topic is cut when part of it shows past the
	 *  fade but the pane's edge cuts it; one wholly in view earns its place
	 *  when the view opens. */
	const worth = (left: number, top: number) => {
		let cost = 0;
		for (const b of all) {
			const showsX = b.x + b.width > left + fade.x && b.x < left + view.width - fade.x;
			const showsY = b.y + b.height > top + fade.y && b.y < top + view.height - fade.y;
			if (!showsX || !showsY) continue;
			const whole = b.x >= left && b.x + b.width <= left + view.width && b.y >= top && b.y + b.height <= top + view.height;
			cost += whole ? (settle === "centre" ? -WHOLE : 0) : CUT;
		}
		return cost;
	};

	let best: Scroll = { left: lefts[0]!, top: tops[0]! };
	let bestCost = Infinity;
	for (const left of lefts) {
		for (const top of tops) {
			const cost = worth(left, top) + Math.abs(left - from.left) + Math.abs(top - from.top);
			if (cost < bestCost) {
				bestCost = cost;
				best = { left, top };
			}
		}
	}
	return best;
}
