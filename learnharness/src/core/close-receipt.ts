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
import { localDayOf, sinceLastClose, sinceStudyDay } from "./session-end.ts";
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

/** The question the session leaves open (his Done for today set it
 *  aside), where it waits and the day it is asked again: the day its
 *  lesson continues, its topic's next review, or its task's next study day
 *  (round 21, M3: "The kernel question is still waiting for you", with no
 *  day, and "You pick up with part (c) of Problem sheet 4" over the Eigen
 *  lesson's own open question). */
export interface CloseOpen {
	/** The title the close names it by: its topic's, or its task's. */
	title: string;
	/** Where it waits, in the close's words: "your Poisson distribution
	 *  lesson", "your Kernel and rank-nullity review", "Problem sheet 4". */
	place: string;
	in: "lesson" | "review" | "task";
	/** His half answer waits in its box. */
	half: boolean;
	day: string;
	day_words: string;
	/** Its topic, when it waits in that topic's lesson or review. */
	handle?: string;
}

export interface CloseReceipt {
	topics: CloseTopic[];
	moved: CloseMove[];
	continues?: CloseWork;
	open?: CloseOpen;
	/** The sentence the close copies for its days; empty when it has none. */
	says: string;
}

/** A save that went through, as the session holds it: the topics its
 *  attempts answered and the engine's receipt (`retrieval.dated`). */
export interface SessionSave {
	topics: readonly string[];
	receipt: Record<string, unknown>;
	/** The day the save was made, when the session holds it; a save of the
	 *  running turn has none, being today's. */
	day?: string;
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

/** "a", "a and b", "a, b and c". */
function and(parts: readonly string[]): string {
	return parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)!}`;
}

/** What falls on one day: its topics by kind, and the task that goes on. */
interface Day {
	day: string;
	words: string;
	topics: CloseTopic[];
	task?: CloseWork;
}

/** The day's topics of one kind, as a subject: "your Rank, Kernel reviews". */
function subjectOf(kind: CloseKind, topics: readonly CloseTopic[]): string {
	const list = titleList(topics.map((t) => t.title));
	const s = topics.length > 1 ? "s" : "";
	return kind === "review" ? `your ${list} review${s}` : kind === "continues" ? `your ${list} lesson${s}` : `your first ${list} lesson${s}`;
}

/** What a day holds, as subjects in the receipt's order (lessons, reviews,
 *  starts, then the task), a review of the one lesson that goes on that
 *  day said as its review, leaving out `own` (what the open question's
 *  clause already names). */
function subjectsOf(day: Day, own?: CloseOpen): string[] {
	const lessons = day.topics.filter((t) => t.kind === "continues" && !(own?.in === "lesson" && t.handle === own.handle));
	const lessonOf = own?.in === "lesson" ? own.handle : lessons.length === 1 ? lessons[0]!.handle : undefined;
	const reviews = day.topics.filter((t) => t.kind === "review" && !(own?.in === "review" && t.handle === own.handle));
	const its = reviews.some((t) => t.handle === lessonOf);
	const others = reviews.filter((t) => t.handle !== lessonOf);
	const starts = day.topics.filter((t) => t.kind === "start");
	return [
		...(lessons.length ? [subjectOf("continues", lessons)] : []),
		...(its ? ["its review"] : []),
		...(others.length ? [subjectOf("review", others)] : []),
		...(starts.length ? [subjectOf("start", starts)] : []),
		...(day.task && own?.in !== "task" ? [day.task.title] : []),
	];
}

/** A day's clause, its day said once (round 21, m12: "…continues
 *  tomorrow, Monday 9 November. Your Eigenvalues and eigenvectors review
 *  comes back tomorrow, Monday 9 November"). One kind keeps its own verb;
 *  several share the day ("your Eigenvalues and eigenvectors lesson and
 *  its review are tomorrow, Monday 9 November"). */
function dayClause(day: Day): string {
	const when = on(day.words);
	const kinds = new Set(day.topics.map((t) => t.kind));
	if (!day.task && kinds.size === 1) {
		const { kind } = day.topics[0]!;
		const many = day.topics.length > 1;
		if (kind === "start") return `you start ${titleList(day.topics.map((t) => t.title))} ${when}`;
		if (kind === "continues") return `${subjectOf(kind, day.topics)} continue${many ? "" : "s"} ${when}`;
		return day.words === "today" ? `${subjectOf(kind, day.topics)} ${many ? "are" : "is"} still due today` : `${subjectOf(kind, day.topics)} come${many ? "" : "s"} back ${when}`;
	}
	if (day.topics.length === 0 && day.task) return `${day.task.title} continues ${when}`;
	return `${and(subjectsOf(day))} are ${when}`;
}

/** The open question's clause, with whatever else falls on its day
 *  ("Your half answer waits in your Eigenvalues and eigenvectors lesson,
 *  which continues tomorrow, Monday 9 November, with its review"). */
function openClause(open: CloseOpen, day: Day | undefined): string {
	const what = open.half ? "your half answer" : "the question you left open";
	const rest = day ? subjectsOf(day, open) : [];
	return `${what} waits in ${open.place}, which ${open.in === "review" ? "comes back" : "continues"} ${on(open.day_words)}${rest.length ? `, with ${and(rest)}` : ""}`;
}

/** The receipt's sentence: the question he left open first, with its day,
 *  then one clause per day, soonest first, each day said once, then the
 *  moved starts. No title is quoted (round 21, m12). */
function saysOf(topics: readonly CloseTopic[], moved: readonly CloseMove[], continues: CloseWork | undefined, open: CloseOpen | undefined): string {
	const days = new Map<string, Day>();
	const dayOf = (day: string, words: string) => days.get(day) ?? days.set(day, { day, words, topics: [] }).get(day)!;
	// A review his open question waits in is dated by that question's clause.
	const dated = topics.filter((t) => !(open?.in === "review" && t.handle === open.handle));
	for (const topic of dated.sort((a, b) => a.day.localeCompare(b.day) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])) dayOf(topic.day, topic.day_words).topics.push(topic);
	if (continues) dayOf(continues.day, continues.day_words).task = continues;
	const sorted = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
	const clauses = new Map<string, string>();
	if (open) clauses.set(open.day, openClause(open, days.get(open.day)));
	for (const day of sorted) if (day.day !== open?.day) clauses.set(day.day, dayClause(day));
	// A start moved onto a day already said joins that day's clause.
	for (const move of moved) {
		const why = `${move.past_exam ? ", after the exam" : ""}${move.waits_on?.length ? `, since it waits on ${titleList(move.waits_on)}` : ""}`;
		const said = clauses.get(move.day);
		clauses.set(move.day, said ? `${said}, and you now start ${move.title} that day${why}` : `you now start ${move.title} ${on(move.day_words)}${why}`);
	}
	if (clauses.size === 0) return "";
	const sentence = [...clauses.values()].join("; ");
	return `${sentence[0]!.toUpperCase()}${sentence.slice(1)}.`;
}

function receipt(topics: CloseTopic[], moved: CloseMove[], continues?: CloseWork, open?: CloseOpen): CloseReceipt {
	const named = new Set(topics.map((t) => t.handle));
	const own = moved.filter((m) => !named.has(m.handle));
	return { topics, moved: own, ...(continues ? { continues } : {}), ...(open ? { open } : {}), says: saysOf(topics, own, continues, open) };
}

/** A receipt a save gave, added to the one the session held (his Done for
 *  today's, which also holds the lesson and the task that go on): the
 *  save's topics and moves on its days, the rest kept. */
export function withSaved(held: CloseReceipt, saved: CloseReceipt): CloseReceipt {
	const dated = new Set([...saved.topics, ...saved.moved].map((t) => t.handle));
	const moved = [...saved.moved, ...held.moved.filter((m) => !dated.has(m.handle))];
	return receipt([...held.topics.filter((t) => !dated.has(t.handle)), ...saved.topics], moved, saved.continues ?? held.continues, saved.open ?? held.open);
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
 *  answered them, and the starts the newest receipt says moved. Only the
 *  saves of the study day it closes count (round 21, M2). A topic no
 *  save dated has no day here, and one no receipt titled (a save made
 *  before receipts carried titles) is left to the closes that read the
 *  plan, never named by its handle. */
export function receiptOfSaves(all: readonly SessionSave[], today: string): CloseReceipt {
	const saves = all.filter((s) => s.day === undefined || s.day >= today);
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
	const days = map.topics.flatMap((t) => (t.excluded ? [] : [t.review?.kind === "scheduled" ? t.review.date : null, t.starts ?? null, t.starts && t.startsWhy?.kind === "begun" ? (t.startsWhy.then ?? null) : null])).filter((d): d is string => d !== null && d > map.today);
	return days.sort()[0] ?? null;
}

/** The question his Done for today left open, as the session holds it:
 *  its topic (null when the tutor tagged none), whether his half answer
 *  waits in its box, whether the session is his review, and the topic the
 *  session teaches or reviews first. */
export interface LeftQuestion {
	topic: string | null;
	half: boolean;
	review: boolean;
	own: string | null;
}

/** Where the open question waits and the day it is asked again: a review's
 *  on its topic's next review, or the course's next study day while that
 *  review is still due (a review he left stacks on his next study day); a
 *  lesson's on the day its lesson continues; a task's with the task. */
function openOf(map: CourseMap, byHandle: ReadonlyMap<string, CourseMapTopic>, topics: readonly CloseTopic[], task: CloseWork | undefined, left: LeftQuestion | undefined): CloseOpen | undefined {
	if (!left) return undefined;
	const next = nextStudyDay(map);
	const at = (where: Omit<CloseOpen, "half" | "day" | "day_words">, day: string | null): CloseOpen | undefined => (day ? { ...where, half: left.half, day, day_words: plannedDayWords(day, map.today) } : undefined);
	const handle = left.topic && byHandle.has(left.topic) ? left.topic : left.own;
	const topic = handle ? byHandle.get(handle) : undefined;
	if (left.review) {
		if (!topic) return undefined;
		const scheduled = topic.review?.kind === "scheduled" && topic.review.date > map.today ? topic.review.date : null;
		return at({ title: topic.title, place: `your ${topic.title} review`, in: "review", handle: topic.handle }, scheduled ?? next);
	}
	const lesson = topics.find((t) => t.kind === "continues");
	if (lesson) return at({ title: lesson.title, place: `your ${lesson.title} lesson`, in: "lesson", handle: lesson.handle }, lesson.day);
	if (task) return at({ title: task.title, place: task.title, in: "task" }, task.day);
	return topic ? at({ title: topic.title, place: `your ${topic.title} lesson`, in: "lesson", handle: topic.handle }, next) : undefined;
}

/** The receipt as the plan holds it after the session's saves: each of
 *  `handles` the map lists, with its day, the starts the newest receipt
 *  says moved, on the map's day, the first open task the session holds,
 *  on the course's next study day, when no lesson of it continues, and the
 *  question his Done for today left open (`left`), with its day. */
export function receiptOfMap(map: CourseMap, handles: readonly string[], saves: readonly SessionSave[], tasks: readonly string[] = [], left?: LeftQuestion): CloseReceipt {
	const byHandle = new Map(map.topics.map((t) => [t.handle as string, t]));
	const topics = [...new Set(handles)].flatMap((handle): CloseTopic[] => {
		const topic = byHandle.get(handle);
		const day = topic && !topic.excluded ? mapDay(topic, map.today) : null;
		return topic && day ? [{ handle, title: topic.title, ...day, day_words: plannedDayWords(day.day, map.today) }] : [];
	});
	const task = map.tasks.find((t) => tasks.includes(t.key));
	const next = task && !topics.some((t) => t.kind === "continues") ? nextStudyDay(map) : null;
	const continues = task && next ? { title: task.title, day: next, day_words: plannedDayWords(next, map.today) } : undefined;
	return receipt(topics, movesOf(saves.at(-1)?.receipt, map.today, (handle) => byHandle.get(handle)?.starts), continues, openOf(map, byHandle, topics, continues, left));
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
 *  its receipt and the day it was made; the topics its attempts answered come from the session's
 *  own transcript (`sessionTopicsOf`) and are left empty here. */
export function sessionSavesOf(messages: readonly LhMessage[]): SessionSave[] {
	return sinceLastClose(messages).flatMap((m) => {
		const saved = savedReceipt(m);
		return saved ? [{ topics: [], receipt: saved, day: localDayOf(m.timestamp) }] : [];
	});
}

/** The topics a close names, by handle: the lesson's own (those a session
 *  not a review was opened on and the topic its plan teaches), then each
 *  topic it answered since its last close on the study day it closes
 *  (round 21, M2). A review names only what it answered; a task's other
 *  topics are not the session's. */
export function closeTopicsOf(record: { title: string; topics?: readonly string[]; messages: readonly LhMessage[] }, today: string): string[] {
	const planned = sessionPlanTopicOf(record.messages);
	const own = reviewRecord(record) ? [] : [...(record.topics ?? []), ...(planned ? [planned] : [])];
	return [...new Set([...own, ...sessionTopicsOf(sinceStudyDay(record.messages, today))])];
}
