"use client";

import { CourseGroup } from "@/components/course-page/course-group";
import type { CourseView } from "@/components/course-page/course-model";
import { CourseTopicRow } from "@/components/course-page/course-topic-row";
import { listPlan, type ListRow } from "@/components/course-page/list/list-plan";

/**
 * The list's body (spec: list-course.md): the course's topics in the groups
 * he would act from, Needs you, Learning, Not started and Known, each a
 * `CourseGroup` of `CourseTopicRow`s, drawn as `listPlan` says (empty
 * groups left out, the next three not started, Known folded, a diagnosed
 * mistake under its title). A course with no topics yet says so in the
 * map's words.
 */
export function ListGroups({ view }: { view: Pick<CourseView, "course" | "groups"> }) {
	const plan = listPlan(view);
	if (plan.length === 0) {
		return (
			<p data-slot="course-list-empty" className="flex h-9 items-center text-row text-muted-foreground">
				No topics yet. They appear as you study this course.
			</p>
		);
	}
	return (
		<div data-slot="course-list-groups" className="flex flex-col gap-6">
			{plan.map(({ id, title, rows, foldable, folded, limit }) => (
				<CourseGroup<ListRow>
					key={id}
					data-group={id}
					title={title}
					items={rows}
					foldable={foldable}
					defaultFolded={folded}
					limit={limit}
					renderItem={({ row, detail }) => <CourseTopicRow key={row.topic.handle} row={row} detail={detail} />}
				/>
			))}
		</div>
	);
}
