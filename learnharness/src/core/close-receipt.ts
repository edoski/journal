/**
 * The close receipt: what every session's close says of the plan, the same
 * for a lesson, a review, practice, a task and a sheet (round 20, M3 and
 * m8). It names the topics this session answered, each with its day, the
 * lesson's or task's next day, and each start a save moved, with its new
 * day, and nothing else: no topic the session never touched, no calendar,
 * no "next time". `says` is the one sentence a close copies; the voice
 * guard holds the close to the receipt. Pure.
 *
 * Round 19's closes were composed per kind: the lesson's close read a
 * day's whole plan across courses (`day_items`) and recited five reviews
 * the lesson never touched, the review's close read only its last save's
 * receipt, and a close with three days could leave the rest "on your
 * calendar".
 */

import type { CourseMap, CourseMapTopic } from "./contracts/course-map.ts";
import { plannedDayWords } from "./day-words.ts";
import { PRACTICE_CONCLUDE_TOOL, sessionPlanTopicOf, sessionTopicsOf, type LhMessage } from "./native-messages.ts";
import { sinceLastClose } from "./session-end.ts";
import { reviewRecord } from "./session-opening.ts";

/** How a topic comes back: its next review, its first lesson, or the rest
 *  of a lesson he began. */
export type CloseKind = "review" | "start" | "continues";

/** A topic the session answered, with the day the plan gives it. */
export interface CloseTopic {
	handle: string;
	title: string;
	kind: CloseKind;
	day: string;
	day_words: string;
}

/** A first lesson a save of his study today moved, with its new day and
 *  what it waits on, by title. */
export interface CloseMove {
	handle: string;
	title: string;
	day: string;
	day_words: string;
	waits_on?: string[];
	past_exam?: true;
}

/** Open work the session holds that goes on: a task, by its title. */
export interface CloseWork {
	title: string;
	day: string;
	day_words: string;
}

export interface CloseReceipt {
	topics: CloseTopic[];
	moved: CloseMove[];
	continues?: CloseWork;
	/** The sentence the close copies for its days; empty when it has none. */
	says: string;
}

/** A save that went through, as the session holds it: the topics its
 *  attempts answered and the engine's receipt (`retrieval.dated`). */
export interface SessionSave {
	topics: readonly string[];
	receipt: Record<string, unknown>;
}

/** "Span", "Span, Rank": titles joined by commas only, since a title may
 *  hold its own "and" (round 20, m8: "Rank and the column space and Kernel
 *  and rank-nullity" read as four topics). Home's `titleList` is this. */
export function titleList(titles: readonly string[]): string {
	return titles.join(", ");
}

const on = (words: string) => (words === "today" || words.startsWith("tomorrow") ? words : `on ${words}`);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

const KIND_ORDER: Readonly<Record<CloseKind, number>> = { continues: 0, review: 1, start: 2 };

/** The receipt's sentence: one clause per day and kind, soonest first,
 *  then the moved starts. */
function saysOf(topics: readonly CloseTopic[], moved: readonly CloseMove[], continues: CloseWork | undefined): string {
	const groups = new Map<string, CloseTopic[]>();
	for (const topic of [...topics].sort((a, b) => a.day.localeCompare(b.day) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])) {
		const key = `${topic.day} ${topic.kind}`;
		groups.set(key, [...(groups.get(key) ?? []), topic]);
	}
	const clauses = [...groups.values()].map((group) => {
		const { kind, day_words: words } = group[0]!;
		const list = titleList(group.map((t) => t.title));
		const many = group.length > 1;
		if (kind === "review") return words === "today" ? `your ${list} review${many ? "s are" : " is"} still due today` : `your ${list} review${many ? "s come" : " comes"} back ${on(words)}`;
		if (kind === "continues") return `your ${list} lesson${many ? "s continue" : " continues"} ${on(words)}`;
		return `you start ${list} ${on(words)}`;
	});
	if (continues) clauses.push(`${continues.title} continues ${on(continues.day_words)}`);
	for (const move of moved) {
		const waits = move.waits_on?.length ? `, since it waits on ${titleList(move.waits_on)}` : "";
		clauses.push(`“${move.title}” now starts ${on(move.day_words)}${move.past_exam ? ", after the exam" : ""}${waits}`);
	}
	if (clauses.length === 0) return "";
	const sentence = clauses.join("; ");
	return `${sentence[0]!.toUpperCase()}${sentence.slice(1)}.`;
}

function receipt(topics: CloseTopic[], moved: CloseMove[], continues?: CloseWork): CloseReceipt {
	const named = new Set(topics.map((t) => t.handle));
	const own = moved.filter((m) => !named.has(m.handle));
	return { topics, moved: own, ...(continues ? { continues } : {}), says: saysOf(topics, own, continues) };
}

/** A receipt a save gave, added to the one the session held (his Done for
 *  today's, which also holds the lesson and the task that go on): the
 *  save's topics and moves on its days, the rest kept. */
export function withSaved(held: CloseReceipt, saved: CloseReceipt): CloseReceipt {
	const dated = new Set([...saved.topics, ...saved.moved].map((t) => t.handle));
	const moved = [...saved.moved, ...held.moved.filter((m) => !dated.has(m.handle))];
	return receipt([...held.topics.filter((t) => !dated.has(t.handle)), ...saved.topics], moved, saved.continues ?? held.continues);
}

/** The starts a receipt says his study today moved (`starts_moved`). */
function movesOf(saved: Record<string, unknown> | undefined, today: string, startOf: (handle: string) => string | undefined = () => undefined): CloseMove[] {
	const moved = isRecord(saved?.starts_moved) ? saved.starts_moved : {};
	return Object.entries(moved).flatMap(([handle, entry]) => {
		if (!isRecord(entry) || typeof entry.title !== "string") return [];
		const day = startOf(handle) ?? (typeof entry.starts === "string" ? entry.starts : undefined);
		if (!day) return [];
		const waits = isRecord(entry.moved) ? strings(entry.moved.waits_on) : [];
		return [{ handle, title: entry.title, day, day_words: plannedDayWords(day, today), ...(waits.length ? { waits_on: waits } : {}), ...(entry.past_exam === true ? { past_exam: true as const } : {}) }];
	});
}

/** The receipt as the session's saves give it, with no read of the plan:
 *  each topic a save dated, on the day its newest save's receipt gives it
 *  and by the title a receipt gave it, in the order the session first
 *  answered them, and the starts the newest receipt says moved. A topic no
 *  save dated has no day here, and one no receipt titled (a save made
 *  before receipts carried titles) is left to the closes that read the
 *  plan, never named by its handle. */
export function receiptOfSaves(saves: readonly SessionSave[], today: string): CloseReceipt {
	const days = new Map<string, string>();
	const titles = new Map<string, string>();
	for (const { receipt: saved } of saves) {
		for (const [handle, review] of Object.entries(isRecord(saved.reviews) ? saved.reviews : {})) {
			if (!isRecord(review) || typeof review.planned !== "string") continue;
			days.set(handle, review.planned);
			if (typeof review.title === "string") titles.set(handle, review.title);
		}
	}
	const order = [...new Set(saves.flatMap((s) => [...s.topics, ...Object.keys(isRecord(s.receipt.reviews) ? s.receipt.reviews : {})]))];
	const topics = order.flatMap((handle): CloseTopic[] => {
		const day = days.get(handle);
		const title = titles.get(handle);
		return day && title ? [{ handle, title, kind: "review", day, day_words: plannedDayWords(day, today) }] : [];
	});
	return receipt(topics, movesOf(saves.at(-1)?.receipt, today));
}

/** A topic's day on the plan as the map holds it: its next review (today
 *  while it is due), else the day a lesson he began continues (one he
 *  worked on today goes on its next day, round 14, m2), else its start. */
function mapDay(topic: CourseMapTopic, today: string): { kind: CloseKind; day: string } | null {
	if (topic.review) return { kind: "review", day: topic.review.kind === "due" ? today : topic.review.date };
	if (topic.starts && topic.startsWhy?.kind === "begun") return { kind: "continues", day: topic.starts === today && topic.startsWhy.then ? topic.startsWhy.then : topic.starts };
	if (topic.starts) return { kind: "start", day: topic.starts };
	return null;
}

/** The course's next study day the plan holds after today, which open
 *  work he left goes on (as the calendar carries it). */
function nextStudyDay(map: CourseMap): string | null {
	const days = map.topics.flatMap((t) => (t.excluded ? [] : [t.review?.kind === "scheduled" ? t.review.date : null, t.starts ?? null])).filter((d): d is string => d !== null && d > map.today);
	return days.sort()[0] ?? null;
}

/** The receipt as the plan holds it after the session's saves: each of
 *  `handles` the map lists, with its day, the starts the newest receipt
 *  says moved, on the map's day, and the first open task the session
 *  holds, on the course's next study day, when no lesson of it continues. */
export function receiptOfMap(map: CourseMap, handles: readonly string[], saves: readonly SessionSave[], tasks: readonly string[] = []): CloseReceipt {
	const byHandle = new Map(map.topics.map((t) => [t.handle as string, t]));
	const topics = [...new Set(handles)].flatMap((handle): CloseTopic[] => {
		const topic = byHandle.get(handle);
		const day = topic && !topic.excluded ? mapDay(topic, map.today) : null;
		return topic && day ? [{ handle, title: topic.title, ...day, day_words: plannedDayWords(day.day, map.today) }] : [];
	});
	const task = map.tasks.find((t) => tasks.includes(t.key));
	const next = task && !topics.some((t) => t.kind === "continues") ? nextStudyDay(map) : null;
	const continues = task && next ? { title: task.title, day: next, day_words: plannedDayWords(next, map.today) } : undefined;
	return receipt(topics, movesOf(saves.at(-1)?.receipt, map.today, (handle) => byHandle.get(handle)?.starts), continues);
}

const CONCLUDE_RECORD = "Course record: ";

/** The engine's receipt a save's result carries: a `course_save` result's
 *  JSON, or a practice conclude's after "Course record:". */
function savedReceipt(m: LhMessage): Record<string, unknown> | null {
	if (m.role !== "toolResult" || m.isError || (m.toolName !== "course_save" && m.toolName !== PRACTICE_CONCLUDE_TOOL)) return null;
	const text = m.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text ?? "";
	const at = m.toolName === "course_save" ? 0 : text.indexOf(CONCLUDE_RECORD);
	if (at < 0) return null;
	try {
		const parsed: unknown = JSON.parse(m.toolName === "course_save" ? text : text.slice(at + CONCLUDE_RECORD.length));
		return isRecord(parsed) && isRecord(parsed.reviews) ? parsed : null;
	} catch {
		return null;
	}
}

/** The saves the session made since its last close, in order. Each holds
 *  its receipt; the topics its attempts answered come from the session's
 *  own transcript (`sessionTopicsOf`) and are left empty here. */
export function sessionSavesOf(messages: readonly LhMessage[]): SessionSave[] {
	return sinceLastClose(messages).flatMap((m) => {
		const saved = savedReceipt(m);
		return saved ? [{ topics: [], receipt: saved }] : [];
	});
}

/** The topics a close names, by handle: the lesson's own (those a session
 *  not a review was opened on and the topic its plan teaches), then each
 *  topic it answered since its last close. A review names only what it
 *  answered; a task's other topics are not the session's. */
export function closeTopicsOf(record: { title: string; topics?: readonly string[]; messages: readonly LhMessage[] }): string[] {
	const planned = sessionPlanTopicOf(record.messages);
	const own = reviewRecord(record) ? [] : [...(record.topics ?? []), ...(planned ? [planned] : [])];
	return [...new Set([...own, ...sessionTopicsOf(sinceLastClose(record.messages))])];
}
