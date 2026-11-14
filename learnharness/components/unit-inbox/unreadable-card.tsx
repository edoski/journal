"use client";

import type { UnreadableCourse } from "@/src/core";
import { LESSON_WORDS } from "@/components/study-words";
import { RowCard } from "@/components/unit-inbox/row-card";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { CourseMark } from "@/components/unit-inbox/unit-row";

/** A course whose record can't be read, as a card under Today's (spec:
 *  inbox-today.md): its name, and the lesson's line for it. A click opens
 *  its course page, which says why. */
export function UnreadableCard({ course, active }: { course: UnreadableCourse; active: boolean }) {
	return (
		<RowCard
			href={courseHref(course.workspace)}
			active={active}
			rowKey={`course:${course.workspace}`}
			mark={<CourseMark title={course.title} />}
			course={course.title}
			status={null}
			title={LESSON_WORDS.unreadableCourse}
		/>
	);
}
