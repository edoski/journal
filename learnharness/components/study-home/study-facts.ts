import { courseReviewName, isReviewSession, taskTopics, type ChatListItem, type CourseMapTopic, type StudyCourse, type TopicHandle } from "@/src/core";
import { examText } from "@/components/start/course-facts";
import { continueMove, sessionState, type SessionState } from "@/components/nav/session-state";
import { SOLID, taskSessions, topicSessions } from "@/components/unit-inbox/units";
import { CONTINUE_OPENING } from "@/components/start/course-facts";
import { localDay } from "@/components/day-change";
import { lessonBegun } from "@/components/study-words";

/** "Span", "Span, Rank", "Span, Rank, Basis and dimension": every title,
 *  in order, joined by commas only, since a title may hold its own "and"
 *  ("Random variables and distributions") and "and more" hid which topics
 *  a review takes up (13 Nov 2026). Never a count. Pure. */
export function titleList(titles: readonly string[]): string {
	return titles.join(", ");
}

function overdue(t: CourseMapTopic): number {
	return t.review?.kind === "due" ? t.review.overdue : -1;
}

/** The topics due for review today, the ones the engine calls weak first,
 *  then the most overdue. Pure. */
export function reviewTopics(course: StudyCourse): CourseMapTopic[] {
	return course.map.topics
		.filter((t) => t.review?.kind === "due")
		.sort((a, b) => Number(b.weak) - Number(a.weak) || overdue(b) - overdue(a));
}

/** Today's review as the engine planned it (`plan`'s due list, in its
 *  order), else, without a plan, every topic due today. Pure. */
export function todaysReview(course: StudyCourse): CourseMapTopic[] {
	if (course.due === null) return reviewTopics(course);
	const byHandle = new Map(course.map.topics.map((t) => [t.handle, t]));
	return course.due.flatMap((h) => byHandle.get(h) ?? []);
}

/** What a course's Continue takes up, in the order the doctrine answers
 *  "Let's continue": today's reviews, then the open task at its step, then
 *  the new topics the engine's daily plan starts today, then the current
 *  topic while it is taught but not yet his own and the engine has set no
 *  review for it, then the plan's next item on a later day (`on`, its
 *  date): the reviews it dates first, or the new topics it starts first,
 *  whichever comes sooner. A current topic he already has on his own is
 *  done, not next. `topics` are the topics it works on. A topic step is
 *  `fresh` when it was never taught, and `planned` when today's plan
 *  starts it. */
export type NextStep =
	| { kind: "review"; titles: readonly string[]; topics: readonly TopicHandle[]; then: string | null; on?: string }
	| { kind: "task"; key: string; title: string; updated: string | null; topics: readonly TopicHandle[] }
	| { kind: "topic"; title: string; topics: readonly TopicHandle[]; fresh: boolean; planned: boolean; on?: string }
	| { kind: "none" };

export function nextStepOf(course: StudyCourse): NextStep {
	return todaySteps(course)[0]!;
}

/**
 * Every step a course holds for today, in the order Continue takes them, as
 * the calendar lists today: today's review, each open task (the focused one
 * first), then the new topics the plan starts today. With none of them, the
 * one step after (`nextStepOf`'s rest): the current topic while it is
 * taught, not yet his own and given no review, else the plan's next item on
 * a later day, else the current topic not started, else none. Round 7:
 * Today showed only the first, so Problem sheet 4 left Home once focus moved
 * to a lesson's task, and Poisson, planned today, hid behind the review,
 * while the calendar listed both. Never empty. Pure.
 */
export function todaySteps(course: StudyCourse): NextStep[] {
	const { map } = course;
	const focused = map.tasks.find((t) => t.key === map.focus);
	const tasks = focused ? [focused, ...map.tasks.filter((t) => t !== focused)] : map.tasks;
	const current = map.topics.find((t) => t.handle === map.current);
	const steps: NextStep[] = [];
	const reviews = todaysReview(course);
	if (reviews.length > 0) {
		steps.push({ kind: "review", titles: reviews.map((t) => t.title), topics: reviews.map((t) => t.handle), then: tasks[0]?.title ?? current?.title ?? null });
	}
	for (const task of tasks) {
		const held = taskTopics(task, map).map((t) => t.handle);
		steps.push({ kind: "task", key: task.key, title: task.title, updated: task.updated, topics: held.length > 0 ? held : current ? [current.handle] : [] });
	}
	const planned = course.newToday.flatMap((h) => map.topics.find((t) => t.handle === h) ?? []);
	// A lesson he began goes on today: Continue, never Start (round 12, 1 D3),
	// and the open task holding it is that Continue (round 14, M7: Home listed
	// the begun Poisson lesson twice on the exam eve, as its task and its topic).
	const held = new Set(steps.flatMap((s) => (s.kind === "task" ? s.topics : [])));
	for (const group of [planned.filter((t) => lessonBegun(t) && !held.has(t.handle)), planned.filter((t) => !lessonBegun(t))]) {
		if (group.length > 0) steps.push({ kind: "topic", title: titleList(group.map((t) => t.title)), topics: group.map((t) => t.handle), fresh: !lessonBegun(group[0]!), planned: true });
	}
	if (steps.length > 0) return steps;
	if (current && current.level !== "new" && !SOLID.has(current.level) && !current.review) {
		return [{ kind: "topic", title: current.title, topics: [current.handle], fresh: false, planned: false }];
	}
	return [laterStep(course) ?? (current?.level === "new" ? { kind: "topic", title: current.title, topics: [current.handle], fresh: true, planned: false } : { kind: "none" })];
}

/** The plan's next item after today, or null when it dates none: the
 *  reviews on its first dated day, or the new topics it starts on it,
 *  whichever day comes first (reviews first on the same day, as Continue
 *  takes them). Pure. */
function laterStep(course: StudyCourse): NextStep | null {
	const { topics, today } = course.map;
	const reviewDay = (t: CourseMapTopic) => (t.review?.kind === "scheduled" && t.review.date > today ? t.review.date : null);
	const startDay = (t: CourseMapTopic) => (t.starts !== undefined && t.starts > today ? t.starts : null);
	const first = (days: (string | null)[]) => days.filter((d): d is string => d !== null).sort()[0] ?? null;
	const review = first(topics.map(reviewDay));
	const start = first(topics.map(startDay));
	if (review !== null && (start === null || review <= start)) {
		const due = topics.filter((t) => reviewDay(t) === review);
		return { kind: "review", titles: due.map((t) => t.title), topics: due.map((t) => t.handle), then: null, on: review };
	}
	if (start === null) return null;
	const fresh = topics.filter((t) => startDay(t) === start);
	return { kind: "topic", title: titleList(fresh.map((t) => t.title)), topics: fresh.map((t) => t.handle), fresh: true, planned: false, on: start };
}

/** Whether a course's step holds nothing for today: nothing to take up,
 *  such as a course never studied, or an item the plan dates on a later
 *  day. Home's Today and the sidebar's top leave such a line out; the
 *  course page and the exam panel still name it, with its day. Pure. */
export function laterOnly(step: NextStep): boolean {
	return step.kind === "none" || ((step.kind === "review" || step.kind === "topic") && step.on !== undefined);
}

const PLAN_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** A plan day as the app writes it: "Sun 15 Nov". Pure. */
export const planDay = (date: string) => PLAN_DAY.format(new Date(`${date}T00:00:00Z`)).replace(",", "");

/** "Continue" and a title, never twice for a task titled with it
 *  ("Continue Eigenvalues: the full 2×2 computation"). Pure. */
export function continueWords(title: string): string {
	return /^Continue\s/.test(title) ? title : `Continue ${title}`;
}

/** The step as a line names it: a review of more than one topic by its
 *  course's review ("Probability review"), as the session it opens is
 *  named, never the list of its topics (round 18, m10: Home's row and its
 *  sidebar card read "Review Binomial distribution, Inclusion-exclusion
 *  principle, Random variables and distributions", clamped at "…and…");
 *  else its instruction (`stepWords`), which the session opens with.
 *  Pure. */
export function stepTitle(step: NextStep, courseTitle: string): string {
	return step.kind === "review" && step.titles.length > 1 ? courseReviewName(courseTitle) : stepWords(step);
}

/** The step as a short instruction: "Review Linear independence, Rank",
 *  "Continue Problem sheet 4", "Start Poisson distribution" for a topic not
 *  started. Pure. */
export function stepWords(step: NextStep): string {
	switch (step.kind) {
		case "review":
			return `Review ${titleList(step.titles)}`;
		case "task":
			return continueWords(step.title);
		case "topic":
			return `${step.fresh ? "Start" : "Continue"} ${step.title}`;
		case "none":
			return "Start a lesson";
	}
}

/** The exam in words with its date, "Exam in 11 days", or null. Pure. */
export function examWords(course: StudyCourse): string | null {
	return examText(course.map.exam);
}

/**
 * The home's one cross-course order: a course inside its exam run-up
 * first, nearest exam first, then the nearest exam outside it, then the
 * most recent activity, then the engine's order. TEMPORARY: it moves into
 * the engine once the brief names the day's course; no other app-side
 * priority exists. Pure.
 */
export function byUrgency(courses: readonly StudyCourse[]): StudyCourse[] {
	const examDays = (c: StudyCourse) => (c.map.exam && c.map.exam.daysLeft >= 0 ? c.map.exam.daysLeft : Infinity);
	const idleDays = (c: StudyCourse) => c.lastActiveDaysAgo ?? Infinity;
	const runup = (c: StudyCourse) => (c.unready === null ? 1 : 0);
	return courses
		.map((course, index) => ({ course, index }))
		.sort(
			(a, b) =>
				runup(a.course) - runup(b.course) ||
				examDays(a.course) - examDays(b.course) ||
				idleDays(a.course) - idleDays(b.course) ||
				a.index - b.index,
		)
		.map(({ course }) => course);
}

/** One line of Today: a session to pick up, or a course's next step. */
export type TodayRow =
	| { kind: "session"; chat: ChatListItem; course: StudyCourse | null }
	| { kind: "course"; course: StudyCourse; step: NextStep };

/** Whether a session works on a course's next step: it holds the open task,
 *  or it was started on, or worked on, every topic the step takes up. A
 *  review is worked on only by a review of those topics: a lesson left on a
 *  topic due today is not its review (round 8: the promised Eigen review
 *  showed on Home only as its unfinished lesson, which the row opened). */
function covers(chat: ChatListItem, step: NextStep): boolean {
	if (step.kind === "none") return true;
	if (step.kind === "task" && chat.tasks?.some((key) => key === step.key)) return true;
	if (step.kind === "review" && !isReviewSession(chat)) return false;
	const topics = new Set(chat.topics ?? []);
	return step.topics.every((h) => topics.has(h));
}

/** Whether a step is the engine's plan for today: today's review, or the
 *  new topics the plan starts today. An open task, the current topic taken
 *  up with nothing planned, or an item on a later day is not. Pure. */
const planned = (step: NextStep) => !laterOnly(step) && (step.kind === "review" || (step.kind === "topic" && step.planned));

/** The learner's own calendar day of a session's last turn. Pure. */
const lastDay = (chat: ChatListItem) => localDay(new Date(chat.updatedAt));

/**
 * Today's lines, the day's plan first (round 9, 1 D1: every session closed
 * with Done for today came back to the top, due or not, and pushed the
 * plan into "Also today"; round 10, 1 m2: only opening Problem sheet 4 put
 * it above the exam's review, and lessons left on the course's tasks
 * pushed the plan's new topic into "Also today"):
 *   1. each course's plan for today (`planned`: its review, then the new
 *      topics the plan starts today), most urgent course first, so the
 *      exam's course leads; a step a waiting session, or a lesson left for
 *      next time, works on is that session's line, in the step's place;
 *   2. each other session waiting on him since yesterday (it waits on the
 *      learner, the tutor writes in it, or stopped mid-reply), most recent
 *      first;
 *   3. each course's other steps for today, in the same course order: its
 *      open tasks, or the current topic with nothing planned; a step a
 *      lesson left for next time works on is that lesson's line, in its
 *      place;
 *   4. each other lesson left for next time on an earlier day, however long
 *      ago, most recent first;
 *   5. the lines with nothing for today (`laterOnly`).
 * A step a session he ended today works on has no line, nor does a task a
 * waiting session holds, since that session has its own line; today's
 * review leaves only with the topics he answered today (round 17, M4).
 * A review left for next time has no line of its own: it waits for its
 * topics' next review day, when the review's line opens it (`courseMove`),
 * and its topic page keeps it meanwhile. A session he ended with Done for
 * today has no line until tomorrow: he said he is done with it for today,
 * and Home's Studied today names it (round 4). A lesson on a topic in
 * today's review takes that topic's review into its line, in the review's
 * place, unless he opened a review of it, which is then the topic's line
 * and the lesson's line comes back once that review is done. An older session waiting on him stays in the
 * sidebar. A session that settled after the courses were read (`settled`)
 * ends its step's line too, until a read that knows it lands (round 13,
 * 1 n1: after a close Home showed Start Poisson distribution for 15 s).
 * Pure.
 */
export function todayRows(courses: readonly StudyCourse[], open: readonly ChatListItem[], today: string, settled: readonly ChatListItem[] = []): TodayRow[] {
	const since = addDays(today, -1);
	const left = (c: ChatListItem) => sessionState(c) === "left";
	const leftToday = (c: ChatListItem) => left(c) && lastDay(c) >= today;
	const ordered = byUrgency(courses);
	const byWorkspace = new Map(ordered.map((c) => [c.map.workspace, c]));
	const courseOf = (chat: ChatListItem) => (chat.course && byWorkspace.get(chat.course.workspace)) ?? null;
	const waiting = open.filter((c) => !left(c) && lastDay(c) >= since);
	// The topics in each course's review today that a review he opened and has not finished takes up: that review
	// is their line today.
	const reviewed = (workspace: string | undefined) => {
		const course = workspace === undefined ? undefined : byWorkspace.get(workspace);
		const due = new Set<string>(course ? todaysReview(course).map((t) => t.handle) : []);
		return new Set(open.filter((c) => c.course?.workspace === workspace && isReviewSession(c)).flatMap((c) => (c.ownTopics ?? []).filter((h) => due.has(h))));
	};
	// A lesson whose topics such a review takes up gives it its line until the review is done.
	const yields = (c: ChatListItem) => (c.ownTopics ?? []).length > 0 && (c.ownTopics ?? []).every((h) => reviewed(c.course?.workspace).has(h));
	const leftovers = open.filter((c) => left(c) && !leftToday(c) && !isReviewSession(c) && !yields(c));
	const ended = [...open.filter(leftToday), ...settled];
	const session = (chat: ChatListItem): TodayRow => ({ kind: "session", chat, course: courseOf(chat) });
	const placed = new Set<ChatListItem>();
	const plan: TodayRow[] = [];
	const tasks: TodayRow[] = [];
	const later: TodayRow[] = [];
	for (const course of ordered) {
		const own = (chats: readonly ChatListItem[], step: NextStep) => chats.find((chat) => chat.course?.workspace === course.map.workspace && covers(chat, step));
		// The course's lessons with a line today, waiting on him or left on an earlier day.
		const lessons = [...waiting, ...leftovers].filter((c) => c.course?.workspace === course.map.workspace && c.kind !== "practice" && !isReviewSession(c));
		const opened = reviewed(course.map.workspace);
		for (const whole of todaySteps(course)) {
			let step = whole;
			// While a topic's lesson is open, today's review of the topic is that lesson's line, in the review's place
			// (his answers there count as it), unless he opened a review of it (round 15, m6: "Review Linear maps · Due
			// today" beside "Continue Linear maps … lesson"). The rest of the review keeps its line.
			if (step.kind === "review" && step.on === undefined) {
				const review = step;
				const takers = lessons.filter((c) => (c.ownTopics ?? []).some((h) => review.topics.includes(h as TopicHandle) && !opened.has(h)));
				for (const lesson of takers) {
					if (placed.has(lesson)) continue;
					placed.add(lesson);
					plan.push(session(lesson));
				}
				const taken = new Set(takers.flatMap((c) => c.ownTopics ?? []));
				const kept = review.topics.flatMap((h, i) => (taken.has(h) ? [] : [{ handle: h, title: review.titles[i]! }]));
				if (kept.length === 0) continue;
				step = { ...review, topics: kept.map((t) => t.handle), titles: kept.map((t) => t.title) };
			}
			// A start of several topics drops one whose lesson a session of his took up today, as the calendar
			// draws it (round 16, M4: "Start Expectation and linearity, Geometric distribution" beside the Geometric
			// lesson a review took up).
			if (step.kind === "topic" && step.topics.length > 1) {
				const start = step;
				const taken = new Set([...waiting, ...leftovers, ...ended].filter((c) => c.course?.workspace === course.map.workspace && c.kind !== "practice" && !isReviewSession(c)).flatMap((c) => c.ownTopics ?? []));
				const kept = course.map.topics.filter((t) => start.topics.includes(t.handle) && !taken.has(t.handle));
				if (kept.length > 0 && kept.length < start.topics.length) step = { ...start, title: titleList(kept.map((t) => t.title)), topics: kept.map((t) => t.handle) };
			}
			// A task that holds a lesson the plan goes on with today is the plan's, ahead of its new starts
			// (round 13, 1 n3: "Start Geometric" sat above "Continue Poisson distribution lesson").
			const goesOn = step.kind === "task" && step.topics.some((h) => course.newToday.includes(h));
			const rows = planned(step) || goesOn ? plan : tasks;
			// A review leaves Today only for the topics he answered today: one he left today, or that settled after
			// the read, keeps the line of the topics it did not answer, which opens it (round 17, M4: "your
			// Inclusion-exclusion principle review is still due today", and Home had no line for it).
			if (step.kind === "review" && step.on === undefined) {
				const review = step;
				const answered = new Set(ended.filter((c) => c.course?.workspace === course.map.workspace).flatMap((c) => Object.entries(c.answeredOn ?? {}).flatMap(([h, d]) => (d >= today ? [h] : []))));
				const kept = review.topics.flatMap((h, i) => (answered.has(h) ? [] : [{ handle: h, title: review.titles[i]! }]));
				if (kept.length === 0) continue;
				step = { ...review, topics: kept.map((t) => t.handle), titles: kept.map((t) => t.title) };
			} else if (own(ended, step)) continue;
			const active = own(waiting, step);
			if (active) {
				if (planned(step) && !placed.has(active)) {
					placed.add(active);
					rows.push(session(active));
				}
				continue;
			}
			// An older session still open on the step's task is its line, so Home says that session's own status,
			// as the calendar and the topic page do (round 14, m28: "Left off 10 Nov" here, "Your turn" there).
			const holder = step.kind === "task" ? open.find((c) => !left(c) && c.course?.workspace === course.map.workspace && c.tasks?.includes(step.key)) : undefined;
			const lesson = own(leftovers, step) ?? holder;
			if (laterOnly(step)) {
				if (!lesson) later.push({ kind: "course", course, step });
			} else if (!lesson) {
				rows.push({ kind: "course", course, step });
			} else if (!placed.has(lesson)) {
				placed.add(lesson);
				rows.push(session(lesson));
			}
		}
	}
	const unplaced = (chats: readonly ChatListItem[]) => chats.filter((c) => !placed.has(c)).map(session);
	return [...plan, ...unplaced(waiting), ...tasks, ...unplaced(leftovers), ...later];
}

/** The courses of Today's lines, each once, in the lines' order: a course
 *  with a waiting lesson and its review on two lines is one course. Then
 *  every other course of `all` with nothing today, most urgent first, so
 *  Home's tabs still reach every map. Pure. */
export function todayCourses(rows: readonly TodayRow[], all: readonly StudyCourse[] = []): StudyCourse[] {
	const listed = [...new Set(rows.flatMap((r) => (r.course ? [r.course] : [])))];
	const workspaces = new Set(listed.map((c) => c.map.workspace));
	return [...listed, ...byUrgency(all).filter((c) => !workspaces.has(c.map.workspace))];
}

/** The exam in words while the course is in its run-up, else null. Pure. */
export function runupExam(course: StudyCourse): string | null {
	return course.unready === null ? null : examWords(course);
}

/** An engine date (YYYY-MM-DD) plus some days. Pure. */
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** What a press on a course's line does: open a session, or start one
 *  with an opening on some topics, `from` a finished lesson it picks up. */
export type CourseMove = { kind: "open"; chat: ChatListItem } | { kind: "start"; opening: string; topics: readonly TopicHandle[]; from?: string };

/**
 * A course's line, pressed: take up its step (the course's next step when
 * none is given). A review opens a session
 * on those topics that is still to pick up, else starts a review of them,
 * named for them; never an older lesson. An open task or the current topic
 * continues the lesson that holds it, as the session model says
 * (`continueMove`), else starts one. With nothing to take up, a session
 * starts and the tutor proposes. Pure.
 */
export function courseMove(course: StudyCourse, chats: readonly ChatListItem[], step: NextStep = nextStepOf(course)): CourseMove {
	const { workspace } = course.map;
	const opening = stepWords(step);
	if (step.kind === "none") return { kind: "start", opening: CONTINUE_OPENING, topics: [] };
	const held = step.kind === "task" ? taskSessions(chats, workspace, step.key) : topicSessions(chats, workspace, step.topics[0] ?? "").filter((c) => covers(c, step));
	const move = step.kind === "review" ? (pickUp(held) ? continueMove(held) : null) : continueMove(held);
	if (move?.kind === "open") return { kind: "open", chat: move.chat };
	return { kind: "start", opening, topics: step.topics, ...(move ? { from: move.from.id } : {}) };
}

/** The states a session is picked up from: it waits on the learner, the
 *  tutor writes in it, the tutor stopped mid-reply, or he left it for next
 *  time. */
const PICK_UP: ReadonlySet<SessionState> = new Set(["your-turn", "working", "paused", "left"]);
const pickUp = (sessions: readonly ChatListItem[]) => sessions.some((c) => PICK_UP.has(sessionState(c)));

/** The states of a lesson he is in now: it waits on him, the tutor writes
 *  in it, or the tutor stopped mid-reply. */
const IN_PROGRESS: ReadonlySet<SessionState> = new Set(["your-turn", "working", "paused"]);

/**
 * Each course with "You are here" (`map.current`) on the lesson he is in:
 * when the course's newest session is a lesson still in progress and
 * belongs to a topic on the map, that topic; else the engine's current
 * topic, which moves only when a lesson's digest runs, so during a lesson
 * on NFAs the map said he was on a topic he had not started. Practice and
 * reviews leave it where it is. Pure.
 */
export function withLessonHere(courses: readonly StudyCourse[], chats: readonly ChatListItem[]): StudyCourse[] {
	return courses.map((course) => {
		const { workspace, topics } = course.map;
		const newest = chats.filter((c) => c.course?.workspace === workspace && c.messageCount > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
		if (!newest || newest.kind !== "teach" || !IN_PROGRESS.has(sessionState(newest))) return course;
		const here = topics.find((t) => (newest.ownTopics ?? []).includes(t.handle));
		return here && here.handle !== course.map.current ? { ...course, map: { ...course.map, current: here.handle } } : course;
	});
}

/** The session Continue on an open task opens, the one every surface
 *  opens for it: of the sessions that hold the task, the one the session
 *  model picks up (`continueMove`), so a newer session on the task moves
 *  past an older one left on it; null when none is opened. Pure. */
export function taskChat(chats: readonly ChatListItem[], workspace: string, key: string): ChatListItem | null {
	const move = continueMove(taskSessions(chats, workspace, key));
	return move?.kind === "open" ? move.chat : null;
}

/** Whether every task a session holds continues in another session
 *  (`taskChat`): a later session on the work moved past it. Pure. */
function movedPast(chat: ChatListItem, chats: readonly ChatListItem[]): boolean {
	const workspace = chat.course?.workspace;
	const tasks = chat.tasks ?? [];
	return workspace !== undefined && tasks.length > 0 && tasks.every((key) => {
		const current = taskChat(chats, workspace, key);
		return current !== null && current.id !== chat.id;
	});
}

/** The sessions to pick up, most recent first: never one whose course was
 *  deleted, which is history (round 4: a deleted course's lesson stayed at
 *  the top of Today), nor one a later session on its task moved past
 *  (`movedPast`), so Home opens the chat the topic page opens (round 11,
 *  1 N5: Home reopened the lesson's first chat at a question he had
 *  answered in its second). Pure. */
export function openSessions(chats: readonly ChatListItem[]): ChatListItem[] {
	return chats
		.filter((c) => !c.courseDeleted && PICK_UP.has(sessionState(c)) && !movedPast(c, chats))
		.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
