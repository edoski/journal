"use client";

import { useCallback, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { currentArc, type ArcHandle, type CourseMap, type CourseMapArc, type TopicHandle } from "@/src/core";
import { ArcMap } from "@/components/course-map/arc-map";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import type { Said } from "@/components/unit-inbox/sidebar-says";
import { mapFade } from "@/components/study-home/map-frame";
import { WholeCourseButton } from "@/components/course-map/topic-map/whole-course-button";
import { topicAt } from "@/components/course-page/split/split-tie";

/** What the page asks of the map: focus a topic's node. */
export interface SplitMapHandle {
	focus: (handle: TopicHandle) => void;
}

/** How far the vignette reaches in from the sides and from the top and bottom. */
const FADE = { x: 48, y: 32 };
const VIGNETTE = mapFade(FADE.x, FADE.y);

/**
 * The split page's right pane (spec: split-course.md): Home's map
 * (`TopicMap`, topic-map.md) with its own camera, its edges faded into the
 * page, opening on `aim` at the top of the pane. `lit` lights the row's
 * topic and prerequisites, its card glows (`marked`) and, once he rests on
 * it, the camera brings it into view (`framed`), returning once he points
 * at nothing. Pointing at or focusing a node tells the page its topic
 * (`onPoint`), so the list marks its row; Escape on a focused node hands
 * the walk back to that row (`onLeave`). With `arc`, the map draws that
 * arc and Whole course always shows; without, only when the course opens
 * on less than all of it. A course with `arcs` (`ArcMap`, with no list of
 * its own beside it, since the road lists them): ⇧↑ or ⇧↓ glides to another
 * arc (`onOpenArc`), and ⌘J goes to You are here.
 */
export function SplitMap({
	map,
	arc,
	arcs = null,
	said,
	lit,
	aim,
	reveal,
	onPoint,
	onLeave,
	onOpenArc,
	ref,
}: {
	map: CourseMap;
	/** The arc the map draws; unset, the whole course. */
	arc?: ArcHandle;
	/** The course's arcs; null for a course without them. */
	arcs?: readonly CourseMapArc[] | null;
	/** What the sidebar says for each topic (`sidebarSays`), for the cards. */
	said: ReadonlyMap<TopicHandle, Said>;
	lit: ReadonlySet<TopicHandle> | null;
	/** The topic the map opens on. */
	aim: TopicHandle | null;
	/** A topic to bring into view; null moves nothing. */
	reveal: TopicHandle | null;
	onPoint: (handle: TopicHandle | null) => void;
	onLeave: (handle: TopicHandle) => void;
	/** Shows another arc: a press on the arc list, ⇧↑ or ⇧↓, ⌘J, or a card's "From <arc>" line. */
	onOpenArc?: (arc: ArcHandle) => void;
	ref?: Ref<SplitMapHandle>;
}) {
	const root = useRef<HTMLElement>(null);
	const pointed = useRef<TopicHandle | null>(null);
	const [opensWhole, setOpensWhole] = useState<boolean | null>(null);
	const [whole, setWhole] = useState(false);
	// Another arc opens on its own opening view, not the whole course.
	const [wholeFor, setWholeFor] = useState(arc);
	if (wholeFor !== arc) {
		setWholeFor(arc);
		setWhole(false);
	}
	const canZoomOut = arcs !== null || opensWhole === false;
	const zoomedOut = canZoomOut && whole;
	const framed = useMemo(() => (reveal ? new Set([reveal]) : null), [reveal]);
	const toggleWhole = useCallback(() => setWhole((w) => !w), []);
	const leaveWhole = useCallback(() => setWhole(false), []);
	const pick = useCallback(
		(to: ArcHandle) => {
			setWhole(false);
			onOpenArc?.(to);
		},
		[onOpenArc],
	);

	const point = (handle: TopicHandle | null) => {
		if (handle === pointed.current) return;
		pointed.current = handle;
		onPoint(handle);
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
		<ArcMap arcs={arcs} value={arc ?? null} here={currentArc(map)} whole={zoomedOut} index={false} onSelect={pick} onHere={leaveWhole}>
			<section
				ref={root}
				aria-label={`${map.title} map`}
				data-slot="course-split-map"
				className="relative flex min-h-0 flex-1 flex-col"
				onPointerOver={(e) => point(topicAt(e.target))}
				onPointerLeave={() => point(null)}
				onFocus={(e) => point(topicAt(e.target))}
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
				<div className="absolute inset-0 flex flex-col" style={VIGNETTE}>
					<TopicMap
						map={map}
						arc={zoomedOut ? undefined : arc}
						said={said}
						margin={FADE}
						highlight={lit}
						marked={reveal}
						framed={framed}
						whole={zoomedOut}
						opensOn={aim}
						fitsDown="top"
						onOpenArc={pick}
						onOpensWhole={setOpensWhole}
					/>
				</div>
				{/* Outside the fade, in the pane's top right corner, where the fade leaves the map clear. */}
				{canZoomOut && <WholeCourseButton whole={zoomedOut} onToggle={toggleWhole} className="absolute top-0 right-0" />}
			</section>
		</ArcMap>
	);
}
