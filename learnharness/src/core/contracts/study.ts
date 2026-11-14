/**
 * The study home's read: every listed course's map with the two facts only
 * `plan` knows, joined at the server. Engine fields only: the app judges no
 * standing.
 */

import type { UnreadableCourse } from "./course.ts";
import type { CourseMap, TopicHandle } from "./course-map.ts";

/** One course on the home. */
export interface StudyCourse {
	/** The engine's `map`: topics in path order with their levels, reviews,
	 *  weak verdicts, the exam, the current topic and the open tasks. */
	map: CourseMap;
	/** Inside the exam run-up, the topics the engine counts not recently
	 *  solid (`plan`'s `runup.unready`), in path order; null outside it. */
	unready: readonly TopicHandle[] | null;
	/** Today's review as the engine planned it (`plan`'s `due`, in its
	 *  order); null when the plan could not be read. */
	due: readonly TopicHandle[] | null;
	/** Days since the record was last saved; null when it never was. */
	lastActiveDaysAgo: number | null;
	/** The new topics the engine's daily plan starts today, in its order;
	 *  empty when today starts none or the plan could not be read. */
	newToday: readonly TopicHandle[];
}

/** What GET /api/study answers. A course whose read failed is in `failed`
 *  instead of `courses`, so one broken record never hides the others and
 *  is never hidden itself. */
export type StudyListing =
	| { available: true; courses: StudyCourse[]; failed: UnreadableCourse[] }
	| { available: false; reason: string };
