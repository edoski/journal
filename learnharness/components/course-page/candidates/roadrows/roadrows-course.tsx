"use client";

import { CourseFrame } from "@/components/course-page/course-frame";
import { SplitBody, type CourseColumns } from "@/components/course-page/split/split-course";
import { SplitList } from "@/components/course-page/split/split-list";
import { RoadHead } from "@/components/course-page/candidates/road/road-course";
import { RoadTrack } from "@/components/course-page/candidates/roadrows/road-track";

/** Under the map: the road across the page, or a course's four groups when it has no arcs. */
function RoadRowsList(c: CourseColumns) {
	if (c.view.arcs) return <RoadTrack {...c} />;
	return (
		<div className="flex max-h-64 min-h-0 flex-col">
			<SplitList
				ref={c.listRef}
				groups={c.groups}
				open={c.open}
				onOpenChange={c.onOpenChange}
				marked={c.marked}
				onPoint={c.onPoint}
				onEnterMap={c.onEnterMap}
				onExitTop={c.onExitTop}
			/>
		</div>
	);
}

/**
 * The course page's Road in rows candidate (spec: roadrows.md): Road's
 * head, then two rows in one column, the course map with its list of arcs
 * across the top, unchanged, and the road under it across the page, left
 * to right, each arc's topics hanging under its stop.
 */
export function RoadRowsCourse({ workspace }: { workspace: string }) {
	return <CourseFrame workspace={workspace}>{(ready) => <SplitBody {...ready} rows head={(c) => <RoadHead {...c} />} list={RoadRowsList} />}</CourseFrame>;
}
