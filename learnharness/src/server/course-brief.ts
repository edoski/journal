/**
 * The course brief's server seam. The turn fetches the engine's `resume`
 * and every course's `map` before it re-reads the record and takes the
 * turn lock, so no engine call sits inside the lock or between the record
 * read and the write-ahead. A failed engine call costs the turn nothing: no
 * brief this time, or a brief without the part that call reads.
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
import { recordHasArcs } from "../core/contracts/course.ts";
import type { CourseMap } from "../core/contracts/course-map.ts";
import { projectCourseBrief, type CoursePlans } from "../core/course-brief.ts";
import { newCourseContextMessage, sessionModeOf, visibleCourseBriefKey, type LhMessage } from "../core/native-messages.ts";
import { stores } from "./stores.ts";

export type CourseBrief = { key: string; text: string };

export async function fetchCourseBrief(record: ChatRecord): Promise<CourseBrief | null> {
	if (!record.course) return null;
	const { workspace } = record.course;
	const role = sessionModeOf(record.messages, record.kind);
	try {
		// Practice also reads the exam run-up, which only `plan` reports; the
		// engine calls run side by side, and a failed `plan` only drops the
		// run-up line, a failed plan read only the daily plan.
		const [resumed, planned, plan] = await Promise.all([
			stores.courseRecords.run(workspace, { verb: "resume" }),
			role === "practice" ? stores.courseRecords.run(workspace, { verb: "plan" }).catch(() => null) : null,
			fetchCoursePlans(record.id, workspace),
		]);
		if (planned && !planned.ok) console.error(`[chat ${record.id}] exam run-up skipped: ${planned.message}`);
		const runup = planned?.ok ? { plan: planned.json, workspace } : undefined;
		if (resumed.ok) return projectCourseBrief(resumed.json, role, { runup, arcCheck: record.arcCheck, plan });
		console.error(`[chat ${record.id}] course brief skipped: ${resumed.message}`);
	} catch (err) {
		console.error(`[chat ${record.id}] course brief skipped:`, err);
	}
	return null;
}

/** Every registered course's `map`, the open course's included: the daily
 *  plan of each, which the engine makes with every course together. All or
 *  nothing, so the brief never presents part of the plan as all of it. */
async function fetchCoursePlans(chatId: string, workspace: string): Promise<CoursePlans | undefined> {
	try {
		const listing = await stores.courseRecords.list();
		if (!listing.available) {
			console.error(`[chat ${chatId}] daily plan skipped: ${listing.reason}`);
			return undefined;
		}
		const others = listing.courses.map((c) => c.workspace).filter((w) => w !== workspace);
		const read = await Promise.all([workspace, ...others].map((w) => stores.courseRecords.map(w)));
		const maps: CourseMap[] = [];
		for (const result of read) {
			if (!result.ok) {
				console.error(`[chat ${chatId}] daily plan skipped: ${result.message}`);
				return undefined;
			}
			maps.push(result.map);
		}
		return { workspace, maps };
	} catch (err) {
		console.error(`[chat ${chatId}] daily plan skipped:`, err);
		return undefined;
	}
}

/** Whether the session's course groups its topics into arcs, read every
 *  turn beside the brief, since the agent's prompt carries the arcs doctrine
 *  only then. A failed read composes without it: the engine places new
 *  topics itself and refuses an arc field in a course without arcs. */
export async function fetchCourseArcs(record: ChatRecord): Promise<boolean> {
	if (!record.course) return false;
	try {
		const shown = await stores.courseRecords.run(record.course.workspace, { verb: "show", handles: "all" });
		if (shown.ok) return recordHasArcs(shown.json);
		console.error(`[chat ${record.id}] arcs unread, composed without: ${shown.message}`);
	} catch (err) {
		console.error(`[chat ${record.id}] arcs unread, composed without:`, err);
	}
	return false;
}

/** The brief marker to add, or null when the agent already sees this key. */
export function courseBriefMarker(brief: CourseBrief | null, messages: readonly LhMessage[]): LhMessage | null {
	if (!brief || visibleCourseBriefKey(messages) === brief.key) return null;
	return newCourseContextMessage(brief.text, brief.key) as LhMessage;
}
