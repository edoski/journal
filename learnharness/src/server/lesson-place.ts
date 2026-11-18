/**
 * The lesson page's one course read: where the lesson sits (its topic and
 * that topic's arc, `lessonPlaceOf`), for the top bar's links
 * (components/lesson/lesson-roadmap.md). One engine `map` call when the
 * page opens, bounded so a slow engine never holds the lesson: past the
 * bound, or on any failure, the bar opens without the topic and arc.
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
import { lessonTopics } from "../core/course-map-build.ts";
import { lessonPlaceOf, type LessonPlace } from "../core/lesson-place.ts";
import { sessionTopicsOf } from "../core/native-messages.ts";
import { stores } from "./stores.ts";

/** How long the page waits for the course map before it opens without it. */
export const LESSON_PLACE_WAIT_MS = 1500;

/** The lesson's candidate topics, as the session list reads them: the
 *  ones it was started on, then those its transcript worked on. */
export async function lessonPlace(chat: Pick<ChatRecord, "course" | "topics" | "messages">, waitMs = LESSON_PLACE_WAIT_MS): Promise<LessonPlace | null> {
	const workspace = chat.course?.workspace;
	const topics = [...new Set([...(chat.topics ?? []), ...sessionTopicsOf(chat.messages)])];
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
		if (!result.ok) return null;
		const place = lessonPlaceOf(result.map, topics);
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
