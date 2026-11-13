"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import type { CourseMap, TopicHandle } from "@/src/core";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import type { TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
import { mapFade } from "@/components/study-home/map-frame";
import { besideRow, boxesOf, fadeAcross, scrollOn, surfaceOf, topicAt, type Scroll, type Size } from "@/components/course-page/split/split-tie";
import { useTieAnchor } from "@/components/linked-columns/linked-columns";

/** What the page asks of the map: focus a topic's node. */
export interface SplitMapHandle {
	focus: (handle: TopicHandle) => void;
}

/** How far the vignette reaches in from the sides and from the top and
 *  bottom, at the least (`fadeAcross` widens it across a narrow pane). The
 *  map keeps as much room around the course. */
const FADE = { x: 48, y: 32 };
/** The room the map keeps above its drawing for the "You are here" tag
 *  (topic-map.tsx's TAG_ROOM). */
const TAG_ROOM = 20;
/** How long the pane takes to bring a topic he points at into view, and
 *  how long he rests on a row before it moves. */
const GLIDE_MS = 200;
const REVEAL_DWELL_MS = 120;
/** No visible scrollbar on either axis (T3 Code shows none). */
const NO_BAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The split page's right pane (spec: split-course.md): the course's topic
 * map (topic-map.md) on a surface the map fits whole (`surfaceOf`), in a
 * pane that scrolls it with no bar, no outline and no header, its edges
 * faded into the page. The map draws a small course whole at 75% or more
 * and any other at 100%, and never moves its own camera; the pane moves
 * instead, always to a view that cuts as few topics at its edges as it
 * can (`scrollOn`). It opens on `aim`; `reveal` (the row he points at,
 * once he rests on it for 120ms) glides into view in 200ms when it is not
 * already clear of the fade, and so does a node the keyboard reaches.
 * Wheel, trackpad and a drag on the background scroll it. `lit` lights
 * the row's topic and prerequisites. Pointing at or focusing a node tells
 * the page its topic (`onPoint`), so the list marks its row; Escape on a
 * focused node hands the walk back to that row (`onLeave`).
 */
export function SplitMap({
	map,
	layout,
	lit,
	aim,
	reveal,
	onPoint,
	onLeave,
	ref,
}: {
	map: CourseMap;
	/** The map's layout (`layoutTopicMap`), which sizes the surface. */
	layout: TopicMapLayout;
	lit: ReadonlySet<TopicHandle> | null;
	/** The topic the pane opens on. */
	aim: TopicHandle | null;
	/** A topic to bring into view; null moves nothing. */
	reveal: TopicHandle | null;
	onPoint: (handle: TopicHandle | null) => void;
	onLeave: (handle: TopicHandle) => void;
	ref?: Ref<SplitMapHandle>;
}) {
	const root = useRef<HTMLElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const tieAnchor = useTieAnchor();
	const pointed = useRef<TopicHandle | null>(null);
	const glide = useRef(0);
	const [pane, setPane] = useState<Size>({ width: 0, height: 0 });

	const surface = surfaceOf(layout, pane, FADE, TAG_ROOM, tieAnchor !== null);
	const fade = useMemo(() => ({ x: fadeAcross(pane.width, FADE.x, layout.node), y: FADE.y }), [pane.width, layout.node]);
	const boxes = useMemo(() => boxesOf(layout, { width: surface.width, height: surface.height, zoom: surface.zoom }), [layout, surface.width, surface.height, surface.zoom]);

	const point = (handle: TopicHandle | null) => {
		if (handle === pointed.current) return;
		pointed.current = handle;
		onPoint(handle);
	};

	/** Scrolls the pane to show a topic: at once for the opening view, else over 200ms (at once under reduced motion).
	 *  A topic a row points at also comes beside that row when the tie's line would otherwise have no clear route. */
	const show = useCallback(
		(handle: TopicHandle, settle: "near" | "centre") => {
			const el = scroller.current;
			if (!el || el.clientWidth === 0) return;
			const view = { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight };
			let to = scrollOn(boxes, handle, view, { width: el.scrollWidth, height: el.scrollHeight }, fade, settle);
			const anchor = settle === "near" ? tieAnchor?.() : null;
			if (anchor) to = besideRow(boxes, handle, anchor, to ?? view, { ...view, maxTop: el.scrollHeight - el.clientHeight }, fade, map.current) ?? to;
			cancelAnimationFrame(glide.current);
			if (!to) return;
			if (settle === "centre" || reducedMotion()) return el.scrollTo(to);
			const from: Scroll = { left: el.scrollLeft, top: el.scrollTop };
			const start = performance.now();
			const step = (now: number) => {
				const t = Math.min(1, (now - start) / GLIDE_MS);
				const eased = 1 - (1 - t) ** 3;
				el.scrollTo(from.left + (to.left - from.left) * eased, from.top + (to.top - from.top) * eased);
				if (t < 1) glide.current = requestAnimationFrame(step);
			};
			glide.current = requestAnimationFrame(step);
		},
		[boxes, fade, tieAnchor, map.current],
	);

	// The pane's size sets the surface's width and where it opens.
	useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const measure = () => setPane((was) => (was.width === el.clientWidth && was.height === el.clientHeight ? was : { width: el.clientWidth, height: el.clientHeight }));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(glide.current);
		};
	}, []);

	// The pane opens on its aim, and returns to it whenever it grows or shrinks.
	useEffect(() => {
		if (aim && pane.width > 0) show(aim, "centre");
	}, [aim, pane.width, pane.height, show]);

	// A row he rests on for a moment, not one the pointer crosses on its way.
	useEffect(() => {
		if (!reveal) return;
		const wait = setTimeout(() => show(reveal, "near"), REVEAL_DWELL_MS);
		return () => clearTimeout(wait);
	}, [reveal, show]);

	// The wheel and trackpad scroll the pane, not the map (which has nowhere to pan); a pinch stays the map's.
	// A drag on the background scrolls it too; a drag that starts on a topic stays a click.
	useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (e.ctrlKey) return;
			e.stopPropagation();
			cancelAnimationFrame(glide.current);
		};
		let drag: { x: number; y: number; left: number; top: number; id: number } | null = null;
		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0 || e.pointerType === "touch" || (e.target as Element).closest("[data-slot=course-map-node]")) return;
			e.stopPropagation();
			cancelAnimationFrame(glide.current);
			drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
			el.setPointerCapture(e.pointerId);
		};
		const onPointerMove = (e: PointerEvent) => {
			if (drag?.id === e.pointerId) el.scrollTo(drag.left - (e.clientX - drag.x), drag.top - (e.clientY - drag.y));
		};
		const onPointerUp = (e: PointerEvent) => {
			if (drag?.id !== e.pointerId) return;
			drag = null;
			el.releasePointerCapture(e.pointerId);
		};
		el.addEventListener("wheel", onWheel, { capture: true, passive: true });
		el.addEventListener("pointerdown", onPointerDown, { capture: true });
		el.addEventListener("pointermove", onPointerMove);
		el.addEventListener("pointerup", onPointerUp);
		el.addEventListener("pointercancel", onPointerUp);
		return () => {
			el.removeEventListener("wheel", onWheel, { capture: true });
			el.removeEventListener("pointerdown", onPointerDown, { capture: true });
			el.removeEventListener("pointermove", onPointerMove);
			el.removeEventListener("pointerup", onPointerUp);
			el.removeEventListener("pointercancel", onPointerUp);
		};
	}, []);

	useImperativeHandle(
		ref,
		() => ({
			focus: (handle) =>
				root.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(handle)}"] [data-slot=course-map-node]`)?.focus({ preventScroll: true }),
		}),
		[],
	);

	return (
		<section
			ref={root}
			aria-label={`${map.title} map`}
			data-slot="course-split-map"
			className="relative min-h-0 flex-1"
			style={mapFade(fade.x, fade.y)}
			onPointerOver={(e) => point(topicAt(e.target))}
			onPointerLeave={() => point(null)}
			onFocus={(e) => {
				const handle = topicAt(e.target);
				point(handle);
				// The map's own follow has nothing to do on a surface it fits; the pane brings the topic in instead.
				if (handle && (e.target as Element).matches(":focus-visible")) show(handle, "near");
			}}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) point(null);
			}}
			onKeyDown={(e) => {
				const handle = e.key === "Escape" ? topicAt(e.target) : null;
				if (!handle) return;
				e.preventDefault();
				e.stopPropagation();
				onLeave(handle);
			}}
		>
			<div ref={scroller} data-slot="course-split-map-scroller" className={`size-full overflow-auto overscroll-contain ${NO_BAR}`}>
				{/* The surface's size, from the course's layout: the map fits it whole. */}
				<div className="flex flex-col" style={{ width: surface.width, height: surface.height }}>
					<TopicMap map={map} margin={FADE} highlight={lit} />
				</div>
			</div>
		</section>
	);
}
