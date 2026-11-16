"use client";

import { useEffect, useRef, useState } from "react";
import type { CourseListing, UnreadableProblem } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { useSerialRead } from "@/components/serial-read";
import { LESSON_WORDS } from "@/components/study-words";
import { unreadableLine } from "@/components/study-home/unreadable-course";

/** Why a course's record can't be read, from the course list, or null when
 *  it reads (or the list can't be had). Pure. */
export function unreadableProblem(listing: CourseListing | null, workspace: string): UnreadableProblem | null {
	if (!listing?.available) return null;
	return listing.unreadable.find((c) => c.workspace === workspace)?.problem ?? null;
}

/** Whether this lesson's course record can't be read now, read on open
 *  and again whenever a course or its record changes, or the server comes
 *  back. */
function useUnreadable(workspace: string | undefined): UnreadableProblem | null {
	const [problem, setProblem] = useState<UnreadableProblem | null>(null);
	const course = useRef(workspace);
	course.current = workspace;
	// One read at a time: every write of the session asks again, and a read
	// per write had the engine read every course over and over during a
	// turn, so the notice cleared late once the record read again (round
	// 13, 4 minor 5).
	const read = useSerialRead(async () => {
		const asked = course.current;
		if (!asked) return;
		const res = await fetch("/api/courses", { cache: "no-store" });
		const listing = res.ok ? ((await res.json()) as CourseListing) : null;
		if (course.current === asked) setProblem(unreadableProblem(listing, asked));
	});
	useEffect(read, [read, workspace]);
	useServerEvent("course-changed", read);
	useServerEvent("courses-changed", read);
	useServerEvent("record-changed", read);
	useServerResync(read);
	return problem;
}

/** A lesson whose course record can't be read (round 4: it taught on with
 *  no notice while every save failed): Home's line for that course, and
 *  that what he answers is not saved until it can be read. Nothing while
 *  the record reads. */
export function CourseUnreadableLine({ workspace }: { workspace: string | undefined }) {
	const problem = useUnreadable(workspace);
	if (!problem) return null;
	return (
		<p role="status" data-testid="course-unreadable" className="text-body system-current:text-row text-muted-foreground">
			{unreadableLine(problem)} {LESSON_WORDS.unreadableNotSaved}
		</p>
	);
}
