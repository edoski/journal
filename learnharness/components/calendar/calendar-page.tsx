"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CoursesUnavailable } from "@/components/course-picker";
import { useDesignVariant } from "@/components/design-variant";
import { SetupDialog } from "@/components/setup-dialog";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { useTopicStarts } from "@/components/unit-inbox/use-unit-inbox";
import { linkStarts } from "@/components/unit-inbox/units";
import { calendarEntries } from "@/components/calendar/calendar-facts";
import { CalendarView } from "@/components/calendar/calendar-view";
import { useCalendarRead } from "@/components/calendar/use-calendar";

/** `/calendar`, the Proposed design's page only: Current goes Home once
 *  the page has hydrated, since the switch reads Current until then. */
export function CalendarPage({ initialConfigured }: { initialConfigured: boolean }) {
	const design = useDesignVariant();
	const router = useRouter();
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	useEffect(() => {
		if (hydrated && design === "current") router.replace("/");
	}, [hydrated, design, router]);
	return design === "proposed" ? <CalendarRoute initialConfigured={initialConfigured} /> : null;
}

/** The calendar over the engine's read and the sessions: a press starts
 *  a session as the topic page would, linked to its topic. */
function CalendarRoute({ initialConfigured }: { initialConfigured: boolean }) {
	const read = useCalendarRead();
	const lesson = useLessonStart(initialConfigured);
	const [starts, recordStart] = useTopicStarts();
	const [scope, setScope] = useState<string | null>(null);
	const ready = read.status === "ready" ? read : null;
	const entries = useMemo(
		() => (ready ? calendarEntries({ courses: ready.listing.courses, chats: linkStarts(ready.chats, starts), scope }) : []),
		[ready, starts, scope],
	);

	if (read.status !== "ready") {
		return (
			<div className="flex h-dvh items-center justify-center px-6">
				{read.status === "loading" ? <p className="text-row text-muted-foreground">Reading your courses…</p> : <CoursesUnavailable reason={read.reason} variant="proposed" />}
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
				onStart={(opening, workspace, handle) => lesson.start(opening, workspace, handle ? (id) => recordStart(id, handle) : undefined)}
			/>
			{lesson.error && (
				<p role="alert" className="absolute bottom-4 left-1/2 -translate-x-1/2 text-row text-danger">
					{lesson.error}
				</p>
			)}
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} onDone={lesson.closeSetup} />
		</>
	);
}
