/**
 * The lesson page's one course read: where the lesson sits (its topic and
 * that topic's arc, `lessonPlaceOf`), for the top bar's links
 * (components/lesson/lesson-roadmap.md). One engine `map` call when the
 * page opens, bounded so a slow engine never holds the lesson: past the
 * bound, or on any failure, the bar opens without the topic and arc.
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
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
	const read = stores.courseRecords
		.map(workspace)
		.then((result) => (result.ok ? lessonPlaceOf(result.map, topics) : null))
		.catch(() => null);
	try {
		return await Promise.race([read, late]);
	} finally {
		clearTimeout(timer);
	}
}
