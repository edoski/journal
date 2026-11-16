"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LESSON_WORDS } from "@/components/study-words";

/** Whether a course-list change deleted this lesson's course: true when
 *  the event names it, null when only a read of the list can say. Pure. */
export function courseDeletedBy(change: { deleted?: string }, workspace: string | undefined): true | null {
	return workspace !== undefined && change.deleted === workspace ? true : null;
}

/** A lesson whose course was deleted (round 3, 14 Nov 2026): one plain line
 *  where the box would be, and a way on. The lesson reads as history; a
 *  turn there would write the course's record back as a ghost course.
 *  What he had written there waits in the New lesson box (`kept`). */
export function CourseGoneLine({ kept = false }: { kept?: boolean }) {
	return (
		<div role="status" data-testid="course-gone" className="flex flex-wrap items-center gap-1 text-body">
			<span className="mr-2 min-w-0 text-muted-foreground">
				{LESSON_WORDS.courseDeleted}
				{kept && ` ${LESSON_WORDS.courseDeletedKept}`}
			</span>
			<Button asChild variant="quiet" size="sm" className="h-8 px-2 text-body text-foreground">
				<Link href="/chat/new">{LESSON_WORDS.startLesson}</Link>
			</Button>
		</div>
	);
}
