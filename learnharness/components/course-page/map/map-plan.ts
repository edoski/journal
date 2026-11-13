import type { CourseMap, TopicHandle } from "@/src/core";
import { LAYER_GAP, type NodeSize, type TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
import type { Fill, Need } from "@/components/course-map/topic-map/topic-standing";
import type { CourseGroup, GroupId } from "@/components/course-page/course-model";

/**
 * The map candidate's pure parts (spec: map-course.md): the legend's
 * counted facts and what it lights, and how the course's map is laid into
 * the window so every title stays at the app's 11px floor: the whole course
 * when it fits, a long path wrapped into columns, and an area that scrolls
 * when the course does not fit. Pure.
 */

/** The mark on the map a legend fact explains: the need line's icon of the
 *  group's most pressing topic, or the pie. */
export type LegendMark = { kind: "need"; need: Need["kind"] } | { kind: "pie"; fill: Fill };

/** One fact of the legend: one of the page's groups, counted, with the mark
 *  it explains and the topics it lights, in the group's order. */
export interface LegendFact {
	id: GroupId;
	count: number;
	/** "7 need you", "1 needs you", "2 learning", "6 not started", "1 on your own". */
	words: string;
	mark: LegendMark;
	topics: ReadonlySet<TopicHandle>;
}

const LEGEND_WORDS: Record<GroupId, (count: number) => string> = {
	"needs-you": (n) => (n === 1 ? "needs you" : "need you"),
	learning: () => "learning",
	"not-started": () => "not started",
	"on-your-own": () => "on your own",
};

/** The pie each group's topics mostly wear: an empty ring, a part, full. */
const GROUP_PIE: Record<Exclude<GroupId, "needs-you">, Fill> = { learning: 0.5, "not-started": 0, "on-your-own": 1 };

/**
 * The legend: the page's four groups, counted, so every topic is in exactly
 * one fact and the counts add up to the course. A group with no topics is
 * left out. "Need you" explains the line under a title, with the icon its
 * most pressing topic wears (a slip's, when the group holds one: the group
 * sorts slips first); the others explain the pie. Pure.
 */
export function legendFacts(groups: readonly CourseGroup[]): LegendFact[] {
	return groups
		.filter((g) => g.topics.length > 0)
		.map((g) => {
			const count = g.topics.length;
			const mark: LegendMark =
				g.id === "needs-you" ? { kind: "need", need: g.topics[0]?.need?.kind ?? "slip" } : { kind: "pie", fill: GROUP_PIE[g.id] };
			return { id: g.id, count, words: `${count} ${LEGEND_WORDS[g.id](count)}`, mark, topics: new Set(g.topics.map((t) => t.topic.handle)) };
		});
}

/** What lights the map: the fact under the pointer, the one holding
 *  keyboard focus, and the one kept lit by a press. */
export interface LegendLight {
	pointed: GroupId | null;
	focused: GroupId | null;
	pinned: GroupId | null;
}

export const NOTHING_LIT: LegendLight = { pointed: null, focused: null, pinned: null };

/** What happens on the legend: the pointer comes or goes; focus arrives
 *  from the keyboard (a fact) or by a click or leaves (null); a fact is
 *  pressed (kept) or pressed again (null); Esc. */
export type LegendEvent = { type: "point" | "focus" | "press"; id: GroupId | null } | { type: "escape" };

/**
 * The legend's light after an event. Pressing a kept fact again, or Esc,
 * lets go of everything it lit, even with focus still on the fact; only
 * keyboard focus lights a fact, so a click leaves nothing lit once the
 * pointer moves away and the fact is let go. Pure.
 */
export function legendLight(state: LegendLight, event: LegendEvent): LegendLight {
	switch (event.type) {
		case "point":
			return { ...state, pointed: event.id };
		case "focus":
			return { ...state, focused: event.id };
		case "press":
			return event.id ? { ...state, pinned: event.id } : { ...state, pinned: null, focused: null };
		case "escape":
			return NOTHING_LIT;
	}
}

/** The fact the map shows lit: the pointer's, then keyboard focus's, then
 *  the kept one. */
export function litFact(state: LegendLight): GroupId | null {
	return state.pointed ?? state.focused ?? state.pinned;
}

/** The room the page gives the topic map around its drawing (its `margin`):
 *  16 across, so wrapped columns sit 32 apart; none down beyond the current
 *  topic's tag room. */
export const MAP_ROOM = { x: 16, y: 0 } as const;
/** The map keeps this much above and below the drawing for the current
 *  topic's tag (TAG_ROOM in topic-map.tsx). */
export const TAG_ROOM = 20;
/** Above and below wrapped columns: where the path runs from one column's
 *  foot to the next column's head, 6 into each, and below it as much room
 *  to the window's foot as a map that does not wrap keeps (the pane's
 *  `pt-3 pb-6`). */
export const WRAP_ROOM = { above: 12, below: 24 } as const;
/** How far into the room above or below the columns a link runs across. */
const LINK_INSET = 6;
/** The least scale the page draws the course at: a node's 13px title stays
 *  at the app's 11px floor (--text-caption). */
export const TEXT_FLOOR_ZOOM = 11 / 13;

export interface Frame {
	width: number;
	height: number;
}

/**
 * How the course's map sits in the window.
 *  - `whole`: every topic shows at `zoom`, nothing scrolls.
 *  - `scroll`: the course is drawn at `zoom`, the floor or more, and is
 *    larger than the area, which scrolls: down only when its width fits,
 *    else both ways.
 * `columns` are the path's topics column by column, read top to bottom,
 * then left to right: one column holding every topic for a map drawn as it
 * is, several for a long path wrapped. `frames` are their sizes.
 */
export interface MapPlan {
	mode: "whole" | "scroll";
	zoom: number;
	columns: readonly (readonly TopicHandle[])[];
	frames: readonly Frame[];
}

/** Whether the course is one path: each layer of its drawing holds one
 *  topic (a chain, or a course with no prerequisites at all). Pure. */
export function isPath(layout: TopicMapLayout): boolean {
	return layout.layers.length > 1 && layout.layers.every((layer) => layer.length === 1);
}

/** A drawing's size with the map's room around it, at full size. */
function roomy(width: number, height: number): Frame {
	return { width: width + MAP_ROOM.x * 2, height: height + (MAP_ROOM.y + TAG_ROOM) * 2 };
}

/** The size of a run of `count` topics drawn as one column, room included. */
function columnSize(count: number, node: NodeSize): Frame {
	return roomy(node.width, count * node.height + (count - 1) * LAYER_GAP);
}

/** `items` cut into runs of `size`, in order. */
function chunk<T>(items: readonly T[], size: number): T[][] {
	const runs: T[][] = [];
	for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
	return runs;
}

interface Option {
	columns: TopicHandle[][];
	/** Each column's size at full size, room included. */
	sizes: Frame[];
	width: number;
	height: number;
	/** The room above and below the columns that does not scale. */
	room: number;
}

/** A path wrapped into `count` columns of equal length but the last. */
function wrapped(path: readonly TopicHandle[], count: number, node: NodeSize): Option {
	const columns = chunk(path, Math.ceil(path.length / count));
	const sizes = columns.map((column) => columnSize(column.length, node));
	return { columns, sizes, width: sizes.reduce((sum, s) => sum + s.width, 0), height: Math.max(...sizes.map((s) => s.height)), room: columns.length > 1 ? WRAP_ROOM.above + WRAP_ROOM.below : 0 };
}

/**
 * How to lay the course's map into an area of `frame` (spec:
 * map-course.md); null with nothing to lay out or no room yet. A drawing
 * that is not one path is drawn as it is; a path may also wrap into
 * columns. Of the ways that show every topic at 11px titles or larger, the
 * largest; at a tie, the fewest columns. If none fits, the way that fits the
 * width with the least to scroll down. If not even the width fits, the
 * drawing at the floor, scrolling both ways. `bleed` is the page's side
 * margin inside the area: the map keeps within it when the whole course
 * fits there, and runs into it only to show more. Pure.
 */
export function mapPlan(layout: TopicMapLayout, frame: Frame, bleed = 0): MapPlan | null {
	if (layout.topics.size === 0 || frame.width <= 0 || frame.height <= 0) return null;
	if (bleed > 0) {
		const inside = mapPlan(layout, { width: frame.width - bleed * 2, height: frame.height });
		return inside?.mode === "whole" ? inside : mapPlan(layout, frame);
	}
	const path = layout.layers.flat();
	const asDrawn: Option = { columns: [path], sizes: [roomy(layout.width, layout.height)], ...roomy(layout.width, layout.height), room: 0 };
	const options = isPath(layout) ? path.map((_, i) => wrapped(path, i + 1, layout.node)).filter((o, i, all) => i === 0 || o.columns.length !== all[i - 1]!.columns.length) : [asDrawn];

	const across = (o: Option) => Math.min(1, frame.width / o.width);
	const fit = (o: Option) => Math.min(across(o), (frame.height - o.room) / o.height);
	const plan = (mode: MapPlan["mode"], o: Option, zoom: number): MapPlan => ({
		mode,
		zoom,
		columns: o.columns,
		frames: o.sizes.map((s) => ({ width: Math.floor(s.width * zoom), height: Math.floor(s.height * zoom) })),
	});

	const whole = options.filter((o) => fit(o) >= TEXT_FLOOR_ZOOM).sort((a, b) => fit(b) - fit(a) || a.columns.length - b.columns.length)[0];
	if (whole) return plan("whole", whole, fit(whole));
	const tall = options
		.filter((o) => across(o) >= TEXT_FLOOR_ZOOM)
		.sort((a, b) => a.height * across(a) + a.room - (b.height * across(b) + b.room) || across(b) - across(a))[0];
	if (tall) return plan("scroll", tall, across(tall));
	return plan("scroll", options[0]!, TEXT_FLOOR_ZOOM);
}

/** A topic's card where the pane draws it, from the top-left of the
 *  columns' row. */
export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Where every topic's card sits in the pane: each column's map shows its
 * drawing whole, centred in its frame at the largest scale that fits with
 * the map's room around it (the topic map's own opening view), and the
 * columns sit side by side under the wrap's room. `layouts` are each
 * column's drawing. Pure.
 */
export function topicBoxes(plan: MapPlan, layouts: readonly TopicMapLayout[]): Map<TopicHandle, Box> {
	const boxes = new Map<TopicHandle, Box>();
	const top = plan.columns.length > 1 ? WRAP_ROOM.above : 0;
	let left = 0;
	plan.frames.forEach((frame, i) => {
		const layout = layouts[i];
		if (!layout) return;
		const size = roomy(layout.width, layout.height);
		const zoom = Math.min(1, frame.width / size.width, frame.height / size.height);
		const x = left + (frame.width - layout.width * zoom) / 2;
		const y = top + (frame.height - layout.height * zoom) / 2;
		for (const placed of layout.topics.values()) boxes.set(placed.handle, { x: x + placed.x * zoom, y: y + placed.y * zoom, width: layout.node.width * zoom, height: layout.node.height * zoom });
		left += frame.width;
	});
	return boxes;
}

/** Where a wrapped path goes on from one column to the next. */
export interface PathLinkRoute {
	/** The column's last topic and the next column's first. */
	from: TopicHandle;
	to: TopicHandle;
	/** The SVG path, in the coordinates of `topicBoxes`. */
	d: string;
}

/** The corners' radius on a link's turns. */
const LINK_TURN = 6;

/**
 * The need between each column's last topic and the next column's first,
 * drawn as one line: down from the foot into the room below the columns,
 * across to the gap between them, up the gap into the room above, across
 * and down into the next column's head. Rounded turns. Pure.
 */
export function pathLinks(plan: MapPlan, boxes: ReadonlyMap<TopicHandle, Box>): PathLinkRoute[] {
	const routes: PathLinkRoute[] = [];
	const r = LINK_TURN;
	const above = WRAP_ROOM.above - LINK_INSET;
	let gap = 0;
	plan.columns.forEach((column, i) => {
		gap += plan.frames[i]!.width;
		const next = plan.columns[i + 1];
		if (!next) return;
		const from = column.at(-1)!;
		const to = next[0]!;
		const foot = boxes.get(from);
		const head = boxes.get(to);
		if (!foot || !head) return;
		const fx = foot.x + foot.width / 2;
		const fy = foot.y + foot.height;
		const hx = head.x + head.width / 2;
		const below = WRAP_ROOM.above + plan.frames[i]!.height + LINK_INSET;
		const d = [
			`M${fx},${fy}`,
			`V${below - r}`,
			`Q${fx},${below} ${fx + r},${below}`,
			`H${gap - r}`,
			`Q${gap},${below} ${gap},${below - r}`,
			`V${above + r}`,
			`Q${gap},${above} ${gap + r},${above}`,
			`H${hx - r}`,
			`Q${hx},${above} ${hx},${above + r}`,
			`V${head.y}`,
		].join(" ");
		routes.push({ from, to, d });
	});
	return routes;
}

/** How far the area scrolls, from its top-left. */
export interface Scroll {
	left: number;
	top: number;
}

/** Room kept between a topic brought into view and the area's edge, clear
 *  of the edge's fade. */
export const REVEAL_ROOM = 32;

/**
 * Where to scroll an area of `view` showing `content` so the boxes show:
 * null when they all show already. Otherwise the boxes centred on each axis
 * where they fit; where they do not, the first box (the group's most
 * pressing topic) at the start, the room off the edge. Never past the
 * content's ends. Pure.
 */
export function scrollToShow(boxes: readonly Box[], at: Scroll, view: Frame, content: Frame): Scroll | null {
	if (boxes.length === 0) return null;
	const left = Math.min(...boxes.map((b) => b.x));
	const top = Math.min(...boxes.map((b) => b.y));
	const right = Math.max(...boxes.map((b) => b.x + b.width));
	const bottom = Math.max(...boxes.map((b) => b.y + b.height));
	const shows = left >= at.left && right <= at.left + view.width && top >= at.top && bottom <= at.top + view.height;
	if (shows) return null;
	const first = boxes[0]!;
	const along = (start: number, end: number, firstStart: number, size: number, max: number) => {
		const want = end - start <= size - REVEAL_ROOM * 2 ? (start + end - size) / 2 : firstStart - REVEAL_ROOM;
		return Math.max(0, Math.min(max, want));
	};
	return {
		left: along(left, right, first.x, view.width, Math.max(0, content.width - view.width)),
		top: along(top, bottom, first.y, view.height, Math.max(0, content.height - view.height)),
	};
}

/** A run of the course's map for one column: its topics, the needs between
 *  them, and the current topic if it is among them. `before` is how many
 *  topics of the path come before it; the caption names the run. Pure. */
export function columnMap(map: CourseMap, column: readonly TopicHandle[], before: number, count: number): CourseMap {
	if (count === 1) return map;
	const inColumn = new Set(column);
	const first = before + 1;
	return {
		...map,
		title: `${map.title}, topics ${first} to ${first + column.length - 1}`,
		topics: map.topics.filter((t) => inColumn.has(t.handle)),
		edges: map.edges.filter((e) => (e.kind === "needs" ? [e.prerequisite, e.topic] : e.pair).every((t) => inColumn.has(t))),
		current: map.current && inColumn.has(map.current) ? map.current : null,
	};
}

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** Where an arrow goes from a topic when the map in its own column has
 *  nowhere to go: Down from a column's last topic to the next column's
 *  first, Up from a first topic to the column before's last, Left and Right
 *  to the topic beside it in the next column (or that column's last).
 *  Null at the path's ends. Pure. */
export function acrossColumns(columns: readonly (readonly TopicHandle[])[], handle: TopicHandle, key: ArrowKey): TopicHandle | null {
	const col = columns.findIndex((c) => c.includes(handle));
	if (col < 0) return null;
	const row = columns[col]!.indexOf(handle);
	const at = (c: number, r: number) => {
		const column = columns[c];
		return column ? (column[Math.min(r, column.length - 1)] ?? null) : null;
	};
	switch (key) {
		case "ArrowDown":
			return row === columns[col]!.length - 1 ? at(col + 1, 0) : null;
		case "ArrowUp":
			return row === 0 ? at(col - 1, Infinity) : null;
		case "ArrowRight":
			return at(col + 1, row);
		case "ArrowLeft":
			return at(col - 1, row);
	}
}
