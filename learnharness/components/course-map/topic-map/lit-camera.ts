/**
 * The topic map's camera following the topics a page points at (spec:
 * topic-map.md, Behaviour, `framed`): the course page's pane glide
 * (split-course.md, Pointing) on the map's own camera. Where it goes is the
 * course page's `scrollOn`, given the camera's reach as a surface it
 * scrolls; when it goes is the course page's rest and return.
 */

import type { TopicHandle } from "@/src/core";
import { scrollOn, type Box, type Scroll } from "@/components/course-page/split/split-tie";
import { cardFit, type Camera, type TopicMapLayout } from "./topic-map-layout";

type Frame = { width: number; height: number };
type Room = { x: number; y: number };

/** How long a page rests on what it points at before the camera moves, and
 *  how long it points at nothing before the camera goes home, for Home's
 *  map and the course page alike, so a sweep across rows never sends it there and
 *  back. */
export const REVEAL_DWELL_MS = 120;
export const RETURN_DWELL_MS = 400;

/** The key the framed topics' bounding box goes by among the boxes
 *  `scrollOn` frames, as one more box: no topic's handle is empty. */
const FRAMED = "" as TopicHandle;

/**
 * Where the camera goes to show `lit` whole, clear of the frame's fade:
 * nowhere (null) when they already are; else as `scrollOn` brings a row's
 * topic into the course page's pane, cutting as few other topics at the
 * frame's edge as it can and moving as little as it can, with `here` ("You
 * are here", its tag `tag` px above it) kept clear too when it fits with
 * them. At the camera's scale, or as far out as the lit topics need to fit,
 * never past `minZoom`. `reach` is how far the camera may look past the
 * drawing on each side, in the drawing's units (React Flow's
 * `translateExtent`). Pure.
 */
export function litCamera(
	layout: TopicMapLayout,
	from: Camera,
	lit: readonly TopicHandle[],
	frame: Frame,
	fade: Room,
	reach: Room,
	minZoom: number,
	here: TopicHandle | null = null,
	tag = 0,
): Camera | null {
	const span = spanOf(layout, lit);
	if (!span) return null;
	const fits = Math.min((frame.width - fade.x * 2) / span.width, (frame.height - fade.y * 2) / span.height);
	const zoom = Math.max(minZoom, Math.min(from.zoom, fits));
	// A change of scale keeps the frame's middle where it is.
	const scaled = (v: number, size: number) => size / 2 - ((size / 2 - v) / from.zoom) * zoom;
	const at = { x: scaled(from.x, frame.width), y: scaled(from.y, frame.height) };

	// The camera's reach at this scale as a surface the frame scrolls over; on an axis the reach fits, React Flow
	// holds it in the frame's middle, so the surface is the frame there, with nothing to scroll.
	const extent = { width: (layout.width + reach.x * 2) * zoom, height: (layout.height + reach.y * 2) * zoom };
	const surface = { width: Math.max(frame.width, extent.width), height: Math.max(frame.height, extent.height) };
	const origin = { x: (surface.width - extent.width) / 2 + reach.x * zoom, y: (surface.height - extent.height) / 2 + reach.y * zoom };
	const boxes = new Map<TopicHandle, Box>();
	for (const [handle, p] of layout.topics) boxes.set(handle, { x: origin.x + p.x * zoom, y: origin.y + p.y * zoom, width: layout.node.width * zoom, height: layout.node.height * zoom });
	const clamp = (v: number, max: number) => Math.min(Math.max(0, max), Math.max(0, v));
	const view = { left: clamp(origin.x - at.x, surface.width - frame.width), top: clamp(origin.y - at.y, surface.height - frame.height), ...frame };
	// Whole pixels, as the opening view's, so the cards' text stays sharp.
	const cameraOf = (s: Scroll): Camera => ({ x: Math.round(origin.x - s.left), y: Math.round(origin.y - s.top), zoom });

	/** The scroll that frames these topics' bounding box, `above` px more over its top; null when it is already clear. */
	const reveal = (topics: readonly TopicHandle[], above: number) => {
		const box = boundsOf(topics.map((t) => boxes.get(t)!));
		const framed = { ...box, y: box.y - above, height: box.height + above };
		const to = scrollOn(new Map(boxes).set(FRAMED, framed), FRAMED, view, surface, fade);
		const shown = to ?? view;
		const fit = cardFit({ left: framed.x - shown.left, top: framed.y - shown.top, right: framed.x + framed.width - shown.left, bottom: framed.y + framed.height - shown.top }, frame, fade);
		return { to, clear: fit === "clear" };
	};
	const onMap = lit.filter((t) => boxes.has(t));
	const alone = reveal(onMap, 0);
	if (!alone.to) return zoom === from.zoom ? null : cameraOf(view);
	if (here && boxes.has(here) && !onMap.includes(here)) {
		const withHere = reveal([...onMap, here], tag);
		if (withHere.clear && withHere.to) return cameraOf(withHere.to);
	}
	return cameraOf(alone.to);
}

/** The bounding box of some boxes. */
function boundsOf(boxes: readonly Box[]): Box {
	const left = Math.min(...boxes.map((b) => b.x));
	const top = Math.min(...boxes.map((b) => b.y));
	const right = Math.max(...boxes.map((b) => b.x + b.width));
	const bottom = Math.max(...boxes.map((b) => b.y + b.height));
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The drawing's box around the topics of `lit` it holds; null when it holds none. */
function spanOf(layout: TopicMapLayout, lit: readonly TopicHandle[]): Box | null {
	const placed = lit.flatMap((t) => {
		const p = layout.topics.get(t);
		return p ? [{ x: p.x, y: p.y, width: layout.node.width, height: layout.node.height }] : [];
	});
	return placed.length ? boundsOf(placed) : null;
}

/** When the camera moves for what a page points at. */
export interface LitFollow {
	/** The topics the page points at now, or null when it points at none. */
	point: (lit: readonly TopicHandle[] | null) => void;
	/** The camera was moved by him, or placed afresh: it stays where it is until the next point. */
	stay: () => void;
	stop: () => void;
}

/**
 * The course page's rest and return (split-course.md, Pointing): what a
 * page points at moves the camera (`plan`, null to stay) once it rests on
 * it `REVEAL_DWELL_MS`; once it points at nothing for `RETURN_DWELL_MS`
 * after a point, the camera goes `home` (null when it is there). A camera
 * he moved himself (`stay`) stays where he left it until the next point.
 */
export function litFollow({ plan, home, move }: { plan: (lit: readonly TopicHandle[]) => Camera | null; home: () => Camera | null; move: (camera: Camera) => void }): LitFollow {
	/** A point has had the camera since he last moved it, or since it was placed. */
	let pointed = false;
	let wait: ReturnType<typeof setTimeout> | undefined;
	const settle = (lit: readonly TopicHandle[] | null) => {
		if (lit) {
			pointed = true;
			const to = plan(lit);
			if (to) move(to);
			return;
		}
		const to = pointed ? home() : null;
		pointed = false;
		if (to) move(to);
	};
	return {
		point: (lit) => {
			clearTimeout(wait);
			wait = setTimeout(() => settle(lit), lit ? REVEAL_DWELL_MS : RETURN_DWELL_MS);
		},
		stay: () => {
			clearTimeout(wait);
			pointed = false;
		},
		stop: () => clearTimeout(wait),
	};
}
