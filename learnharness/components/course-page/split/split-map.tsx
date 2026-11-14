"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import type { CourseMap, TopicHandle } from "@/src/core";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { framedCamera, type TopicMapLayout } from "@/components/course-map/topic-map/topic-map-layout";
import { mapFade } from "@/components/study-home/map-frame";
import { WholeCourseButton } from "@/components/course-map/topic-map/whole-course-button";
import { boxesOf, fadeAcross, scrollOfCamera, scrollOn, surfaceOf, topicAt, wholeSurfaceOf, type Scroll, type Size } from "@/components/course-page/split/split-tie";

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
/** How long nothing is pointed at before the pane glides back to its
 *  opening view: longer than the pointer takes to cross from one row to the
 *  next, so moving down the list never sends it home and back. */
const RETURN_DWELL_MS = 400;
/** No visible scrollbar on either axis (T3 Code shows none). */
const NO_BAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The split page's right pane (spec: split-course.md): the course's topic
 * map (topic-map.md) on a surface the map fits whole (`surfaceOf`), in a
 * pane that scrolls it with no bar, no outline and no header, its edges
 * faded into the page. It opens as every course map opens (`framedCamera`):
 * the whole course when it fits at 80% or more, else framed on `aim` with
 * its neighbours whole and as few topics cut as it can, at the scale that
 * shows the most. The map never moves its own camera; the pane moves
 * instead, always to a view that cuts as few topics at its edges as it
 * can (`scrollOn`). `reveal` (the row he points at,
 * once he rests on it for 120ms) glides into view in 200ms when it is not
 * already clear of the fade, and so does a node the keyboard reaches; its
 * card glows at once (the map's `marked`).
 * Once nothing is pointed at for 400ms, a pane a row moved glides back to
 * its opening view. When the course opens on less than all of it, the
 * maps' Whole course control (`WholeCourseButton`) sits in the top right
 * corner and swaps the surface for one the whole course fits in the pane.
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
	const pointed = useRef<TopicHandle | null>(null);
	const revealed = useRef<TopicHandle | null>(reveal);
	revealed.current = reveal;
	/** The pane moved off its opening view to show a row he pointed at, and has not been scrolled by him since. */
	const strayed = useRef(false);
	const glide = useRef(0);
	const homing = useRef<ReturnType<typeof setTimeout>>(undefined);
	const [pane, setPane] = useState<Size>({ width: 0, height: 0 });

	const fade = useMemo(() => ({ x: fadeAcross(pane.width, FADE.x, layout.node), y: FADE.y }), [pane.width, layout.node]);
	/** How the course opens in the pane: its scale and where it sits. */
	const opening = useMemo(() => (pane.width > 0 ? framedCamera(layout, aim, pane, fade, TAG_ROOM, "top") : null), [layout, aim, pane, fade]);
	const opened = useMemo(() => surfaceOf(layout, pane, FADE, TAG_ROOM, opening?.zoom), [layout, pane, opening?.zoom]);
	/** The Whole course surface, when the course opens on less than all of it; held for the visit only. */
	const wholeSurface = useMemo(() => (pane.width > 0 ? wholeSurfaceOf(layout, pane, opened, fade, FADE, TAG_ROOM) : null), [layout, pane, opened, fade]);
	const [whole, setWhole] = useState(false);
	const zoomedOut = whole && wholeSurface !== null;
	const surface = zoomedOut ? wholeSurface : opened;
	const boxes = useMemo(() => boxesOf(layout, { width: surface.width, height: surface.height, zoom: surface.zoom }), [layout, surface.width, surface.height, surface.zoom]);

	/** Where the pane rests: the opening view, or the whole course from the top left. */
	const home = useMemo<Scroll | null>(() => (zoomedOut ? { left: 0, top: 0 } : opening ? scrollOfCamera(layout, surface, pane, opening) : null), [zoomedOut, layout, surface, pane, opening]);
	const toggleWhole = useCallback(() => setWhole((w) => !w), []);

	/** Glides the pane over 200ms to `to`, at once under reduced motion. */
	const glideTo = useCallback((to: Scroll) => {
		const el = scroller.current;
		if (!el) return;
		cancelAnimationFrame(glide.current);
		if (reducedMotion()) return el.scrollTo(to);
		const from: Scroll = { left: el.scrollLeft, top: el.scrollTop };
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / GLIDE_MS);
			const eased = 1 - (1 - t) ** 3;
			el.scrollTo(from.left + (to.left - from.left) * eased, from.top + (to.top - from.top) * eased);
			if (t < 1) glide.current = requestAnimationFrame(step);
		};
		glide.current = requestAnimationFrame(step);
	}, []);

	/** Brings a topic he points at or reaches into view, when it is not already clear of the fade. */
	const show = useCallback(
		(handle: TopicHandle) => {
			const el = scroller.current;
			if (!el || el.clientWidth === 0) return false;
			const view = { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight };
			const to = scrollOn(boxes, handle, view, { width: el.scrollWidth, height: el.scrollHeight }, fade);
			cancelAnimationFrame(glide.current);
			if (!to) return false;
			glideTo(to);
			return true;
		},
		[boxes, fade, glideTo],
	);

	/** Once nothing is pointed at in either pane for a moment, a pane a row moved glides back to its opening view. */
	const settle = useCallback(() => {
		clearTimeout(homing.current);
		homing.current = setTimeout(() => {
			if (!strayed.current || revealed.current || pointed.current || !home) return;
			strayed.current = false;
			glideTo(home);
		}, RETURN_DWELL_MS);
	}, [home, glideTo]);

	const point = (handle: TopicHandle | null) => {
		if (handle === pointed.current) return;
		pointed.current = handle;
		onPoint(handle);
		if (!handle) settle();
	};

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
			clearTimeout(homing.current);
		};
	}, []);

	// The pane opens framed on its aim, and returns there whenever it grows or shrinks.
	useEffect(() => {
		const el = scroller.current;
		if (!el || !home) return;
		cancelAnimationFrame(glide.current);
		strayed.current = false;
		el.scrollTo(home);
	}, [home]);

	// A row he rests on for a moment, not one the pointer crosses on its way; once he points at none, the pane goes home.
	useEffect(() => {
		if (!reveal) return settle();
		clearTimeout(homing.current);
		const wait = setTimeout(() => {
			if (show(reveal)) strayed.current = true;
		}, REVEAL_DWELL_MS);
		return () => clearTimeout(wait);
	}, [reveal, show, settle]);

	// The wheel and trackpad scroll the pane, not the map (which has nowhere to pan); a pinch stays the map's.
	// A drag on the background scrolls it too; a drag that starts on a topic stays a click.
	useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (e.ctrlKey) return;
			e.stopPropagation();
			cancelAnimationFrame(glide.current);
			strayed.current = false;
		};
		let drag: { x: number; y: number; left: number; top: number; id: number } | null = null;
		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0 || e.pointerType === "touch" || (e.target as Element).closest("[data-slot=course-map-node]")) return;
			e.stopPropagation();
			cancelAnimationFrame(glide.current);
			strayed.current = false;
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
			onPointerOver={(e) => point(topicAt(e.target))}
			onPointerLeave={() => point(null)}
			onFocus={(e) => {
				const handle = topicAt(e.target);
				point(handle);
				// The map's own follow has nothing to do on a surface it fits; the pane brings the topic in instead.
				if (handle && (e.target as Element).matches(":focus-visible")) {
					show(handle);
					strayed.current = false;
				}
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
			<div className="absolute inset-0" style={mapFade(fade.x, fade.y)}>
				<div ref={scroller} data-slot="course-split-map-scroller" className={`size-full overflow-auto overscroll-contain ${NO_BAR}`}>
					{/* The surface's size, from the course's layout: the map fits it whole. */}
					<div className="flex flex-col" style={{ width: surface.width, height: surface.height }}>
						<TopicMap map={map} margin={FADE} highlight={lit} marked={reveal} zoom={surface.zoom} />
					</div>
				</div>
			</div>
			{/* Outside the fade, in the pane's top right corner, where the fade leaves the map clear. */}
			{wholeSurface && <WholeCourseButton whole={zoomedOut} onToggle={toggleWhole} className="absolute top-0 right-0" />}
		</section>
	);
}
