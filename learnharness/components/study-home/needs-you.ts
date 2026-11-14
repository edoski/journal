import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { foldLines, lineKey, whyOf, type Why } from "@/components/study-home/agenda-rows/row-facts";
import { openSessions, todayRows, type TodayRow } from "@/components/study-home/study-facts";
import { SLIP_WORDS } from "@/components/study-words";

/** One of Today's lines with what the sidebar draws it by: its reason, the
 *  topics it takes up (resolved on its course's map) and the one it leads
 *  with. */
export interface NowLine {
	/** `lineKey(row)`. */
	key: string;
	row: TodayRow;
	/** Home's reason, `whyOf(row)`. */
	why: Why | null;
	/** `lineTopics(row)`, resolved on the line's course map, the lead
	 *  first. */
	topics: readonly CourseMapTopic[];
	/** The topic the line's reason is about (`leadOf`), `topics[0]`, or
	 *  null. */
	lead: CourseMapTopic | null;
	/** The reason's words for a 12px status slot, or null with no reason. */
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

/** The reason's words for a status slot: Home's short words, except a lapse
 *  on the lead topic itself ("Missed last time", since the card already
 *  names it). Pure. */
export function slotWords(why: Why | null, lead: CourseMapTopic | null): string | null {
	if (!why) return null;
	if (why.kind === "missed" && lead && why.short === `Missed ${lead.title}`) return SLIP_WORDS.lapsed;
	return why.short;
}

/**
 * The topic a line's reason is about, so a card titled by it and its
 * reason name the same topic: a session's own topic, the one it belongs
 * to, fixed for its life (none when it has none on the map), never the
 * topic its lesson is on now; a lapse's lapsed topic; an open task's
 * current topic when the task holds it; else the line's first topic.
 * `whyOf` picks the lapsed topic the same way. Pure.
 */
export function leadOf(row: TodayRow, topics: readonly CourseMapTopic[], why: Why | null): CourseMapTopic | null {
	if (row.kind === "session") {
		const [own] = row.chat.ownTopics ?? [];
		return topics.find((t) => t.handle === own) ?? null;
	}
	if (why?.kind === "missed") {
		const held = new Set(topics.map((t) => t.handle));
		const lapsed = row.course?.map.topics.find((t) => held.has(t.handle) && t.signals.lapsed);
		if (lapsed) return lapsed;
	}
	if (row.kind === "course" && row.step.kind === "task") {
		const current = topics.find((t) => t.handle === row.course.map.current);
		if (current) return current;
	}
	return topics[0] ?? null;
}

function nowLine(row: TodayRow): NowLine {
	const byHandle = new Map((row.course?.map.topics ?? []).map((t) => [t.handle, t]));
	const taken = lineTopics(row).flatMap((h) => byHandle.get(h) ?? []);
	const why = whyOf(row);
	const lead = leadOf(row, taken, why);
	const topics = lead ? [lead, ...taken.filter((t) => t !== lead)] : taken;
	return { key: lineKey(row), row, why, topics, lead, slot: slotWords(why, lead) };
}

/**
 * What needs the learner now (spec: today.md, "Needs you now"): Home's
 * Today lines, in Today's order and with Today's reasons, each with the
 * topics it takes up. Home draws `rows`; the sidebar's top draws
 * `lines`, each as the topic it leads with. Pure.
 */
export function needsYouNow(courses: readonly StudyCourse[], chats: readonly ChatListItem[], today: string): NeedsYou {
	const rows = todayRows(courses, openSessions(chats), today);
	const { shown, also } = foldLines(rows);
	return { rows, lines: shown.map(nowLine), also: also.map(nowLine) };
}
