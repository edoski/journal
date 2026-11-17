"use client";

import { CourseFrame } from "@/components/course-page/course-frame";
import { SplitBody, type CourseColumns } from "@/components/course-page/split/split-course";
import { SplitList } from "@/components/course-page/split/split-list";
import { OverviewHead } from "@/components/course-page/candidates/overview/overview-head";
import { OverviewArc } from "@/components/course-page/candidates/overview/overview-arc";

/** Overview's left column: the course's arcs as quiet lines (`OverviewArc`),
 *  where he is open, or a course's four groups when it has no arcs. */
function OverviewList(c: CourseColumns) {
	return (
		<SplitList
			ref={c.listRef}
			groups={c.groups}
			arcs={c.view.arcs}
			open={c.open}
			onOpenChange={c.onOpenChange}
			onCheck={c.onCheck}
			checking={c.checking}
			marked={c.marked}
			onPoint={c.onPoint}
			onEnterMap={c.onEnterMap}
			onExitTop={c.onExitTop}
			arcLine={OverviewArc}
		/>
	);
}

/**
 * The course page's Overview candidate (spec: overview.md): a project's
 * overview, as Linear's project page leads with its status: the head says
 * what to do next and why, then the exam, the readiness and the last
 * study as three facts; the list is the course's parts, each line quiet
 * unless he has something to do there.
 */
export function OverviewCourse({ workspace }: { workspace: string }) {
	return <CourseFrame workspace={workspace}>{(ready) => <SplitBody {...ready} head={(c) => <OverviewHead {...c} />} list={OverviewList} />}</CourseFrame>;
}
