"use client";

import { CourseFrame, type CourseReady } from "@/components/course-page/course-frame";
import { SplitBody, type CourseColumns } from "@/components/course-page/split/split-course";
import { SplitList } from "@/components/course-page/split/split-list";
import { RoadHead } from "@/components/course-page/candidates/road/road-course";
import { RoadTrack } from "@/components/course-page/candidates/roadrows/road-track";
import { FollowMap } from "@/components/course-page/candidates/roadrows/follow-map";
import { useRoadFollow } from "@/components/course-page/candidates/roadrows/road-follow";

/** A course without arcs keeps its four groups under the map. */
function Groups(c: CourseColumns) {
	return (
		<div className="flex max-h-64 min-h-0 flex-col pt-4">
			<SplitList ref={c.listRef} groups={c.groups} open={c.open} onOpenChange={c.onOpenChange} marked={c.marked} onPoint={c.onPoint} onEnterMap={c.onEnterMap} onExitTop={c.onExitTop} />
		</div>
	);
}

/** The page under the course frame: the map Home's way, the road under it, the road driving the map. */
function RoadRowsBody(ready: CourseReady) {
	const { follow, point } = useRoadFollow();
	return (
		<SplitBody
			{...ready}
			rows
			head={(c) => <RoadHead {...c} />}
			map={(c) => <FollowMap columns={c} follow={follow} />}
			list={(c) => (c.view.arcs ? <RoadTrack {...c} onFollow={point} /> : <Groups {...c} />)}
		/>
	);
}

/**
 * The course page's Road in rows candidate (spec: roadrows.md): Road's
 * head, then two rows in one column, the course map with its list of arcs
 * across the top, driven as Home's map is (`FollowMap`), and the road right
 * under it as a carousel left to right (`RoadTrack`), each arc's topics
 * hanging under its item.
 */
export function RoadRowsCourse({ workspace }: { workspace: string }) {
	return <CourseFrame workspace={workspace}>{(ready) => <RoadRowsBody {...ready} />}</CourseFrame>;
}
