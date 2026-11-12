/**
 * The study home's read: every listed course's map with the two facts only
 * `plan` knows, joined at the server. Engine fields only: the app judges no
 * standing.
 */

import type { CourseMap, TopicHandle } from "./course-map.ts";

/** One course on the home. */
export interface StudyCourse {
	/** The engine's `map`: topics in path order with their levels, reviews,
	 *  weak verdicts, the exam, the current topic and the open tasks. */
	map: CourseMap;
	/** Inside the exam run-up, the topics the engine counts not recently
	 *  solid (`plan`'s `runup.unready`), in path order; null outside it. */
	unready: readonly TopicHandle[] | null;
	/** Days since the record was last saved; null when it never was. */
	lastActiveDaysAgo: number | null;
}

/** What GET /api/study answers. A course whose read failed is left out and
 *  named in `failed`, so one broken record never hides the others. */
export type StudyListing =
	| { available: true; courses: StudyCourse[]; failed: string[] }
	| { available: false; reason: string };
