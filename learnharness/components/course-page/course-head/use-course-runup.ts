"use client";

import type { CalendarCourse } from "@/src/core";
import { useCalendarRead } from "@/components/calendar/use-calendar";

/** The course as the calendar reads it: with the engine's daily plan up
 *  to its exam, the topics the plan cannot start before it and the day
 *  the final review starts. Null until read. */
export function useCourseRunup(workspace: string): CalendarCourse | null {
	const read = useCalendarRead();
	return read.status === "ready" ? (read.listing.courses.find((c) => c.map.workspace === workspace) ?? null) : null;
}
