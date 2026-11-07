/**
 * The course brief's server seam: at the start of a learner's turn in a
 * course-linked session, fetch the engine's `resume` and return a fresh
 * brief marker when its key differs from the brief the agent can still see.
 * A failed engine call costs the turn nothing: no brief this time.
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
import { projectCourseBrief } from "../core/course-brief.ts";
import { newCourseContextMessage, visibleCourseBriefKey, type LhMessage } from "../core/native-messages.ts";
import { stores } from "./stores.ts";

export async function courseBriefFor(record: ChatRecord, messages: readonly LhMessage[]): Promise<LhMessage | null> {
	if (!record.course) return null;
	const resumed = await stores.courseRecords.run(record.course.workspace, { verb: "resume" });
	if (!resumed.ok) {
		console.error(`[chat ${record.id}] course brief skipped: ${resumed.message}`);
		return null;
	}
	const { key, text } = projectCourseBrief(resumed.json, record.kind === "practice" ? "practice" : "teach");
	if (visibleCourseBriefKey(messages) === key) return null;
	return newCourseContextMessage(text, key) as LhMessage;
}
