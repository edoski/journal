"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LESSON_WORDS } from "@/components/study-words";

/** A lesson whose course was deleted (round 3, 14 Nov 2026): one plain line
 *  where the box would be, and a way on. The lesson reads as history; a
 *  turn there would write the course's record back as a ghost course.
 *  What he had written there waits in the New lesson box (`kept`). */
export function CourseGoneLine({ kept = false }: { kept?: boolean }) {
	return (
		<div role="status" data-testid="course-gone" className="flex flex-wrap items-center gap-1 text-body system-current:text-row">
			<span className="mr-2 min-w-0 text-muted-foreground">
				{LESSON_WORDS.courseDeleted}
				{kept && ` ${LESSON_WORDS.courseDeletedKept}`}
			</span>
			<Button asChild variant="quiet" size="sm" className="h-8 px-2 text-body system-current:text-row system-current:font-medium text-foreground">
				<Link href="/chat/new">{LESSON_WORDS.startLesson}</Link>
			</Button>
		</div>
	);
}
