/**
 * The study home's read: every listed course's map with the two facts only
 * `plan` knows, joined at the server. Engine fields only: the app judges no
 * standing.
 */

import type { UnreadableCourse } from "./course.ts";
import type { CourseMap, TopicHandle } from "./course-map.ts";
import type { StudyWindow } from "./calendar.ts";

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
	/** Days since he last studied the course: the engine's `last_studied`
	 *  (an observation or a topic taught) or a session in the course he
	 *  wrote in, whichever is later; null when neither shows any, even when
	 *  the course was saved. */
	lastActiveDaysAgo: number | null;
	/** The new topics the engine's daily plan starts today, in its order;
	 *  empty when today starts none or the plan could not be read. */
	newToday: readonly TopicHandle[];
}

/** What GET /api/study answers. A course whose read failed is in `failed`
 *  instead of `courses`, so one broken record never hides the others and
 *  is never hidden itself. `hours` are today's study windows in his
 *  Journal (none on its day off, or without a Journal): the hours the Mac
 *  app's morning notice keeps to. */
export type StudyListing =
	| { available: true; courses: StudyCourse[]; failed: UnreadableCourse[]; hours?: readonly StudyWindow[] }
	| { available: false; reason: string };
