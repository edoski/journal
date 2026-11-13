import type { TopicHandle } from "@/src/core";
import type { TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";

/**
 * Where the brief's map pane looks (spec: brief-course.md): the topic map
 * drawn at full size on a surface as big as the course with its room
 * around it, so the map fits it and never moves its own camera, and the
 * pane scrolls over that surface instead. Pure.
 */

export interface Size {
	width: number;
	height: number;
}

export interface Scroll {
	left: number;
	top: number;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** How far the pane's vignette reaches in from the sides and from the top
 *  and bottom (Home's), which is also the room the map keeps around the
 *  drawing. */
export const FADE = { x: 64, y: 40 };

/** The map's own room above and below for the current topic's tag
 *  (topic-map.md: "plus 20 above and below for the current topic's tag"). */
const TAG_ROOM = 20;

/** The surface the map draws on: the drawing with the map's room around
 *  it, at least as big as the pane, so it fits at 100% (the whole course,
 *  every title at 13px). */
export function surfaceOf(layout: TopicMapLayout, pane: Size): Size {
	return {
		width: Math.max(pane.width, layout.width + FADE.x * 2),
		height: Math.max(pane.height, layout.height + (FADE.y + TAG_ROOM) * 2),
	};
}

/** A topic's box on the surface: the map draws a drawing that fits in the
 *  surface's middle (the topic map's `along`). */
export function boxOf(layout: TopicMapLayout, surface: Size, handle: TopicHandle): Box | null {
	const at = layout.topics.get(handle);
	if (!at) return null;
	const left = (surface.width - layout.width) / 2;
	const top = (surface.height - layout.height) / 2;
	return { x: left + at.x, y: top + at.y, width: layout.node.width, height: layout.node.height };
}

const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(0, max), Math.max(0, value)));

/** The scroll that puts a box at the pane's middle, as near as the
 *  surface's edges allow. */
export function centreOn(box: Box, pane: Size, surface: Size): Scroll {
	return {
		left: clamp(box.x + box.width / 2 - pane.width / 2, surface.width - pane.width),
		top: clamp(box.y + box.height / 2 - pane.height / 2, surface.height - pane.height),
	};
}

/** The least scroll that brings a box clear of the fade, or null when it
 *  already is; a pane too small to clear it centres it instead. */
export function revealIn(box: Box, view: Size & Scroll, surface: Size): Scroll | null {
	const axis = (lo: number, size: number, start: number, span: number, fade: number, max: number) => {
		if (size + fade * 2 > span) return clamp(lo + size / 2 - span / 2, max);
		if (lo < start + fade) return clamp(lo - fade, max);
		if (lo + size > start + span - fade) return clamp(lo + size + fade - span, max);
		return start;
	};
	const left = axis(box.x, box.width, view.left, view.width, FADE.x, surface.width - view.width);
	const top = axis(box.y, box.height, view.top, view.height, FADE.y, surface.height - view.height);
	return left === view.left && top === view.top ? null : { left, top };
}
