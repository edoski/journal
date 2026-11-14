"use client";

import { useMemo, useState } from "react";
import { CoursesUnavailable } from "@/components/course-picker";
import { SetupDialog } from "@/components/setup-dialog";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { calendarEntries } from "@/components/calendar/calendar-facts";
import { CalendarView } from "@/components/calendar/calendar-view";
import { useCalendarRead } from "@/components/calendar/use-calendar";

/** `/calendar`: the calendar over the engine's read and the sessions; a
 *  press starts a session as the topic page would, linked to its topic. */
export function CalendarPage() {
	const read = useCalendarRead();
	const lesson = useLessonStart();
	const [scope, setScope] = useState<string | null>(null);
	const ready = read.status === "ready" ? read : null;
	const entries = useMemo(
		() => (ready ? calendarEntries({ courses: ready.listing.courses, chats: ready.chats, scope }) : []),
		[ready, scope],
	);

	if (read.status !== "ready") {
		return (
			<div className="flex h-dvh items-center justify-center px-6">
				{read.status === "loading" ? <p className="text-row text-muted-foreground">Reading your courses…</p> : <CoursesUnavailable reason={read.reason} />}
			</div>
		);
	}
	const { courses, schedule } = read.listing;
	return (
		<>
			<CalendarView
				courses={courses}
				entries={entries}
				schedule={schedule}
				today={courses[0]?.map.today ?? new Date().toISOString().slice(0, 10)}
				scope={courses.some((c) => c.map.workspace === scope) ? scope : null}
				onScopeChange={setScope}
				busy={lesson.busy}
				onStart={(opening, workspace, handle) => lesson.start(opening, workspace, { topics: handle ? [handle] : [] })}
			/>
			{lesson.error && (
				<p role="alert" className="absolute bottom-4 left-1/2 -translate-x-1/2 text-row text-danger">
					{lesson.error}
				</p>
			)}
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</>
	);
}
