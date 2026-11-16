/**
 * The course brief's server seam. The turn fetches the engine's `resume`
 * and every course's `map` before it re-reads the record and takes the
 * turn lock, so no engine call sits inside the lock or between the record
 * read and the write-ahead. A failed engine call costs the turn nothing: no
 * brief this time, or a brief without the part that call reads.
 *
 * Those reads are kept until a course record changes or the study day
 * turns (round 12, 3 D8): each was an engine process replaying every
 * course's plan, eleven of them before the tutor could start, about 3 s
 * on an idle Mac and 15 s beside other work, on every turn. Every write is
 * announced (`course-changed`, the app's own saves and other hosts' alike;
 * `courses-changed` for the list), and drops them. A turn that changed a
 * course reads them again as it settles, so his next input finds them
 * ready. Event-driven, never a timer.
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
import { recordHasArcs, type CourseResult } from "../core/contracts/course.ts";
import { lessonTopics } from "../core/course-map-build.ts";
import { studyDay } from "../core/day-words.ts";
import { subscribe } from "../core/events.ts";
import { projectCourseBrief, type CoursePlans } from "../core/course-brief.ts";
import { reviewRecord } from "../core/session-opening.ts";
import { newCourseContextMessage, sessionModeOf, visibleCourseBriefKey, type LhMessage } from "../core/native-messages.ts";
import { planDays, plannedOf } from "./calendar.ts";
import { stores } from "./stores.ts";
import { readCourses } from "./study.ts";
import { isTurnRunning } from "./turn-liveness.ts";

export type CourseBrief = { key: string; text: string };

export async function fetchCourseBrief(record: ChatRecord): Promise<CourseBrief | null> {
	if (!record.course) return null;
	const { workspace } = record.course;
	const role = sessionModeOf(record.messages, record.kind);
	try {
		// The engine calls run side by side; a failed plan read drops only the
		// daily plan, and with it practice's exam run-up, which only `plan`
		// reports: the open course's own plan carries it.
		const [resumed, read] = await Promise.all([keptResume(workspace), fetchCoursePlans(record.id, workspace)]);
		const runup = role === "practice" && read?.own ? { plan: read.own, workspace } : undefined;
		if (resumed.ok) return projectCourseBrief(resumed.json, role, { runup, arcCheck: record.arcCheck, plan: read?.plans, opened: openedOn(record), review: reviewRecord(record) });
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
		const listing = await keptCourses();
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

type Listing = Awaited<ReturnType<typeof readCourses>>;
interface Kept<T> { key: string; value: Promise<T> }
interface KeptReads {
	/** Moves on every announced write: a read kept under an older one is gone. */
	generation: number;
	courses?: Kept<Listing>;
	resumes: Map<string, Kept<CourseResult>>;
	/** The courses a brief was read for, whose reads are made again ahead. */
	warm: Set<string>;
	/** Reads being made ahead, and the courses owed another pass after them. */
	running: Map<string, Promise<void>>;
	owed: Set<string>;
	unsubscribe?: () => void;
}
type CourseBriefGlobal = { __lhCourseBriefReads?: KeptReads };

/** The kept reads, listening for what drops them from their first use, so
 *  nothing ever reads them unannounced. */
function keptReads(): KeptReads {
	const g = globalThis as typeof globalThis & CourseBriefGlobal;
	const reads: KeptReads = (g.__lhCourseBriefReads ??= { generation: 0, resumes: new Map(), warm: new Set(), running: new Map(), owed: new Set() });
	reads.unsubscribe ??= subscribe((event) => {
		if (event.type === "course-changed" || event.type === "courses-changed") {
			reads.generation++;
			// A write no turn of the course made (another host, a background
			// job, a save's own echo from the folder watch): read again now.
			for (const workspace of reads.warm) if (!turnRunsIn(workspace)) readAhead(workspace);
		} else if (event.type === "turn-settled") {
			const workspace = stores.chatStore.getChat(event.chatId)?.course?.workspace;
			if (workspace && reads.warm.has(workspace)) readAhead(workspace);
		}
	});
	return reads;
}

function turnRunsIn(workspace: string): boolean {
	return stores.chatStore.listChats().some((c) => c.course?.workspace === workspace && isTurnRunning(c.id));
}

/** One read kept under its key: the generation and the study day, and
 *  what else the read takes. A read that failed, even in part, is not kept:
 *  the next turn tries again. */
function kept<T>(current: Kept<T> | undefined, key: string, read: () => Promise<T>, ok: (value: T) => boolean, keep: (entry: Kept<T> | undefined) => void): Promise<T> {
	if (current?.key === key) return current.value;
	const entry: Kept<T> = { key, value: read() };
	keep(entry);
	void entry.value.then((value) => { if (!ok(value)) keep(undefined); }, () => keep(undefined));
	return entry.value;
}

function keptResume(workspace: string): Promise<CourseResult> {
	const reads = keptReads();
	reads.warm.add(workspace);
	const key = `${reads.generation} ${studyDay()}`;
	return kept(reads.resumes.get(workspace), key, () => stores.courseRecords.run(workspace, { verb: "resume" }), (r) => r.ok, (entry) => {
		if (entry) reads.resumes.set(workspace, entry);
		else if (reads.resumes.get(workspace)?.key === key) reads.resumes.delete(workspace);
	});
}

/** Every course's map and plan, as `readCourses(planDays)` reads them. Its
 *  maps take each course's newest open lesson's topics, so those are part
 *  of the key. */
function keptCourses(): Promise<Listing> {
	const reads = keptReads();
	const chats = stores.chatStore.listChats();
	const lessons = [...new Set(chats.flatMap((c) => (c.course ? [c.course.workspace] : [])))].sort().map((w) => [w, lessonTopics(chats, w)[0] ?? null]);
	const key = `${reads.generation} ${studyDay()} ${JSON.stringify(lessons)}`;
	return kept(reads.courses, key, () => readCourses(planDays), (l) => l.available && l.failed.length === 0 && l.read.every((c) => c.plan !== null), (entry) => {
		if (entry) reads.courses = entry;
		else if (reads.courses?.key === key) reads.courses = undefined;
	});
}

/** Makes a course's brief reads ahead of his next input; once at a time,
 *  and once more after it when a write came meanwhile. */
function readAhead(workspace: string): void {
	const reads = keptReads();
	if (reads.running.has(workspace)) {
		reads.owed.add(workspace);
		return;
	}
	const run = Promise.all([keptResume(workspace), keptCourses()]).then(() => {}, () => {}).finally(() => {
		reads.running.delete(workspace);
		if (reads.owed.delete(workspace)) readAhead(workspace);
	});
	reads.running.set(workspace, run);
}

/** The reads being made ahead, for tests: resolves once none is. */
export async function courseBriefReadsSettled(): Promise<void> {
	const reads = keptReads();
	while (reads.running.size > 0) await Promise.all(reads.running.values());
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
