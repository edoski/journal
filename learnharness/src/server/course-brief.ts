/**
 * The course brief's server seam. The turn fetches the engine's `resume`
 * before it re-reads the record and takes the turn lock, so no engine call
 * sits inside the lock or between the record read and the write-ahead. A
 * failed engine call costs the turn nothing: no brief this time.
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
import { projectCourseBrief } from "../core/course-brief.ts";
import { newCourseContextMessage, visibleCourseBriefKey, type LhMessage } from "../core/native-messages.ts";
import { stores } from "./stores.ts";

export type CourseBrief = { key: string; text: string };

export async function fetchCourseBrief(record: ChatRecord): Promise<CourseBrief | null> {
	if (!record.course) return null;
	try {
		const resumed = await stores.courseRecords.run(record.course.workspace, { verb: "resume" });
		if (resumed.ok) return projectCourseBrief(resumed.json, record.kind === "practice" ? "practice" : "teach");
		console.error(`[chat ${record.id}] course brief skipped: ${resumed.message}`);
	} catch (err) {
		console.error(`[chat ${record.id}] course brief skipped:`, err);
	}
	return null;
}

/** The brief marker to add, or null when the agent already sees this key. */
export function courseBriefMarker(brief: CourseBrief | null, messages: readonly LhMessage[]): LhMessage | null {
	if (!brief || visibleCourseBriefKey(messages) === brief.key) return null;
	return newCourseContextMessage(brief.text, brief.key) as LhMessage;
}
