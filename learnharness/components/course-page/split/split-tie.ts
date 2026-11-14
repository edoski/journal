import type { CourseMapEdge, TopicHandle } from "@/src/core";
import { NODE_GAP, NODE_SIZE, chainOf, slackOf, type NodeSize, type TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
import type { CourseGroup, CourseTopic } from "@/components/course-page/course-model";
import type { Tie, TieAnchor } from "@/components/linked-columns/linked-columns";
import { clearShift, tieShifts, type Box as TieBox } from "@/components/linked-columns/tie-route";

/**
 * What ties the split page's two panes (spec: split-course.md): the topic
 * he points at or focuses, and the pane it is in; which groups the list
 * shows; and where the map pane scrolls to. Pure.
 */
export interface Pointed {
	handle: TopicHandle;
	from: "list" | "map";
}

/** The row and node the linked columns tie for the topic he points at, in
 *  either pane: its row in the list and its card on the map. */
export function tieOf(handle: TopicHandle): Tie {
	const id = JSON.stringify(handle);
	return { key: handle, row: `[data-slot="course-topic-row"][data-topic=${id}]`, node: `.react-flow__node[data-id=${id}] [data-slot="course-map-node"]` };
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


/**
 * The map's drawing surface in the map pane, which the map fits whole at
 * `zoom` (the scale `framedCamera` opens the course at), so it never moves
 * its own camera; the pane scrolls the surface instead. On an axis where
 * the course with `room` around it (and `tag` more above and below, the
 * room the map keeps for its "You are here" tag) fits the pane at that
 * scale, the surface is the pane's width, or the course's height from the
 * pane's top, with nothing to scroll; on one it overflows, the course and
 * `slackOf` its node on each side, at that scale. `tied` (the linked
 * columns draw the tie) adds the pane's height above and below, so the
 * pane can bring any topic beside the row pointing at it. Pure.
 */
export function surfaceOf(layout: TopicMapLayout, pane: Size, room: { x: number; y: number }, tag: number, tied = false, zoom = 1): Surface {
	const width = (layout.width + room.x * 2) * zoom;
	const height = (layout.height + (room.y + tag) * 2) * zoom;
	const slack = slackOf(layout.node);
	// With the tie drawn, room above and below so any topic can scroll beside its row (`besideRow`).
	const beside = tied ? pane.height * 2 : 0;
	return {
		width: width > pane.width ? Math.ceil(width + slack.x * 2 * zoom) : pane.width,
		height: (height > pane.height ? Math.ceil(height + slack.y * 2 * zoom) : Math.floor(height)) + beside,
		zoom,
	};
}

/** Where the pane scrolls so the surface shows the course as `camera`
 *  frames it in a frame the pane's size: the map draws the course in the
 *  surface's middle (`boxesOf`). Pure. */
export function scrollOfCamera(layout: TopicMapLayout, surface: Surface, pane: Size, camera: { x: number; y: number }): Scroll {
	const left = (surface.width - layout.width * surface.zoom) / 2 - camera.x;
	const top = (surface.height - layout.height * surface.zoom) / 2 - camera.y;
	const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(0, max), Math.max(0, v)));
	return { left: clamp(left, surface.width - pane.width), top: clamp(top, surface.height - pane.height) };
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

/** What a topic cut at the pane's edge costs against moving one pixel. */
const CUT = 1000;

/**
 * Where the map pane scrolls to show `target`, a topic he points at or
 * reaches: nowhere (null) when it is already clear of the fade; else
 * wholly inside the part the fade leaves clear, with as few other topics
 * as it can cut at the pane's edges (a topic cut where it shows reads as
 * overflow, not as a fade), moving as little as it can. Pure.
 */
export function scrollOn(boxes: ReadonlyMap<TopicHandle, Box>, target: TopicHandle, view: Size & Scroll, surface: Size, fade: { x: number; y: number }): Scroll | null {
	const at = boxes.get(target);
	if (!at) return null;
	const all = [...boxes.values()];
	const maxLeft = Math.max(0, surface.width - view.width);
	const maxTop = Math.max(0, surface.height - view.height);
	const clear = (lo: number, size: number, s: number, span: number, f: number) => lo >= s + f && lo + size <= s + span - f;
	if (clear(at.x, at.width, view.left, view.width, fade.x) && clear(at.y, at.height, view.top, view.height, fade.y)) return null;

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
	const lefts = axis((b) => b.x, (b) => b.width, view.width, fade.x, maxLeft, view.left);
	const tops = axis((b) => b.y, (b) => b.height, view.height, fade.y, maxTop, view.top);

	/** How many topics a view cuts: part of one shows past the fade but the pane's edge cuts it. */
	const cuts = (left: number, top: number) => {
		let count = 0;
		for (const b of all) {
			const showsX = b.x + b.width > left + fade.x && b.x < left + view.width - fade.x;
			const showsY = b.y + b.height > top + fade.y && b.y < top + view.height - fade.y;
			if (showsX && showsY && !(b.x >= left && b.x + b.width <= left + view.width && b.y >= top && b.y + b.height <= top + view.height)) count++;
		}
		return count;
	};

	let best: Scroll = { left: lefts[0]!, top: tops[0]! };
	let bestCost = Infinity;
	for (const left of lefts) {
		for (const top of tops) {
			const cost = cuts(left, top) * CUT + Math.abs(left - view.left) + Math.abs(top - view.top);
			if (cost < bestCost) {
				bestCost = cost;
				best = { left, top };
			}
		}
	}
	return best;
}

/** The current topic's tag over its node: 20px above its left edge, 14 tall. */
const TAG = { above: 20, height: 14 };

/**
 * Where the map pane scrolls so the topic a row points at sits beside that
 * row, when at `at` (where it would scroll to show the topic anyway) the
 * tie's line would have no clear route: the least vertical scroll from
 * there that gives it one, keeping the topic clear of the fade (`tieShifts`,
 * `clearShift`). Null when `at` is already clear or nothing within the
 * pane's reach is. `anchor` is the row's end in the pane's own pixels. Pure.
 */
export function besideRow(
	boxes: ReadonlyMap<TopicHandle, Box>,
	target: TopicHandle,
	anchor: TieAnchor,
	at: Scroll,
	view: Size & { maxTop: number },
	fade: { x: number; y: number },
	/** The topic the map tags "You are here", whose tag the line keeps clear of too. */
	tagged: TopicHandle | null,
): Scroll | null {
	const box = boxes.get(target);
	if (!box) return null;
	const onScreen = (b: Box): TieBox => ({ left: b.x - at.left, top: b.y - at.top, right: b.x + b.width - at.left, bottom: b.y + b.height - at.top });
	const to = onScreen(box);
	const obstacles = [...boxes].flatMap(([handle, b]) => {
		const node = onScreen(b);
		const tag = handle === tagged ? [{ left: node.left, top: node.top - TAG.above, right: node.left + b.width / 2, bottom: node.top - TAG.above + TAG.height }] : [];
		return handle === target ? tag : [node, ...tag];
	});
	// A scroll moves the drawing the other way: up by `dy` is a scroll down by `dy`.
	const reachable = (dy: number) => at.top - dy >= 0 && at.top - dy <= view.maxTop && to.top + dy >= fade.y + TAG.above && to.bottom + dy <= view.height - fade.y;
	const dy = clearShift({ ...anchor, to, obstacles }, tieShifts(anchor.from, to).filter(reachable));
	return dy ? { left: at.left, top: Math.round(at.top - dy) } : null;
}
