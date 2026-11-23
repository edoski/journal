/**
 * The lesson page's one course read: where the lesson sits (its topic and
 * that topic's arc, `lessonPlaceOf`), for the top bar's links
 * (components/lesson/lesson-roadmap.md). One engine `map` call when the
 * page opens, bounded so a slow engine never holds the lesson: past the
 * bound the bar opens without the topic and arc; a record that can't be
 * read places it on the course's last map read here (round 21, m10).
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
import type { CourseMap } from "../core/contracts/course-map.ts";
import { lessonTopics } from "../core/course-map-build.ts";
import { lessonPlaceOf, type LessonPlace } from "../core/lesson-place.ts";
import { sessionTopicsOf } from "../core/native-messages.ts";
import { lessonTakenUp, reviewRecord } from "../core/session-opening.ts";
import { stores } from "./stores.ts";
import { continuedTask } from "./task-passage.ts";

/** How long the page waits for the course map before it opens without it. */
export const LESSON_PLACE_WAIT_MS = 1500;

/** Each course's newest map this server read, by workspace: the place of a
 *  lesson whose course record can no longer be read, so a fresh open keeps
 *  its topic in the crumb (round 21, m10, 4 minor 5: with Real Analysis's
 *  record at 000 the crumb read "Real Analysis > Sequence limit proofs"). */
const lastMaps = new Map<string, CourseMap>();

/** The lesson's candidate topics, as the session list reads them: the
 *  lesson its plan took up (round 16, M4: a review asked for Poisson is
 *  the Poisson lesson, never under Binomial's crumb), the ones it was
 *  started on, then those its transcript worked on. None for a review of
 *  several topics, the course's review, never its first topic's (round 17,
 *  m5: the crumb read "Inclusion-exclusion principle" while its first
 *  question was on Conditional probability). Pure. */
export function lessonPlaceTopics(chat: Pick<ChatRecord, "topics" | "messages"> & { title?: string }): string[] {
	if ((chat.topics ?? []).length > 1 && reviewRecord({ ...chat, title: chat.title ?? "" })) return [];
	const taken = lessonTakenUp(chat);
	return [...new Set([...(taken ? [taken] : []), ...(chat.topics ?? []), ...sessionTopicsOf(chat.messages)])];
}

/** Where the lesson sits, read from its course's map (`lessonPlaceTopics`). */
export async function lessonPlace(chat: Pick<ChatRecord, "course" | "topics" | "messages"> & { title?: string }, waitMs = LESSON_PLACE_WAIT_MS): Promise<LessonPlace | null> {
	const workspace = chat.course?.workspace;
	const topics = lessonPlaceTopics(chat);
	if (!workspace || topics.length === 0) return null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), waitMs);
	});
	// The map Home read, told the lesson in progress (`here`), so opening a
	// lesson from Home reads the engine's kept map instead of running it again
	// (round 15, P7). `here` moves only the course's current arc, so a place
	// whose arc came from it is read from the map without it.
	const here = lessonTopics(stores.chatStore.listChats(), workspace)[0] ?? null;
	const placeIn = async (told: string | null): Promise<LessonPlace | null> => {
		const result = await stores.courseRecords.map(workspace, told);
		if (!result.ok) {
			const last = lastMaps.get(workspace);
			return last ? { ...lessonPlaceOf(last, topics), task: null } : null;
		}
		lastMaps.set(workspace, result.map);
		const place = { ...lessonPlaceOf(result.map, topics), task: await continuedTask(result.map, chat.messages) };
		const fromCurrent = place.topic !== null && !result.map.topics.find((t) => t.handle === place.topic!.handle)?.arc && result.map.current === place.topic.handle;
		return told !== null && fromCurrent ? placeIn(null) : place;
	};
	const read = placeIn(here).catch(() => null);
	try {
		return await Promise.race([read, late]);
	} finally {
		clearTimeout(timer);
	}
}
