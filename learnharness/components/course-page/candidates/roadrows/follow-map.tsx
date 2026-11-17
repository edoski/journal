"use client";

import { useMemo, useState } from "react";
import { currentArc } from "@/src/core";
import { ArcMap } from "@/components/course-map/arc-map";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { drawingOf } from "@/components/course-map/topic-map/map-drawing";
import { TAG_ROOM } from "@/components/course-map/topic-map/topic-map-layout";
import { WholeCourseButton } from "@/components/course-map/topic-map/whole-course-button";
import { HOME_MAP_FADE, HOME_MAP_VIGNETTE } from "@/components/study-home/home-map";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import type { RoadFollow } from "@/components/course-page/candidates/roadrows/road-follow";

/** The arc list's rows (arc-index.tsx) and its offset, which the map's row always holds. */
const INDEX_ROW = 28;
const INDEX_TOP = 24;

/**
 * Road in rows' map (spec: roadrows.md): the course map exactly as Home
 * draws it (`ArcMap` with its list of arcs, `TopicMap` framing itself in
 * Home's vignette), driven the way Home's Today rows drive it: `follow` (the
 * road's stop or row he points at, `useRoadFollow`) lights its topics, the
 * rest dimmed (`highlight`), brings a row's topic into view (`framed`, the
 * camera's glide, lit-camera.ts) with its card ringed (`marked`, as the split
 * page's rows ring theirs) and shows its arc; with nothing pointed
 * at, the arc the page shows. Its row is as tall as the course's tallest
 * arc needs at full size, and gives way when the window is shorter, so the
 * road sits right under the cards with no band between. Whole course swaps
 * in every topic, as on the split page.
 */
export function FollowMap({ columns, follow }: { columns: CourseColumns; follow: RoadFollow | null }) {
	const { view, shown, showArc } = columns;
	const { course, said, arcs } = view;
	const { map } = course;
	const [whole, setWhole] = useState(false);
	const shownArc = shown?.arc.handle ?? currentArc(map) ?? undefined;
	const arc = follow?.arc ?? shownArc;
	const need = useMemo(() => {
		const tallest = Math.max(...(arcs ?? [null]).map((a) => drawingOf(map, a?.arc.handle).layout.height));
		return Math.max(tallest + 2 * HOME_MAP_FADE.y + TAG_ROOM, arcs ? INDEX_TOP + arcs.length * INDEX_ROW : 0);
	}, [map, arcs]);
	return (
		<div data-slot="course-rows-map" className="relative flex min-h-48 min-w-0 flex-col" style={{ flex: `1 1 ${need}px` }}>
			<ArcMap
				arcs={arcs?.map((a) => a.arc) ?? null}
				value={whole ? null : (arc ?? null)}
				here={currentArc(map)}
				whole={whole}
				onSelect={(to) => {
					setWhole(false);
					showArc(to);
				}}
				onHere={() => setWhole(false)}
			>
				<div data-slot="course-rows-map-frame" className="relative flex min-h-0 flex-1 flex-col overflow-hidden" style={HOME_MAP_VIGNETTE}>
					<TopicMap
						map={map}
						arc={whole ? undefined : arc}
						said={said}
						margin={HOME_MAP_FADE}
						highlight={follow?.lit ?? null}
						marked={follow?.marked ?? null}
						framed={follow?.framed && !whole ? follow.lit : null}
						whole={whole}
						onOpenArc={showArc}
						fitsDown="bottom"
					/>
				</div>
				{arcs && <WholeCourseButton whole={whole} onToggle={() => setWhole((w) => !w)} className="absolute top-0 right-0" />}
			</ArcMap>
		</div>
	);
}
