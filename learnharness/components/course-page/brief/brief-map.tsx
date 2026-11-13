"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CourseMap, TopicHandle } from "@/src/core";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { layoutTopicMap } from "@/components/course-map/topic-map/topic-map-layout";
import { useNodeSize } from "@/components/course-map/topic-map/node-size";
import { mapFade } from "@/components/study-home/map-frame";
import { FADE, boxOf, centreOn, revealIn, surfaceOf, type Size } from "./brief-map-view";

/** The map's edges fade into the page on every side, like a vignette. */
const VIGNETTE = mapFade(FADE.x, FADE.y);

/** The topic a map node stands for: its React Flow node's id. */
function topicAt(target: EventTarget | null): TopicHandle | null {
	return target instanceof Element ? ((target.closest(".react-flow__node")?.getAttribute("data-id") as TopicHandle | null) ?? null) : null;
}

/**
 * The course's map under the brief's answers (spec: brief-course.md),
 * framed as Home frames it: no outline and no heading, its edges fading
 * into the page. The topic map draws the whole course at full size on a
 * surface it fits (brief-map-view.ts), so it never moves its own camera;
 * the pane scrolls over it with no bar instead. It opens on `aim` and
 * returns there whenever the pane grows or shrinks; wheel, trackpad and a
 * drag on the background move it, and a topic the keyboard reaches comes
 * clear of the fade. A click on a topic opens its page.
 */
export function BriefMap({ map, aim }: { map: CourseMap; aim: TopicHandle | null }) {
	const node = useNodeSize();
	const layout = useMemo(() => layoutTopicMap(map.topics, map.edges, node), [map.topics, map.edges, node]);
	const scroller = useRef<HTMLDivElement>(null);
	const [pane, setPane] = useState<Size>({ width: 0, height: 0 });
	const surface = surfaceOf(layout, pane);

	useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const measure = () => setPane((was) => (was.width === el.clientWidth && was.height === el.clientHeight ? was : { width: el.clientWidth, height: el.clientHeight }));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// The pane opens on its aim, and returns to it whenever it grows or shrinks.
	useEffect(() => {
		const el = scroller.current;
		const box = aim && pane.width > 0 ? boxOf(layout, surfaceOf(layout, pane), aim) : null;
		if (el && box) el.scrollTo(centreOn(box, pane, surfaceOf(layout, pane)));
	}, [aim, layout, pane]);

	// The wheel and trackpad scroll the pane, not the map, which fits and has nowhere to pan; a pinch stays the map's.
	// A drag on the background scrolls it too; one that starts on a topic stays a click.
	useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) e.stopPropagation();
		};
		let drag: { x: number; y: number; left: number; top: number; id: number } | null = null;
		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0 || e.pointerType === "touch" || topicAt(e.target)) return;
			e.stopPropagation();
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

	return (
		<section
			aria-label="Course map"
			data-slot="brief-map"
			className="relative min-h-40 flex-1"
			style={VIGNETTE}
			onFocus={(e) => {
				// The map's own follow has nothing to do on a surface it fits; the pane brings the topic in instead.
				const el = scroller.current;
				const handle = topicAt(e.target);
				const box = handle && el && (e.target as Element).matches(":focus-visible") ? boxOf(layout, surface, handle) : null;
				const to = box && el ? revealIn(box, { width: el.clientWidth, height: el.clientHeight, left: el.scrollLeft, top: el.scrollTop }, surface) : null;
				if (to) el?.scrollTo({ ...to, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
			}}
		>
			<div ref={scroller} data-slot="brief-map-pane" className="absolute inset-0 overflow-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{/* The course's size with the map's room: the map fits it at 100%. */}
				<div className="flex flex-col" style={{ width: surface.width, height: surface.height }}>
					<TopicMap map={map} margin={FADE} />
				</div>
			</div>
		</section>
	);
}
