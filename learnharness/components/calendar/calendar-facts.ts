import { isReviewSession, taskTopics, type CalendarCourse, type ChatListItem, type CourseMap, type CourseMapTask, type CourseMapTopic, type PlannedDay, type ScheduledDay, type TopicHandle } from "@/src/core";
import { sessionState } from "@/components/nav/session-state";
import { daysBetween, leftWords } from "@/components/unit-inbox/units";
import { dayAndNearWords, distanceWords, heldExamWords, longDayWords, nextSessionWords, leftOutWords, lessonBegun, movedWords, overdueWords, startsAfterWords, type ExamGapTopic } from "@/components/study-words";
import { localDay, topicAction, type TopicAction } from "@/components/unit-inbox/topic-page/topic-facts";
import { courseMove, nextStepOf, titleList, todaySteps, type CourseMove, type NextStep } from "@/components/study-home/study-facts";
import { nowLine } from "@/components/study-home/needs-you";
import { lessonTitle } from "@/components/study-home/agenda-rows/row-facts";

/**
 * What the calendar draws (spec: calendar.md): the engine's dates and the
 * stored sessions as entries, one per thing on one day. The engine owns
 * every date: today's review is every one `plan` makes today, a later day shows
 * `plan`'s daily plan (its reviews and new topics), an exam is the
 * record's date, and the one clock is the engine's study day. Every
 * function here is pure.
 */

export interface CourseRef {
	workspace: string;
	title: string;
}

/** What a session is: practice, a review of course topics, or a lesson
 *  (a teaching session at any phase). */
export type SessionType = "lesson" | "practice" | "review";

export type CalendarEntry =
	| {
			kind: "exam";
			id: string;
			day: string;
			title: string;
			course: CourseRef;
			/** The session after this one, in words, when the exam lists one (`nextSessionWords`). */
			nextSession: string | null;
			road: readonly RoadWeek[];
			finalReview: string | null;
			doesNotFit: readonly string[];
			/** The first topic the plan still starts before the exam, while some do not fit (`firstExamStart`). */
			firstStart: string | null;
			unreviewed: readonly ExamGapTopic[];
			allStarted: boolean;
			next: NextMove | null;
	  }
	| {
			kind: "review";
			id: string;
			day: string;
			title: string;
			course: CourseRef;
			topic: CourseMapTopic;
			overdue: boolean;
			/** The day memory asked for an overdue review (`dueDay`), else null. */
			dueOn: string | null;
			since: string | null;
			waits: string | null;
			action: TopicAction;
	  }
	| { kind: "new"; id: string; day: string; title: string; course: CourseRef; topic: CourseMapTopic; waits: string | null; action: TopicAction }
	| {
			kind: "task";
			id: string;
			day: string;
			title: string;
			course: CourseRef;
			task: CourseMapTask;
			topic: CourseMapTopic | null;
			/** Continue, as Home's line for the task takes it (`courseMove`):
			 *  the session that holds it, else a new one (round 13, N6: it
			 *  started a new session beside the one Home and the sidebar open). */
			move: CourseMove;
			/** Home's one status for this work (`openWorkStatus`), or null. */
			status: string | null;
	  }
	| {
			kind: "session";
			id: string;
			day: string;
			title: string;
			course: CourseRef | null;
			chat: ChatListItem;
			type: SessionType;
			waits: boolean;
			topic: CourseMapTopic | null;
			/** The open task this session of today left (`holdsTask`): one
			 *  piece of work, so one entry under the session's name, saying
			 *  Home's status for it (`status`). */
			task: CourseMapTask | null;
			/** Home's one status for the session's open work
			 *  (`openWorkStatus`), or null. */
			status: string | null;
	  };

/** The next step toward an exam: the course's step as Home's line takes it
 *  up (`nextStepOf`, `courseMove`), split into Home's verb and what it works
 *  on, so the panel's button says only the verb and never wraps (round 5:
 *  "Review Random variables and distributions, Binomial distribution" drew a
 *  two-line button). */
export interface NextMove {
	verb: "Review" | "Continue" | "Start";
	what: string;
	/** The later day the plan holds it on, when nothing is left for today:
	 *  the panel names that day and offers no button, so it never invites
	 *  tomorrow's review today (round 10: 1 m9). */
	on: string | null;
	move: CourseMove;
}

/** A step's verb and what it works on: `stepWords` in two halves. Pure. */
function nextParts(step: Exclude<NextStep, { kind: "none" }>): Pick<NextMove, "verb" | "what"> {
	switch (step.kind) {
		case "review":
			return { verb: "Review", what: titleList(step.titles) };
		case "task":
			return { verb: "Continue", what: step.title };
		case "topic":
			return { verb: step.fresh ? "Start" : "Continue", what: step.title };
	}
}

/** One week of the road to an exam: the days in it that start new topics
 *  in the engine's daily plan, and those topics' titles in plan order. */
export interface RoadWeek {
	from: string;
	to: string;
	titles: readonly string[];
}

/** The Monday of a day's week, YYYY-MM-DD. */
function weekOf(day: string): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
	return date.toISOString().slice(0, 10);
}

/** The road to an exam: the daily plan's new topics before it, a line per
 *  week, a week split at the final review's start (`roadLines`). Pure. */
export function roadOf(planned: readonly PlannedDay[], exam: string, titleOf: (handle: TopicHandle) => string, finalReview: string | null = null): RoadWeek[] {
	const weeks: { key: string; from: string; to: string; titles: string[] }[] = [];
	for (const day of planned) {
		if (day.new.length === 0 || day.date >= exam) continue;
		const key = `${weekOf(day.date)}${finalReview !== null && day.date >= finalReview ? ":final" : ""}`;
		const last = weeks.at(-1);
		if (last?.key === key) {
			last.to = day.date;
			last.titles.push(...day.new.map(titleOf));
		} else weeks.push({ key, from: day.date, to: day.date, titles: day.new.map(titleOf) });
	}
	return weeks.map(({ from, to, titles }) => ({ from, to, titles }));
}

/** One line of the road to an exam: a week of new topics, or the final
 *  review's start. */
export type RoadLine = { kind: "week"; week: RoadWeek } | { kind: "final"; day: string };

/** The road's lines by date: the final review before the first week that
 *  starts on or after its day (`roadOf` splits a week at it), so a start
 *  inside it never reads above it (round 9: "17 Nov Variance" above "Final
 *  review from 13 Nov", "18 Nov Poisson" above "Final review now"). Pure. */
export function roadLines(road: readonly RoadWeek[], finalReview: string | null): RoadLine[] {
	const weeks = road.map((week): RoadLine => ({ kind: "week", week }));
	if (finalReview === null) return weeks;
	const at = road.findIndex((week) => week.from >= finalReview);
	const index = at < 0 ? weeks.length : at;
	return [...weeks.slice(0, index), { kind: "final", day: finalReview }, ...weeks.slice(index)];
}

/** The day memory asked for a review: the engine dates a due review on
 *  the day the plan takes it (today) and counts the days it is overdue, so
 *  the due day is that many days before (round 4: "Was due Sunday 8
 *  November" on Sunday 8 November, for a review due since Friday 6).
 *  Null for a review not due. Pure. */
export function dueDay(review: CourseMapTopic["review"]): string | null {
	if (review?.kind !== "due") return null;
	const date = new Date(`${review.date}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - review.overdue);
	return date.toISOString().slice(0, 10);
}

/** How an entry reads: its words, one per look, and where it sits in its
 *  day: exams first, then what is due (a new topic, the day's lesson,
 *  before its reviews), then what was done. A session that
 *  waits on him comes right after the exam (`rankOf`). */
export type EntryLook = "exam" | "overdue" | "review" | "new" | "task" | SessionType;

export const LOOKS: Record<EntryLook, { words: string; rank: number }> = {
	exam: { words: "Exam", rank: 0 },
	overdue: { words: "Overdue", rank: 1 },
	new: { words: "New topic", rank: 1.5 },
	review: { words: "Review", rank: 2 },
	task: { words: "Unfinished", rank: 3 },
	lesson: { words: "Lesson", rank: 4 },
	practice: { words: "Practice", rank: 4 },
};

/** Each look as the thing it is, singular and plural, for More's words. */
const THINGS: Record<EntryLook, [string, string]> = {
	exam: ["an exam", "exams"],
	overdue: ["an overdue review", "overdue reviews"],
	new: ["a new topic", "new topics"],
	review: ["a review", "reviews"],
	task: ["unfinished work", "unfinished work"],
	lesson: ["a lesson", "lessons"],
	practice: ["practice", "practice"],
};

/** What a day's More hides, by kind and never by number: "Also reviews
 *  and a new topic". `hidden` are the entries the day grid folds away. */
export function moreWords(hidden: readonly CalendarEntry[]): string {
	const counts = new Map<string, [string, string, number]>();
	for (const entry of hidden) {
		const [one, many] = THINGS[lookOf(entry)];
		const seen = counts.get(one);
		counts.set(one, [one, many, (seen?.[2] ?? 0) + 1]);
	}
	const things = [...counts.values()].map(([one, many, n]) => (n > 1 ? many : one));
	return things.length > 0 ? `Also ${listWords(things)}` : "More";
}

/** A new topic's plan status on the day the plan starts it. */
const PLANNED_TODAY = "Planned today";

/** An entry's words beside its icon: its look's, except a review due
 *  today, which says how late as Home's rows and the sidebar do ("Due
 *  today", "Due 5 Nov"), so one review never reads "Due 5 Nov" on Home
 *  and "Overdue" here (round 5). Pure. */
export function lookWords(entry: CalendarEntry, today: string): string {
	const review = entry.kind === "review" && entry.day === today ? entry.topic.review : null;
	if (review?.kind === "due") return overdueWords(review.overdue, today);
	// Open work says Home's status for it ("Left off today", "Your turn"), never a word of its own (round 12, 2 n2), and so
	// does a lesson or practice left for next time, never its kind (round 13, 2 n4: "Eigenvalues and eigenvectors · Practice");
	// a review stays Review (round 9, 2 m4).
	if ((entry.kind === "task" || entry.kind === "session") && entry.status && (lookOf(entry) === "task" || lookOf(entry) === "lesson" || lookOf(entry) === "practice")) return entry.status;
	// Today's new topic says its plan status, as Home, the sidebar and the course page's Now do (round 15, m1).
	if (lookOf(entry) === "new" && entry.day === today) return PLANNED_TODAY;
	return LOOKS[lookOf(entry)].words;
}

/** Home's one status for open work (`nowLine`, the function Home's rows
 *  and the sidebar's cards share): an unfinished session holding it is
 *  that session's line ("Your turn", "Left off today"), else the course's
 *  step for the task ("Left off 6 Nov"). Null when neither says anything,
 *  and the entry reads Unfinished (round 12, 2 n2: Problem sheet 4 read
 *  "Left off today" on Home and in the sidebar, "Unfinished" here). Pure. */
function openWorkStatus(course: CalendarCourse | undefined, chat: ChatListItem | null, task: CourseMapTask | null): string | null {
	const session = chat && sessionState(chat) !== "finished" ? nowLine({ kind: "session", chat, course: course ?? null }).slot : null;
	if (session || !course || !task) return session;
	const step = todaySteps(course).find((s) => s.kind === "task" && s.key === task.key);
	return step ? nowLine({ kind: "course", course, step }).slot : null;
}

/** Continue on an open task: Home's move for the course's step on it. Pure. */
function taskMove(course: CalendarCourse, chats: readonly ChatListItem[], task: CourseMapTask): CourseMove {
	const step = todaySteps(course).find((s) => s.kind === "task" && s.key === task.key);
	return courseMove(course, chats, step ?? { kind: "task", key: task.key, title: task.title, updated: task.updated, topics: [] });
}

export function lookOf(entry: CalendarEntry): EntryLook {
	switch (entry.kind) {
		case "exam":
			return "exam";
		case "review":
			return entry.overdue ? "overdue" : "review";
		case "new":
			// A lesson he began goes on: it is no new topic (round 12, 1 D3).
			return entry.topic.startsWhy?.kind === "begun" ? "lesson" : "new";
		case "task":
			return "task";
		case "session":
			// A review that turned into teaching is still the review (round 9,
			// 2 m4: it read Unfinished).
			return entry.task && entry.type !== "review" ? "task" : entry.type;
	}
}

/** Where an entry sits in its day. */
export function rankOf(entry: CalendarEntry): number {
	return entry.kind === "session" && entry.waits ? 0.5 : LOOKS[lookOf(entry)].rank;
}

/** A session as the calendar names it: practice, a review (opened on
 *  topics with a review's words, `isReviewSession`; round 8: "Review
 *  Binomial distribution · Lesson"), else a lesson, whatever step it
 *  reached (a lesson still asking its opening questions is not a quiz,
 *  round 3). */
export function sessionType(chat: ChatListItem): SessionType {
	if (chat.kind === "practice") return "practice";
	return isReviewSession(chat) ? "review" : "lesson";
}

/** The topics a session worked on that its course's map lists. */
function sessionTopics(chat: ChatListItem, courses: readonly CalendarCourse[]): string[] {
	const map = courses.find((c) => c.map.workspace === chat.course?.workspace)?.map;
	return map ? (chat.topics ?? []).filter((handle) => map.topics.some((t) => t.handle === handle)) : [];
}

/** True when every topic is in today's review: work on them today is
 *  that review, which its entry opens (`topicAction`). */
function inReview(topics: readonly string[], reviewing: ReadonlySet<string> | undefined): boolean {
	return topics.length > 0 && reviewing !== undefined && topics.every((t) => reviewing.has(t));
}

/** The first topic the session worked on that its course's map lists. */
function sessionTopic(chat: ChatListItem, courses: readonly CalendarCourse[]): CourseMapTopic | null {
	const map = courses.find((c) => c.map.workspace === chat.course?.workspace)?.map;
	if (!map) return null;
	for (const handle of chat.topics ?? []) {
		const topic = map.topics.find((t) => t.handle === handle);
		if (topic) return topic;
	}
	return null;
}

/** Whether a session holds an open task: it saved the task as open, or
 *  it is itself unfinished (left for next time, waiting on him, stopped)
 *  and worked on every topic the task holds, since a lesson's digest
 *  writes its unfinished step as a task on the lesson's topics. A finished
 *  session that only touched those topics holds none of it. Pure. */
export function holdsTask(chat: ChatListItem, task: CourseMapTask, holders: readonly string[]): boolean {
	if (chat.tasks?.includes(task.key)) return true;
	if (sessionState(chat) === "finished") return false;
	const topics = new Set(chat.topics ?? []);
	return holders.length > 0 && holders.every((handle) => topics.has(handle));
}

/**
 * Every entry on the calendar, by day and then by look:
 *   - each exam on its date, with the course's next step toward it while
 *     it is ahead;
 *   - today's review as `plan` made it, every review its day today holds,
 *     each overdue when past its date,
 *     and today's new topics from `plan`'s daily plan;
 *   - each later day's reviews and new topics as the daily plan proposes;
 *   - each open task today, since the engine dates none;
 *   - each session on the day of its last message (a day after the
 *     engine's counts as today);
 * one review once: a task or a session of today that holds only topics
 * in today's review folds into that review's entry, which opens it; and
 * one lesson once: an open task a session of today holds (`holdsTask`)
 * folds into that session's entry, which keeps the session's name, the
 * one the sidebar and Home give it, and reads Unfinished (round 4: one
 * lesson showed as "Eigenvalues lesson: eigenspaces and diagonalisation"
 * and "Eigenvalues and eigenvectors").
 * `chats` are every session, each with its topics; `scope` keeps one
 * course, and with it no session outside a course.
 */
export function calendarEntries({
	courses,
	chats,
	scope,
}: {
	courses: readonly CalendarCourse[];
	chats: readonly ChatListItem[];
	scope: string | null;
}): CalendarEntry[] {
	const shown = scope === null ? courses : courses.filter((c) => c.map.workspace === scope);
	const today = courses[0]?.map.today ?? "";
	const entries: CalendarEntry[] = [];
	/** Each course's topics in today's review: a task or a session of
	 *  today that holds only those is that review, so it is not its own
	 *  entry (round 3 saw one review as Overdue, Unfinished and Quiz). */
	const reviewedToday = new Map<string, ReadonlySet<string>>();
	/** Each session placed on today, by its course: the lessons an open
	 *  task may belong to. */
	const ofToday = (workspace: string) => chats.filter((chat) => chat.course?.workspace === workspace && sessionDay(chat, today) === today);
	/** Each open task a session of today holds, by session id. */
	const heldBy = new Map<string, CourseMapTask>();
	/** Each lesson left today whose rest goes on a later day: that day's
	 *  entry is the left work, so today's says only what he did. */
	const carried = new Set<string>();
	for (const studied of shown) {
		const { map, due, planned, doesNotFit, finalReview } = studied;
		const course = { workspace: map.workspace, title: map.title };
		const titleOf = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
		if (map.exam) {
			const road = roadOf(planned, map.exam.date, titleOf, finalReview);
			const allStarted = map.topics.length > 0 && road.length === 0 && doesNotFit.length === 0;
			const step = nextStepOf(studied);
			const next = map.exam.date > today && step.kind !== "none" ? { ...nextParts(step), on: (step.kind === "review" || step.kind === "topic") && step.on ? step.on : null, move: courseMove(studied, chats) } : null;
			const reasons = map.exam.reasons ?? {};
			const unreviewed = (map.exam.unreviewed ?? []).map((h): ExamGapTopic => {
				const reason = reasons[h];
				return reason ? { title: titleOf(h), reason } : { title: titleOf(h) };
			});
			entries.push({ kind: "exam", id: `exam:${map.workspace}`, day: map.exam.date, title: `${map.title} exam`, course, nextSession: nextSessionWords(map.exam), road, finalReview, doesNotFit: doesNotFit.map(titleOf), firstStart: firstExamStart(map)?.title ?? null, unreviewed, allStarted, next });
		}
		const facts = (topic: CourseMapTopic) => ({ title: topic.title, course, topic, action: topicAction(topic, map, chats) });
		const review = (topic: CourseMapTopic, day: string, overdue: boolean) => {
			const held = topic.review?.kind === "scheduled" && topic.review.date === day && topic.review.held ? topic.review : null;
			const told = topic.review?.date === day ? topic.moved : undefined;
			const since = told ? movedWords(told, today) : null;
			entries.push({ kind: "review", id: `review:${map.workspace}#${topic.handle}@${day}`, day, overdue, dueOn: overdue ? dueDay(topic.review) : null, since, waits: held && !told ? heldExamWords(held) : null, ...facts(topic) });
		};
		const fresh = (topic: CourseMapTopic, day: string) =>
			entries.push({ kind: "new", id: `new:${map.workspace}#${topic.handle}`, day, waits: topic.starts === day ? (leftOutWords(topic, map.exam) ?? (topic.moved ? movedWords(topic.moved, today) : startsAfterWords(topic.startsAfter))) : null, ...facts(topic) });
		const topicOf = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle);
		// Today's review is every review the daily plan makes today: `plan`'s `due` names only its first five, so a
		// sixth went unshown today and its first entry was the day after the exam the plan puts its next review on,
		// while its topic page and the tutor's brief said today (17 Nov: Binomial distribution on Sat 12 Dec).
		const todays = [...new Set([...(due ?? []), ...(planned.find((day) => day.date === today)?.reviews ?? [])])];
		for (const handle of todays) {
			const topic = topicOf(handle);
			if (topic) review(topic, today, topic.review?.kind === "due" && topic.review.overdue > 0);
		}
		for (const day of planned) {
			if (day.date < today) continue;
			for (const handle of day.date > today ? day.reviews : []) {
				const topic = topicOf(handle);
				if (topic) review(topic, day.date, false);
			}
			for (const handle of day.new) {
				const topic = topicOf(handle);
				// A lesson he began goes on today under its open task's own entry, and a lesson started on it today is its
				// start, under the session's entry: one piece of work, one entry (round 15, m6: "Linear maps · Your turn"
				// beside "Linear maps · New topic" on Sun 8).
				const started = day.date === today && ofToday(map.workspace).some((chat) => chat.kind !== "practice" && !isReviewSession(chat) && (chat.ownTopics ?? []).includes(handle));
				if (topic && !(day.date === today && lessonBegun(topic)) && !started) fresh(topic, day.date);
			}
		}
		const reviewing = new Set<string>(todays.filter((handle) => topicOf(handle)));
		reviewedToday.set(map.workspace, reviewing);
		for (const task of map.tasks) {
			const holders = taskTopics(task, map);
			if (inReview(holders.map((t) => t.handle), reviewing)) continue;
			const lesson = ofToday(map.workspace).find((chat) => !heldBy.has(chat.id) && !inReview(sessionTopics(chat, courses), reviewing) && holdsTask(chat, task, holders.map((t) => t.handle)));
			if (lesson) {
				heldBy.set(lesson.id, task);
				continue;
			}
			// One piece of work, one name: an unfinished session that holds the
			// task names it, as Home and the sidebar do (round 8: "Eigenvalues
			// and eigenvectors" on Home, "Eigenvalues lesson: eigenspaces and
			// diagonalising" here).
			const holder = chats.find((chat) => chat.course?.workspace === map.workspace && !chat.courseDeleted && sessionState(chat) !== "finished" && holdsTask(chat, task, holders.map((t) => t.handle)));
			// A review he left for next time rides with its topics' next review,
			// which opens it, never an Unfinished row of its own (round 10, 1 m7).
			if (holder && isReviewSession(holder) && sessionState(holder) === "left") continue;
			entries.push({ kind: "task", id: `task:${map.workspace}#${task.key}`, day: today, title: holder?.title ?? task.title, course, task, topic: holders[0] ?? null, move: taskMove(studied, chats, task), status: openWorkStatus(studied, holder ?? null, task) });
		}
		// The rest of a lesson he left for next time today goes on the course's next study day the plan holds, as the
		// close says it carries on (round 17, m14: only the next day's reviews showed). One entry that continues it, in
		// the words of Home's row for it, its title and its status (round 18, m12: "Invertible matrices lesson ·
		// Unfinished" here, "Continue Invertible matrices lesson · Left off today" on Home). It is the one entry of the left
		// work, and it says the day it was left as that day reads from its own, "Left off 10 Nov", never "Left off today"
		// on a later day; today's entry is what he did (round 19, m6: "Stirling's formula lesson · Left off today" on Tue 10
		// and "Continue Stirling's formula lesson · Left off today" on Wed 11).
		const next = planned.find((day) => day.date > today)?.date;
		for (const task of next ? map.tasks : []) {
			const holders = taskTopics(task, map).map((t) => t.handle);
			const lesson = ofToday(map.workspace).find((chat) => sessionType(chat) === "lesson" && sessionState(chat) === "left" && holdsTask(chat, task, holders));
			if (!lesson || planned.some((day) => day.date > today && day.new.some((h) => holders.includes(h)))) continue;
			carried.add(lesson.id);
			const title = lessonTitle({ kind: "session", chat: lesson, course: studied });
			entries.push({ kind: "task", id: `task:${map.workspace}#${task.key}@${next}`, day: next!, title, course, task, topic: taskTopics(task, map)[0] ?? null, move: { kind: "open", chat: lesson }, status: leftWords(lesson, next!) });
		}
	}
	for (const chat of chats) {
		const workspace = chat.course?.workspace;
		if (scope !== null && workspace !== scope) continue;
		const day = sessionDay(chat, today);
		if (day === today && workspace && inReview(sessionTopics(chat, courses), reviewedToday.get(workspace))) continue;
		const listed = courses.find((c) => c.map.workspace === workspace);
		const course = workspace ? { workspace, title: listed?.map.title ?? chat.course!.title } : null;
		const goesOn = carried.has(chat.id);
		const held = goesOn ? null : (heldBy.get(chat.id) ?? null);
		entries.push({
			kind: "session",
			id: `session:${chat.id}`,
			day,
			title: chat.title,
			course,
			chat,
			type: sessionType(chat),
			waits: sessionState(chat) === "your-turn",
			topic: sessionTopic(chat, courses),
			task: held,
			status: !goesOn && (held || sessionState(chat) === "left") ? openWorkStatus(listed, chat, held) : null,
		});
		// Every earlier day he worked in it shows it too, as what he did that day (round 16, m8: the Linear maps lesson
		// begun on 9 Nov showed only on 10 Nov, the day he left it).
		for (const earlier of (chat.studiedDays ?? []).filter((d) => d < day)) {
			entries.push({ kind: "session", id: `session:${chat.id}@${earlier}`, day: earlier, title: chat.title, course, chat, type: sessionType(chat), waits: false, topic: sessionTopic(chat, courses), task: null, status: null });
		}
	}
	return entries.sort((a, b) => a.day.localeCompare(b.day) || rankOf(a) - rankOf(b));
}

/** The day a session sits on: its last message's, a day after the
 *  engine's counting as today. Pure. */
function sessionDay(chat: ChatListItem, today: string): string {
	const local = localDay(chat.updatedAt);
	return today && local > today ? today : local;
}

/** "9:00 to 12:30", a window in the Journal's own times, the hour's
 *  leading zero dropped. */
function windowWords({ start, end }: { start: string; end: string }): string {
	const short = (time: string) => time.replace(/^0/, "");
	return `${short(start)} to ${short(end)}`;
}

/** What a day's head says of its study time: "Day off", "Day off in your
 *  Journal" for a day the Journal rests but the plan studies (his record
 *  shows he studies that weekday), the windows ("9:00 to 12:30, 13:30 to
 *  18:00"), or null when the Journal schedules nothing for it. */
export function studyTimeWords(day: ScheduledDay | undefined): string | null {
	if (!day) return null;
	if (day.off) return "Day off";
	if (day.journalOff) return "Day off in your Journal";
	return day.windows.length > 0 ? `Study ${day.windows.map(windowWords).join(", ")}` : null;
}

/** A day, and how far it is from the engine's, in the app's one form
 *  (`study-words.ts`). */
export { dayAndNearWords, distanceWords, longDayWords };

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const short = (day: string) => SHORT.format(new Date(`${day}T00:00:00Z`));

/** A road week's days: "9 to 13 Nov", "30 Nov to 4 Dec", "9 Nov". Pure. */
export function spanWords({ from, to }: Pick<RoadWeek, "from" | "to">): string {
	if (from === to) return short(from);
	const [a, b] = [short(from), short(to)];
	return a.split(" ")[1] === b.split(" ")[1] ? `${a.split(" ")[0]} to ${b}` : `${a} to ${b}`;
}

/** When the final review starts, "Final review from 27 Nov", or that it is
 *  under way. Pure. */
export function finalReviewWords(day: string | null, today: string): string | null {
	if (day === null) return null;
	return day > today ? `Final review from ${short(day)}` : "Final review now, until the exam";
}

/** "A, B and C". */
function listWords(items: readonly string[]): string {
	return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The first topic the exam's plan still starts before the exam, the one
 *  the exam line says to start with (`examLineWords`): of the topics not
 *  started that the exam examines and that fit, the earliest the plan
 *  starts, in path order on one day, so on the exam eve it is the start
 *  Home's Today offers (round 20, M2). Null with none. Pure. */
export function firstExamStart(map: Pick<CourseMap, "topics" | "exam">): CourseMapTopic | null {
	const { exam } = map;
	if (!exam) return null;
	const out = new Set<string>([...(exam.doesNotFit ?? []), ...(exam.leavesOut ?? [])]);
	const fits = map.topics.filter((t) => t.level === "new" && t.starts !== undefined && t.starts < exam.date && !out.has(t.handle));
	return fits.sort((a, b) => a.starts!.localeCompare(b.starts!))[0] ?? null;
}

/** The topics the plan has no room to start before the exam, named: the
 *  course head's Which topics. */
export function misfitWords(titles: readonly string[]): string | null {
	return titles.length > 0 ? `No room before the exam to start ${listWords(titles)}` : null;
}

/** True when no entry falls in [start, end). */
export function quietBetween(entries: readonly CalendarEntry[], start: string, end: string): boolean {
	return !entries.some((entry) => entry.day >= start && entry.day < end);
}
