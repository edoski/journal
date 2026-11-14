/**
 * The course brief's server seam. The turn fetches the engine's `resume`
 * and every course's `map` before it re-reads the record and takes the
 * turn lock, so no engine call sits inside the lock or between the record
 * read and the write-ahead. A failed engine call costs the turn nothing: no
 * brief this time, or a brief without the part that call reads.
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
import { recordHasArcs } from "../core/contracts/course.ts";
import { projectCourseBrief, type CoursePlans } from "../core/course-brief.ts";
import { newCourseContextMessage, sessionModeOf, visibleCourseBriefKey, type LhMessage } from "../core/native-messages.ts";
import { planDays, plannedOf } from "./calendar.ts";
import { stores } from "./stores.ts";
import { readCourses } from "./study.ts";

export type CourseBrief = { key: string; text: string };

export async function fetchCourseBrief(record: ChatRecord): Promise<CourseBrief | null> {
	if (!record.course) return null;
	const { workspace } = record.course;
	const role = sessionModeOf(record.messages, record.kind);
	try {
		// The engine calls run side by side; a failed plan read drops only the
		// daily plan, and with it practice's exam run-up, which only `plan`
		// reports: the open course's own plan carries it.
		const [resumed, read] = await Promise.all([stores.courseRecords.run(workspace, { verb: "resume" }), fetchCoursePlans(record.id, workspace)]);
		const runup = role === "practice" && read?.own ? { plan: read.own, workspace } : undefined;
		if (resumed.ok) return projectCourseBrief(resumed.json, role, { runup, arcCheck: record.arcCheck, plan: read?.plans, opened: openedOn(record) });
		console.error(`[chat ${record.id}] course brief skipped: ${resumed.message}`);
	} catch (err) {
		console.error(`[chat ${record.id}] course brief skipped:`, err);
	}
	return null;
}

/** Every registered course's map and daily plan, the open course's
 *  included, read as the calendar reads them (`readCourses` with its
 *  `planDays`): the plan the engine makes with every course together, up
 *  to each exam and six weeks at least, every review of every topic. A
 *  course that cannot be read is named, never silently left out. `own` is
 *  the open course's `plan` output, which carries its exam run-up. */
async function fetchCoursePlans(chatId: string, workspace: string): Promise<{ plans: CoursePlans; own: unknown } | undefined> {
	try {
		const listing = await readCourses(planDays);
		if (!listing.available) {
			console.error(`[chat ${chatId}] daily plan skipped: ${listing.reason}`);
			return undefined;
		}
		return {
			plans: { workspace, courses: listing.read.map(({ map, plan }) => ({ map, days: plannedOf(plan, map) })), unread: listing.failed.map((c) => c.title) },
			own: listing.read.find(({ map }) => map.workspace === workspace)?.plan ?? null,
		};
	} catch (err) {
		console.error(`[chat ${chatId}] daily plan skipped:`, err);
		return undefined;
	}
}

/** The topics a session was opened on: a topic's page or Home's review
 *  set `topics` at creation. A session the tutor named took its topic from
 *  that name instead (and is `named`), and an arc's check carries its own
 *  block, so neither was opened on a topic. */
function openedOn(record: ChatRecord): readonly string[] {
	return record.named || record.arcCheck ? [] : (record.topics ?? []);
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
