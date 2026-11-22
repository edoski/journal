import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { foldLines, lessonTitle, lineKey, whyOf, type Why } from "@/components/study-home/agenda-rows/row-facts";
import { laterOnly, openSessions, todayRows, type TodayRow } from "@/components/study-home/study-facts";
import { lapsedNow, lapsedOnWords, SLIP_WORDS } from "@/components/study-words";
import { rowStatus, rowWords, type RowStatus } from "@/components/study-home/agenda-rows/row-standing";
import { sessionState } from "@/components/nav/session-state";
import { localDay } from "@/components/day-change";

/** One of Today's lines with what the sidebar draws it by: its reason, the
 *  topics it takes up (resolved on its course's map) and the one it leads
 *  with. */
export interface NowLine {
	/** `lineKey(row)`. */
	key: string;
	row: TodayRow;
	/** The line's one name, the same wherever it is drawn: Home's lesson
	 *  (`lessonTitle`: the session's title, "Continue Problem sheet 4",
	 *  "Review A, B"). The sidebar's card shows it, not its lead topic's
	 *  title, so one item never has two names. */
	title: string;
	/** Home's reason, `whyOf(row)`. */
	why: Why | null;
	/** `lineTopics(row)`, resolved on the line's course map, the lead
	 *  first. */
	topics: readonly CourseMapTopic[];
	/** The topic the line's reason is about (`leadOf`), `topics[0]`, or
	 *  null. */
	lead: CourseMapTopic | null;
	/** The line's one status, Home's row's (`rowStatus`), so a session or
	 *  a review says the same on Home and on the sidebar's card. */
	status: RowStatus | null;
	/** The status's words for a 12px status slot (`slotWords` for a
	 *  reason, a new topic's in Home's words), or null. */
	slot: string | null;
}

/** What needs the learner now: exactly Home's Today. */
export interface NeedsYou {
	/** What Home's Today draws, in its order. */
	rows: readonly TodayRow[];
	/** The lines Today shows (`foldLines(rows).shown`). */
	lines: readonly NowLine[];
	/** The lines Today folds into "Also today". */
	also: readonly NowLine[];
}

/**
 * The course topics a line takes up, in its own order: a waiting session's
 * topics that are on its course's map, in map order (none with no course);
 * a course's step topics as the step holds them (a review in the plan's
 * order, a task's held topics else the current topic, a topic step its
 * topic, none for "none"). Pure.
 */
export function lineTopics(row: TodayRow): TopicHandle[] {
	if (row.kind === "session") {
		if (!row.course) return [];
		const held = new Set<string>(row.chat.topics ?? []);
		return row.course.map.topics.filter((t) => held.has(t.handle)).map((t) => t.handle);
	}
	return row.step.kind === "none" ? [] : [...row.step.topics];
}

/** The reason's words for a status slot: Home's words, a new topic's
 *  reason when it names topics ("After Random variables and
 *  distributions"), never an arc, except a
 *  lapse on the lead topic itself ("Not right last time") when the card's
 *  `title` already names it, as a topic's own row does; a review titled by
 *  its course ("Calculus I review", round 18 m10) keeps the topic. Pure. */
export function slotWords(why: Why | null, lead: CourseMapTopic | null, title?: string): string | null {
	if (!why) return null;
	if (why.kind === "missed" && lead && why.short === lapsedOnWords(lead.title) && (title === undefined || title.includes(lead.title))) return SLIP_WORDS.lapsed;
	// A new topic's reason when it names the topics it waits on, as Home's line says it (round 13, 1 n5: "Planned today"
	// beside Home's "After Random variables…"); a reason naming an arc stays plain, since a sidebar card names no arc (Edo, 14 Nov).
	return why.starts?.kind === "after" && why.starts.words.startsWith("After ") ? why.starts.words : why.short;
}

/**
 * The topic a line's reason is about, so a card titled by it and its
 * reason name the same topic: for a session, of the topics it belongs
 * to, the one its open question or problem is on, else the one its plan's
 * steps are on (`stepsOn`), else its first (none when it has none on the
 * map), never a step's name; a lapse's lapsed topic; an open task's
 * current topic when the task holds it, else none, since the record does
 * not say which of its topics the task is at (round 5: "Continue Problem
 * sheet 4" opened the Basis page, its first topic); else the line's
 * first topic. `whyOf` picks the lapsed topic the same way. Pure.
 */
export function leadOf(row: TodayRow, topics: readonly CourseMapTopic[], why: Why | null): CourseMapTopic | null {
	if (row.kind === "session") {
		// The topic its open work is on, else its steps', before the first it belongs to (round 19, M4: sheet 4's
		// kernel question led with Rank, the task's first topic).
		const [first] = [...(row.chat.openOn ?? []), ...(row.chat.stepsOn ? [row.chat.stepsOn] : []), ...(row.chat.ownTopics ?? [])];
		return topics.find((t) => t.handle === first) ?? null;
	}
	if (why?.kind === "missed") {
		// The first lapse in the line's own order, the order its review asks in (round 19, m11).
		const lapsed = topics.find((t) => lapsedNow(t.signals));
		if (lapsed) return lapsed;
	}
	if (row.kind === "course" && row.step.kind === "task") return topics.find((t) => t.handle === row.course.map.current) ?? null;
	return topics[0] ?? null;
}

/** A line as Today and the sidebar draw it, its one status included
 *  (`rowStatus`), for any session or course step: the calendar's open
 *  work reads its status here too (round 12, 2 n2). Pure. */
export function nowLine(row: TodayRow): NowLine {
	const byHandle = new Map((row.course?.map.topics ?? []).map((t) => [t.handle, t]));
	const taken = lineTopics(row).flatMap((h) => byHandle.get(h) ?? []);
	const why = whyOf(row);
	const lead = leadOf(row, taken, why);
	const topics = lead ? [lead, ...taken.filter((t) => t !== lead)] : taken;
	const status = rowStatus(row);
	const title = lessonTitle(row);
	const slot = status?.kind === "standing" ? rowWords(status.facts) : status ? slotWords(status.why, lead, title) : null;
	return { key: lineKey(row), row, title, why, topics, lead, status, slot };
}

/**
 * What needs the learner now (spec: today.md, "Needs you now"): Home's
 * Today lines, in Today's order and with Today's reasons, each with the
 * topics it takes up. Only today's work: a course whose next item the
 * plan dates on a later day, or with nothing to take up, has no line, so
 * neither Today nor its fold ("Also today") names it. Home draws `rows`;
 * the sidebar's top draws `lines`, each as the topic it leads with. With
 * `readAt`, when the courses' read began, a session finished today since
 * then ends its step's line before the next read knows it (`todayRows`).
 * Pure.
 */
export function needsYouNow(courses: readonly StudyCourse[], chats: readonly ChatListItem[], today: string, readAt?: string): NeedsYou {
	const settled = readAt === undefined ? [] : chats.filter((c) => !c.courseDeleted && c.updatedAt > readAt && sessionState(c) === "finished" && localDay(new Date(c.updatedAt)) === today);
	const rows = todayRows(courses, openSessions(chats), today, settled).filter((row) => row.kind === "session" || !laterOnly(row.step));
	const { shown, also } = foldLines(rows);
	return { rows, lines: shown.map(nowLine), also: also.map(nowLine) };
}
