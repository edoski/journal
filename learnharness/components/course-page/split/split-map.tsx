"use client";

import { useCallback, useImperativeHandle, useRef, useState, type Ref } from "react";
import { currentArc, type ArcHandle, type CourseMap, type CourseMapArc, type TopicHandle } from "@/src/core";
import { MapFrame } from "@/components/course-map/map-frame";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import type { Said } from "@/components/unit-inbox/sidebar-says";
import { topicAt } from "@/components/course-page/split/split-tie";
import type { MapLights, PointBy } from "@/components/course-map/use-map-tie";

/** What the page asks of the map: focus a topic's node. */
export interface SplitMapHandle {
	focus: (handle: TopicHandle) => void;
}

/**
 * The split page's right pane (spec: split-course.md): Home's map
 * (`TopicMap`, topic-map.md) in Home's frame (`MapFrame`: its fade, Whole
 * course while enlarged, Enlarge), with its own camera, opening on `aim` at
 * the top of the pane. A row he points at lights its topic and
 * prerequisites, its card glows and, once he rests on it, the camera
 * brings it into view (`lights`, the page's `useMapTie`), returning once he
 * points at nothing. Pointing at or
 * focusing a node tells the page its topic (`onPoint`), so the list marks
 * its row; Escape on a focused node hands the walk back to that row
 * (`onLeave`). With `arc`, the map draws that arc. A course with `arcs`
 * (`ArcMap`, with no list of its own beside it, since the road lists them):
 * ⇧↑ or ⇧↓ glides to another arc (`onOpenArc`), and ⌘J goes to You are
 * here. Enlarge, pressed, has the map take the page's body (`enlarged`,
 * the page's), and pressed again or Esc returns.
 */
export function SplitMap({
	map,
	arc,
	arcs = null,
	said,
	lights,
	aim,
	onPoint,
	onLeave,
	onOpenArc,
	enlarged,
	onEnlarge,
	ref,
}: {
	map: CourseMap;
	/** The arc the map draws; unset, the whole course. */
	arc?: ArcHandle;
	/** The course's arcs; null for a course without them. */
	arcs?: readonly CourseMapArc[] | null;
	/** What the sidebar says for each topic (`sidebarSays`), for the cards. */
	said: ReadonlyMap<TopicHandle, Said>;
	/** What the row he points at lights, glows and brings into view (`useMapTie`). */
	lights: MapLights;
	/** The topic the map opens on. */
	aim: TopicHandle | null;
	onPoint: (handle: TopicHandle | null, by: PointBy) => void;
	onLeave: (handle: TopicHandle) => void;
	/** Shows another arc: a press on the arc list, ⇧↑ or ⇧↓, ⌘J, or a card's "From <arc>" line. */
	onOpenArc?: (arc: ArcHandle) => void;
	/** Whether the map has taken the page's body. */
	enlarged: boolean;
	onEnlarge: (enlarged: boolean) => void;
	ref?: Ref<SplitMapHandle>;
}) {
	const root = useRef<HTMLElement>(null);
	const pointed = useRef<TopicHandle | null>(null);
	const [opensWhole, setOpensWhole] = useState<boolean | null>(null);
	const open = useCallback((to: ArcHandle) => onOpenArc?.(to), [onOpenArc]);

	const point = (handle: TopicHandle | null, by: PointBy) => {
		if (handle === pointed.current) return;
		pointed.current = handle;
		onPoint(handle, by);
	};

	useImperativeHandle(
		ref,
		() => ({
			focus: (handle) =>
				root.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(handle)}"] [data-slot=course-map-node]`)?.focus({ preventScroll: true }),
		}),
		[],
	);

	return (
		<MapFrame
			ref={root}
			aria-label={`${map.title} map`}
			data-slot="course-split-map"
			onPointerOver={(e) => point(topicAt(e.target), "pointer")}
			onPointerLeave={() => point(null, "pointer")}
			onFocus={(e) => point(topicAt(e.target), "focus")}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) point(null, "focus");
			}}
			onKeyDown={(e) => {
				const handle = e.key === "Escape" ? topicAt(e.target) : null;
				if (!handle) return;
				e.preventDefault();
				e.stopPropagation();
				onLeave(handle);
			}}
			arcs={arcs}
			value={arc ?? null}
			here={currentArc(map)}
			index={false}
			onArc={open}
			opensWhole={opensWhole}
			enlarged={enlarged}
			onEnlarge={onEnlarge}
			back="Back to the course"
			enlargeSlot="course-map-enlarge"
		>
			{(view) => (
				<TopicMap
					map={map}
					arc={view.whole ? undefined : arc}
					said={said}
					margin={view.margin}
					highlight={lights.lit}
					marked={lights.glow}
					framed={lights.framed}
					whole={view.whole}
					opensOn={aim}
					fitsDown="top"
					onOpenArc={view.pick}
					onOpensWhole={setOpensWhole}
				/>
			)}
		</MapFrame>
	);
}
