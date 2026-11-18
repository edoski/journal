/**
 * The pages' engine reads, made as the server starts (round 15, P7): Home's
 * read first, then every course's standing and the calendar's plans, which
 * the course page, the topic page and the calendar read. Each engine run
 * replays every course, so a first visit to one of those pages waited for
 * one (about 1 s at his courses' size); read here, the engine's kept reads
 * answer it until a record changes. Once, at the start, never on a timer.
 */

import { calendarRead } from "./calendar.ts";
import { courseStandingRead } from "./course-standing.ts";
import { studyStatus } from "./study.ts";

export async function readAhead(): Promise<void> {
	const home = await studyStatus();
	if (!home.available) return;
	await Promise.all([calendarRead(), ...home.courses.map((c) => courseStandingRead(c.map.workspace))]);
}
