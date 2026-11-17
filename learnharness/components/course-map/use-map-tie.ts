"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CourseMapEdge, TopicHandle } from "@/src/core";
import { chainOf } from "@/components/course-map/topic-map/topic-map-layout";

/** How long the pointer rests on a row (or a card) before the other pane
 *  follows it, so crossing rows on the way to the map does not flip it row
 *  by row. A focus follows at once. One value on every page. */
export const POINT_DWELL_MS = 150;

/** How he points: the pointer rests (after `POINT_DWELL_MS`), or the focus lands (at once). */
export type PointBy = "pointer" | "focus";

/** What he points at, once it holds: a row of the list (its `key`, the
 *  topics it names) or a card on the map (its one topic). */
export interface Pointed {
	from: "list" | "map";
	key: string;
	topics: readonly TopicHandle[];
}

/** What the map draws for a row he points at (`TopicMap`'s `highlight`,
 *  `marked`, `framed`): the topics lit, the rest receding; the card that
 *  glows, the row's first topic; and the topics the camera brings into
 *  view once he rests there. Each null while he points at no row. */
export interface MapLights {
	lit: ReadonlySet<TopicHandle> | null;
	glow: TopicHandle | null;
	framed: ReadonlySet<TopicHandle> | null;
}

export const NO_LIGHTS: MapLights = { lit: null, glow: null, framed: null };

/** The map's lights for what he points at: a row lights its topics, each
 *  with its whole prerequisite chain when `chain` holds the edges to walk.
 *  A card lights itself (the map draws that), so nothing more. Pure. */
export function lightsOf(pointed: Pointed | null, chain: readonly CourseMapEdge[] | null): MapLights {
	if (pointed?.from !== "list" || pointed.topics.length === 0) return NO_LIGHTS;
	const { topics } = pointed;
	return {
		lit: chain ? new Set(topics.flatMap((t) => [...chainOf(t, chain)])) : new Set(topics),
		glow: topics[0]!,
		framed: new Set(topics),
	};
}

/**
 * The tie between a list and the map beside it (spec: course-map/map-tie.md),
 * on every page that has one: Home's Today and its map, the course page's
 * road and its map, the topic page's Builds on and its map. Pointing at or
 * focusing a row lights its topics on the map (`lights`), with their
 * prerequisite chains where the page asks for them (`chain`, the edges to
 * walk; null lights the row's topics alone), makes its first topic's card
 * glow and brings its topics into view; pointing at a card marks its row
 * (`row`). The pointer moves the other pane once it rests
 * (`POINT_DWELL_MS`), arriving or leaving, so a sweep across rows lights
 * only where it stops; a focus moves it at once. Each pane's leaving
 * clears only its own. `onHold` hears what he points at once it holds
 * (Home moves its map to the line's course).
 */
export function useMapTie({ chain = null, onHold }: { chain?: readonly CourseMapEdge[] | null; onHold?: (pointed: Pointed) => void } = {}) {
	const [pointed, setPointed] = useState<Pointed | null>(null);
	// Each pane's one pending change: what the pointer rests on, or its leaving.
	const pending = useRef(new Map<Pointed["from"], ReturnType<typeof setTimeout>>());
	const held = useRef(onHold);
	held.current = onHold;
	useEffect(() => {
		const timers = pending.current;
		return () => timers.forEach(clearTimeout);
	}, []);

	/** He points at `at` in one pane; null, he left it. By pointer it holds
	 *  once he rests there; by focus at once. */
	const point = useCallback((from: Pointed["from"], at: { key: string; topics: readonly TopicHandle[] } | null, by: PointBy = "focus") => {
		clearTimeout(pending.current.get(from));
		pending.current.delete(from);
		const settle = () => {
			pending.current.delete(from);
			if (!at) return setPointed((was) => (was?.from === from ? null : was));
			const now = { from, ...at };
			setPointed(now);
			held.current?.(now);
		};
		if (by === "focus") settle();
		else pending.current.set(from, setTimeout(settle, POINT_DWELL_MS));
	}, []);

	const lights = useMemo(() => lightsOf(pointed, chain), [pointed, chain]);
	return {
		pointed,
		lights,
		/** The row the list marks: the topic of the card he points at on the map. */
		row: pointed?.from === "map" ? (pointed.topics[0] ?? null) : null,
		point,
		/** A topic's row (or card) as the list (or map) reports it: its handle is its key. */
		pointTopic: useCallback((from: Pointed["from"], handle: TopicHandle | null, by?: PointBy) => point(from, handle ? { key: handle, topics: [handle] } : null, by), [point]),
	};
}

