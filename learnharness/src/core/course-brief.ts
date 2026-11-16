/**
 * The course brief: what a lesson's agent sees of the learner's course
 * record without asking. A field projection of the engine's `resume`, and
 * of every course's `map` and `plan` days, never a rule: levels, due dates,
 * planned days and gaps are the engine's verdicts, copied; the one sum it
 * makes is each course's overdue reviews, so the tutor never counts them. Everything else (evidence, whole
 * topics, knowledge) is fetched on demand with the course tools.
 *
 * The daily plan is every course's together, and the course tools read only
 * the open course, so the brief carries every course's planned days, every
 * review of every topic as the calendar shows them: a plan question about
 * any course has its answer here.
 *
 * The brief's key is the part that changes the lesson's opening move: the
 * course's description in his words (the record's `goal`, written in the
 * course page's Context), the study day, the due topics and backlog, every
 * course's daily plan, the open tasks (with their steps when none is in
 * focus) and the current path topic. A new brief enters the transcript only
 * when the key changes, so the cached prompt prefix holds between saves;
 * level changes in between reach the agent through the save receipts.
 */

import type { PlannedDay } from "./contracts/calendar.ts";
import type { CourseMap, CourseMapTopic, StartsWhy, TopicHandle, TopicMoved } from "./contracts/course-map.ts";
import { longDay, shortDay } from "./day-words.ts";
import { movedWhy } from "./moved-words.ts";

export type BriefRole = "teach" | "practice";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayWithWeekday(day: string | undefined): string {
	if (!day) return "?";
	const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
	return weekday ? `${day} (${weekday})` : day;
}

const daysOverdue = (n: number): string => `${n} ${n === 1 ? "day" : "days"} overdue`;

/**
 * A due or weak entry with its topic's detail. The engine writes a topic's
 * `prompt`, `points`, `gap` and error counts once, under `resume.topics`, and
 * leaves them off the due and weak entries of those topics.
 */
function withDetail(item: unknown, topics: Json): Json {
	const entry = obj(item);
	const topic = obj(topics[str(entry.topic) ?? ""]);
	const review = obj(topic.review);
	const standing = obj(topic.standing);
	const detail: Json = {
		prompt: review.prompt,
		points: review.points,
		gap: topic.gap,
		choice_errors: standing.choice_errors,
		confident_errors: standing.confident_errors,
	};
	return { ...detail, ...entry };
}

function dueLine(d: Json, role: BriefRole): string {
	const facts = [str(d.level), typeof d.overdue === "number" && d.overdue > 0 ? daysOverdue(d.overdue) : undefined]
		.filter(Boolean)
		.join(", ");
	let line = `- ${str(d.topic) ?? "?"}${facts ? ` (${facts})` : ""}`;
	if (role === "practice") {
		if (str(d.prompt)) line += `\n  prompt: ${d.prompt}`;
		const points = list(d.points).filter((p): p is string => typeof p === "string");
		if (points.length > 0) line += `\n  points: ${points.join("; ")}`;
		if (str(d.gap)) line += `\n  gap: ${d.gap}`;
	}
	return line;
}

function weakLine(w: Json, role: BriefRole): string {
	const facts = [
		str(w.level),
		w.lapsed === true ? "lapsed" : undefined,
		w.stale === true ? "judgement older than the evidence" : undefined,
		w.repaired === true ? (w.repaired_with_help === true ? "answered right since, only with help" : "answered right since") : undefined,
	]
		.filter(Boolean)
		.join(", ");
	let line = `- ${str(w.topic) ?? "?"}${facts ? ` (${facts})` : ""}${str(w.gap) ? `: ${w.gap}` : ""}`;
	if (typeof w.confident_errors === "number" && w.confident_errors > 0) line += `; sure but wrong ×${w.confident_errors}`;
	const errors = obj(w.choice_errors);
	if (role === "practice" && Object.keys(errors).length > 0) {
		line += `; wrongly chose ${Object.entries(errors).map(([t, n]) => `${t} ×${String(n)}`).join(", ")}`;
	}
	return line;
}

function dueHeading(r: Json, shown: number): string {
	const more = typeof r.due_more === "number" && r.due_more > 0 ? r.due_more : 0;
	if (more === 0) return "Due today:";
	const oldest = obj(r.due_oldest);
	const tail =
		str(oldest.topic) && typeof oldest.overdue === "number" ? `, the most overdue among them ${oldest.topic} (${daysOverdue(oldest.overdue)})` : "";
	return `Due: ${shown + more} topics; today's review is the ${shown} below, ${more} more wait${tail}:`;
}

function taskLines(r: Json): string[] {
	const others = list(r.tasks).map(obj);
	if (r.task) {
		const task = obj(r.task);
		const lines = [`Open task ${str(task.key) ?? ""}: ${str(task.title) ?? ""}`.trimEnd()];
		if (str(task.goal)) lines.push(`  goal: ${task.goal}`);
		if (str(task.step)) lines.push(`  next step: ${task.step}`);
		if (others.length > 0) lines.push(`Other open tasks: ${others.map((t) => str(t.key) ?? "?").join(", ")}`);
		return lines;
	}
	if (others.length === 0) return [];
	return [
		"Open tasks, none in focus:",
		...others.map((t) => {
			const head = `- ${str(t.key) ?? "?"}${str(t.title) ? `: ${t.title}` : ""}`;
			return str(t.step) ? `${head}\n  next step: ${t.step}` : head;
		}),
	];
}

/** The exam run-up's figures, as the engine's `plan` reports them, named
 *  as the run-up doctrine names them. Null outside the run-up. */
function runupLine(plan: unknown, workspace: string): string | null {
	const course = list(obj(plan).courses).map(obj).find((c) => c.workspace === workspace);
	const runup = obj(course?.runup);
	if (typeof runup.days_left !== "number") return null;
	const parts = [`${runup.days_left} days left`];
	const named = (field: string) => list(runup[field]).filter((t): t is string => typeof t === "string");
	if (named("not_introduced").length > 0) parts.push(`not_introduced: ${named("not_introduced").join(", ")}`);
	if (named("unready").length > 0) parts.push(`unready: ${named("unready").join(", ")}`);
	if (typeof runup.study_days === "number") parts.push(`study_days: ${runup.study_days}`);
	if (typeof runup.pace === "number") parts.push(`pace: ${runup.pace} new topics a study day`);
	return `Exam run-up: ${parts.join("; ")}`;
}

const handles = (v: unknown): string[] => list(v).filter((h): h is string => typeof h === "string");

/** Every course's daily plan: each course's map (titles, exam, each
 *  topic's next review and why it starts when it does) beside the engine's
 *  `plan` days, which hold every review of every topic as the calendar
 *  shows them. `unread` names the courses whose record could not be read,
 *  so part of the plan never stands for all of it. */
export interface CoursePlans {
	workspace: string;
	courses: ReadonlyArray<{ map: CourseMap; days: readonly PlannedDay[] }>;
	unread: readonly string[];
}

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** How late a topic's next review is, from its map: memory's day passed
 *  and the plan puts it today (`due`) or later (`held` since a past day).
 *  Null when it is not overdue. */
function overdueDays(review: CourseMapTopic["review"], today: string): number | null {
	if (!review) return null;
	if (review.kind === "due") return review.overdue > 0 ? review.overdue : null;
	return review.held && review.held.since < today ? daysBetween(review.held.since, today) : null;
}

/** Beside a topic's next review: how overdue one due today is, or, for
 *  one the plan holds later (the engine's `held`), what held it: the exam
 *  whose final review came first, or full days, after "due since" memory's
 *  day once it has passed, the words every view shows. Memory's day still
 *  ahead was never told him, so it is not named: the tutor would say the
 *  review "moved from" a day he never heard (round 8). */
function reviewNote(review: NonNullable<CourseMapTopic["review"]>, today: string): string | null {
	if (review.kind === "due") return review.overdue > 0 ? daysOverdue(review.overdue) : null;
	if (!review.held) return null;
	const why = review.held.exam ? `waits for your ${review.held.exam} exam` : "earlier days are full";
	return review.held.since < today ? `due since ${shortDay(review.held.since)}, ${why}` : why;
}

/** A day he was told that moved (`TopicMoved`), from which day and what
 *  of his study moved it: the words the topic page and the calendar show,
 *  for the tutor to say when it names the day. */
function movedNote(moved: TopicMoved, today: string): string {
	return `moved from ${shortDay(moved.from)}${movedWhy(moved, today, shortDay)}`;
}

/** Why the plan starts a new topic then, in the material's terms (`StartsWhy`). */
function startNote(why: StartsWhy | undefined, title: (handle: TopicHandle) => string): string | null {
	if (!why) return null;
	switch (why.kind) {
		case "begun":
			return "the lesson he began";
		case "next":
			return why.arc ? "next in its arc" : "next in the course";
		case "after": {
			const waited = [...why.needs, ...why.partners];
			return waited.length > 0 ? `after ${waited.map(title).join(", ")}` : null;
		}
		case "early":
			return [
				"ahead of its place",
				why.exam ? "for the exam's pace" : null,
				why.waitingOn.length > 0 ? `while the topics before it wait on ${why.waitingOn.map(title).join(", ")}` : null,
			]
				.filter(Boolean)
				.join(", ");
	}
}

const noted = (title: string, note: string | null) => (note ? `${title} (${note})` : title);

/** A lesson he began on a topic not yet taught (the engine's `begun`
 *  start): the plan carries it on, so it is never a start or "not started"
 *  (the app's "Lesson continues"). */
const lessonBegun = (topic: Pick<CourseMapTopic, "startsWhy">): boolean => topic.startsWhy?.kind === "begun";

/** The course's overdue reviews, counted and named, most overdue first,
 *  each with the day the plan now puts it. */
function overdueLine(map: CourseMap): string {
	const late = map.topics
		.flatMap((t) => {
			const days = t.excluded ? null : overdueDays(t.review, map.today);
			return days === null || !t.review ? [] : [{ t, days, date: t.review.date }];
		})
		.sort((a, b) => b.days - a.days || a.t.title.localeCompare(b.t.title));
	if (late.length === 0) return "Overdue: none";
	const each = late.map(({ t, days, date }) => `${t.title} (${days} ${days === 1 ? "day" : "days"}, planned ${date === map.today ? "today" : shortDay(date)})`);
	return `Overdue: ${late.length} ${late.length === 1 ? "review" : "reviews"}: ${each.join(", ")}`;
}

/** One course's plan: its exam and final review, its overdue reviews,
 *  then each planned day's reviews and new topics by title, every review
 *  of every topic. Empty when it plans nothing. */
function coursePlanLines(map: CourseMap, days: readonly PlannedDay[], own: boolean, live: ReadonlySet<string>): string[] {
	const byHandle = new Map(map.topics.map((t) => [t.handle, t]));
	const title = (handle: TopicHandle) => byHandle.get(handle)?.title ?? handle;
	const shown = (handle: TopicHandle) => byHandle.has(handle) && !byHandle.get(handle)!.excluded;
	// The lesson's own topics carry no plan note: their day moves with his
	// answers in it, and the close names it (round 14, m2: "Your plan now
	// starts Poisson distribution on Wednesday 11 November…" mid-lesson,
	// while the close and the calendar said Tue 10).
	const dayLines = days.flatMap((d) => {
		const reviews = d.reviews.filter(shown).map((h) => {
			const { review, moved } = byHandle.get(h)!;
			if (live.has(h)) return noted(title(h), LIVE_NOTE);
			if (!review || review.date !== d.date) return title(h);
			return noted(title(h), moved ? movedNote(moved, map.today) : reviewNote(review, map.today));
		});
		const newTopic = (h: TopicHandle) => {
			const { moved, startsWhy, starts: day } = byHandle.get(h)!;
			if (live.has(h)) return noted(title(h), LIVE_NOTE);
			return noted(title(h), moved && day === d.date ? movedNote(moved, map.today) : startNote(startsWhy, title));
		};
		// A lesson he began goes on that day, as the app says it, never a start.
		const shownNew = d.new.filter(shown);
		const goesOn = shownNew.filter((h) => lessonBegun(byHandle.get(h)!)).map(newTopic);
		const starts = shownNew.filter((h) => !lessonBegun(byHandle.get(h)!)).map(newTopic);
		if (reviews.length + goesOn.length + starts.length === 0) return [];
		const parts = [reviews.length > 0 ? `review ${reviews.join(", ")}` : null, goesOn.length > 0 ? `continue ${goesOn.join(", ")}` : null, starts.length > 0 ? `start ${starts.join(", ")}` : null];
		return [`- ${shortDay(d.date)}: ${parts.filter(Boolean).join("; ")}`];
	});
	const exam = map.exam;
	if (dayLines.length === 0 && !exam) return [];
	const head = [`${map.title}${own ? " (this course)" : ""}`];
	if (exam) {
		head.push(`exam ${shortDay(exam.date)}`);
		if (exam.finalReview) {
			const missed = exam.unreviewed ?? [];
			head.push(
				`final review from ${shortDay(exam.finalReview)} to the exam, ${missed.length > 0 ? `no room for ${missed.map(title).join(", ")}` : "with room for every taught topic"}`,
			);
		}
		if (exam.doesNotFit?.length) head.push(`no room before the exam to start ${exam.doesNotFit.map(title).join(", ")}`);
	}
	return [head.join(" · "), overdueLine(map), ...dayLines];
}

/** A topic of this session's own lesson in the plan: no note, since its
 *  day is the close's to name. */
const LIVE_NOTE = "this session's topic: its day is the close's to say, not yours now";

/** The daily plan of every course, the lesson's own first. Empty when no
 *  course plans anything. */
function planLines(plans: CoursePlans | undefined, live: readonly string[]): string[] {
	if (!plans) return [];
	const own = (workspace: string) => workspace === plans.workspace;
	const ordered = [...plans.courses].sort((a, b) => Number(own(b.map.workspace)) - Number(own(a.map.workspace)));
	const courses = ordered.flatMap(({ map, days }) => coursePlanLines(map, days, own(map.workspace), own(map.workspace) ? new Set(live) : new Set()));
	if (courses.length === 0) return [];
	return [
		"Daily plan of every course, as the calendar shows it: each day's reviews and new topics, every review of every topic. A day you tell him is one of these, unless a save this turn gave the topic a newer one. Say a day moved only where its note says “moved from”, with that note's cause; otherwise name the day alone:",
		...courses,
		...(plans.unread.length > 0 ? [`Not in this plan, its record could not be read: ${plans.unread.join(", ")}`] : []),
	];
}

/** What the engine's `path_health` lists, in the brief's words: the gaps a
 *  half-built path still has. Null when the path has none. */
const HEALTH_WORDS: ReadonlyArray<[string, string]> = [
	["untitled", "no title"],
	["unplaced", "not in the order"],
	["unlinked", "linked to no other topic"],
	["unreferenced", "no reference to its material"],
];

function pathHealthLine(health: unknown): string | null {
	const h = obj(health);
	const parts = HEALTH_WORDS.flatMap(([field, words]) => {
		const keys = handles(h[field]);
		return keys.length > 0 ? [`${words}: ${keys.join(", ")}`] : [];
	});
	return parts.length > 0 ? `Path gaps (fix them in a save when you next touch these topics): ${parts.join("; ")}` : null;
}

/** The check of the arc a session was started on from Check it (the
 *  session's `arcCheck`), from the engine's `arcs_ready`: the arc's
 *  question, its live topics and the method pairs to tell apart, in the
 *  arcs doctrine's words. Null when that arc is not ready (any more). */
function arcCheckLines(arcsReady: unknown, arc: string | undefined): string[] | null {
	if (!arc) return null;
	const check = list(arcsReady).map(obj).find((a) => a.arc === arc);
	if (!check) return null;
	const pairs = list(check.pairs).flatMap((p) => (Array.isArray(p) && p.length === 2 ? [`${String(p[0])} or ${String(p[1])}`] : []));
	return [
		`Arc check: he pressed Check it on ${str(check.title) ?? arc} (${arc}), so this session is its check, offered and never required, and it locks nothing.`,
		...(str(check.question) ? [`  question: ${check.question}`] : []),
		`  one unaided item per topic, in mixed order: ${handles(check.topics).join(", ")}`,
		...(pairs.length > 0 ? [`  one choose-the-method item per pair: ${pairs.join("; ")}`] : []),
		`  tag each item's attempt with checkpoint "${arc}"; a miss follows the relearn rules, with a fresh parallel item in this session or the next.`,
	];
}

/** The brief for one role, and the key that decides when it is re-sent.
 *  Practice also reads the run-up from the engine's `plan` for the course
 *  at `workspace`; its figures move with the day (in the key) and with
 *  saves (in the receipts), as levels do. `arcCheck` is the arc a session
 *  started from Check it checks: the brief then carries that arc's check.
 *  `plan` is every course's daily plan; without it the brief has none.
 *  `opened` are the topics the session was opened on from their page, whose
 *  title the app posted as his first message; `review` says he opened them
 *  as their review, which the session stays whatever it re-teaches. */
/** The day he last studied the course, the engine's `last_studied`. */
export interface LastStudied {
	date: string;
	daysAgo: number;
}

/** `last_studied` from the course's `plan` output (`{courses: [entry]}`);
 *  null when the record shows no study. Pure. */
export function lastStudiedOf(plan: unknown): LastStudied | null {
	const entries = obj(plan).courses;
	const studied = obj(Array.isArray(entries) ? entries[0] : null).last_studied;
	const { date, days_ago: daysAgo } = obj(studied);
	return typeof date === "string" && typeof daysAgo === "number" ? { date, daysAgo } : null;
}

/** When he last studied, as the one day to tell him: a moved day's note
 *  says why that day moved, never his history (round 12, 1 m7: "you
 *  haven't studied since Monday 9 November", read off a note, after study
 *  on 10 and 17 Nov). */
function studiedLine({ date, daysAgo }: LastStudied): string {
	const when = daysAgo === 0 ? "today" : daysAgo === 1 ? `yesterday, ${dayWithWeekday(date)}` : `on ${dayWithWeekday(date)}, ${daysAgo} days ago`;
	return `He last studied this course ${when}: the only day to tell him he last studied, never a moved day's note.`;
}

/** "A", "A and B", "A, B and C". */
const listedWords = (names: readonly string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** What starting `topic` today costs him, in the plan's own facts: what it
 *  builds on is not solid yet (its start waits on it), or today's plan
 *  still holds other work, in any course. Null when it costs nothing. */
function earlyCost(plans: CoursePlans, map: CourseMap, topic: CourseMapTopic): string | null {
	const titleIn = (m: CourseMap, h: TopicHandle) => m.topics.find((t) => t.handle === h)?.title ?? h;
	const waits = topic.startsWhy?.kind === "after" ? [...topic.startsWhy.needs, ...topic.startsWhy.partners] : [];
	const shaky = waits.length > 0 ? `${listedWords(waits.map((h) => titleIn(map, h)))}, which it builds on, ${waits.length > 1 ? "are" : "is"} not solid yet` : null;
	const held = plans.courses.flatMap(({ map: m, days }) => {
		const today = days.find((d) => d.date === m.today);
		if (!today) return [];
		return [...today.reviews.map((h) => `your ${titleIn(m, h)} review`), ...today.new.filter((h) => h !== topic.handle).map((h) => titleIn(m, h))];
	});
	const planned = held.length > 0 ? `today's plan still holds ${listedWords(held)}` : null;
	const costs = [shaky, planned].filter((c): c is string => c !== null);
	return costs.length > 0 ? costs.join(", and ") : null;
}

/** A topic he started today, from its page or a row, that his plan starts
 *  on a later day: the lesson's first words say so, with what starting it
 *  early costs him, and only then (round 13, 1 n7: a start 11 days early
 *  opened on a bare probe; round 14, m1: the line opened every lesson, a
 *  lesson he had begun, and the Ask-the-tutor reply). `opening` is the
 *  session's first words: a start opens with the topic's title ("Start" and
 *  it, or it alone); a continue, a question and a free message never do.
 *  Never a reason the plan does not give. */
function aheadOfPlanLines(plans: CoursePlans | undefined, opened: readonly string[], opening: string | null): string[] {
	const map = plans?.courses.find((c) => c.map.workspace === plans.workspace)?.map;
	if (!plans || !map || !opening) return [];
	const words = opening.trim().replace(/^Start\s+/, "").toLowerCase();
	return opened.flatMap((handle) => {
		const topic = map.topics.find((t) => t.handle === handle);
		if (!topic || topic.level !== "new" || !topic.starts || topic.starts <= map.today || lessonBegun(topic)) return [];
		if (words !== topic.title.toLowerCase()) return [];
		const cost = earlyCost(plans, map, topic);
		if (!cost) return [];
		const day = longDay(topic.starts);
		return [`Ahead of plan: his plan starts ${topic.title} on ${day}, and he starts it today. Your first message to him says so in one plain sentence ("${topic.title} is ahead of your plan, which starts it on ${day}: ${cost}."), with no reason of your own, then the lesson goes on.`];
	});
}

export function projectCourseBrief(
	resume: unknown,
	role: BriefRole,
	{ runup, arcCheck, plan, opened = [], opening = null, live = [], review = false, studied = null }: { runup?: { plan: unknown; workspace: string }; arcCheck?: string; plan?: CoursePlans; opened?: readonly string[]; opening?: string | null; live?: readonly string[]; review?: boolean; studied?: LastStudied | null } = {},
): { key: string; text: string } {
	const r = obj(resume);
	const course = obj(r.course);
	const exam = obj(course.exam);
	const path = obj(r.path);
	const task = r.task ? obj(r.task) : null;
	const due = list(r.due);

	const lines: string[] = [];
	const examLine = typeof exam.days_left === "number" ? ` · exam in ${exam.days_left} days` : "";
	lines.push(`[Course record] ${str(course.title) ?? "Untitled course"} · today ${dayWithWeekday(str(r.today))}${examLine}`);
	if (str(course.goal)) lines.push(`About the course, in his words: ${course.goal}`);
	if (studied) lines.push(studiedLine(studied));
	if (opened.length > 0 && review) lines.push(`Opened on: ${opened.join(", ")}, as its review. He pressed its button, and the app posted his first message. The session is his review, whatever it re-teaches.`);
	else if (opened.length > 0) lines.push(`Opened on: ${opened.join(", ")}. He pressed the action on its page, and the app posted his first message.`);
	if (!review) lines.push(...aheadOfPlanLines(plan, opened, opening));
	const topics = list(path.topics)
		.map((t) => (Array.isArray(t) ? `${String(t[0])} (${String(t[1])})` : undefined))
		.filter(Boolean);
	if (topics.length > 0) lines.push(`Path${str(path.current) ? `, current ${path.current}` : ""}: ${topics.join(", ")}`);
	// The level word "new" read as "not planned yet" (round 8: "they're the
	// only ones you haven't started" named two of four untaught topics), so
	// the untaught ones are named in plain words too.
	// A lesson he began is neither (round 12 follow-up: "You start the
	// Poisson distribution tomorrow" after he began it).
	const begun = new Set(plan?.courses.find((c) => c.map.workspace === plan.workspace)?.map.topics.filter(lessonBegun).map((t) => t.handle as string) ?? []);
	const untaught = list(path.topics).flatMap((t) => (Array.isArray(t) && t[1] === "new" ? [String(t[0])] : []));
	const notStarted = untaught.filter((h) => !begun.has(h));
	const goesOn = untaught.filter((h) => begun.has(h));
	if (notStarted.length > 0) lines.push(`Not started yet (never taught, whatever their planned day): ${notStarted.join(", ")}`);
	if (goesOn.length > 0) lines.push(`Begun, not finished (its lesson continues, never a start): ${goesOn.join(", ")}`);
	const excluded = handles(path.excluded);
	if (excluded.length > 0) lines.push(`Left out of the course: ${excluded.join(", ")}`);
	const health = pathHealthLine(r.path_health);
	if (health) lines.push(health);
	const runupText = role === "practice" && runup ? runupLine(runup.plan, runup.workspace) : null;
	if (runupText) lines.push(runupText);
	const check = arcCheckLines(r.arcs_ready, arcCheck);
	if (check) lines.push(...check);
	const detail = obj(r.topics);
	if (due.length > 0) {
		lines.push(dueHeading(r, due.length), ...due.map((d) => dueLine(withDetail(d, detail), role)));
	} else {
		lines.push("Due today: nothing.");
	}
	const planned = planLines(plan, live);
	lines.push(...planned);
	const weak = list(r.weak);
	if (weak.length > 0) lines.push("Weak:", ...weak.map((w) => weakLine(withDetail(w, detail), role)));
	lines.push(...taskLines(r));
	const prefs = Object.entries(obj(r.preferences)).filter(([, v]) => typeof v === "string");
	if (prefs.length > 0) lines.push("Preferences:", ...prefs.map(([k, v]) => `- ${k}: ${String(v)}`));
	const pinned = Object.entries(obj(r.knowledge)).filter(([, v]) => obj(v).pinned === true);
	if (pinned.length > 0) lines.push("Standing conventions:", ...pinned.map(([k, v]) => `- ${k}: ${String(obj(v).text ?? "")}`));
	lines.push("Read whole topics, evidence and knowledge with course_show or course_search.");

	const key = JSON.stringify([
		r.today ?? null,
		due.map((d) => obj(d).topic ?? null),
		task ? [task.key ?? null, task.step ?? null] : null,
		r.due_more ?? null,
		obj(r.due_oldest).topic ?? null,
		planned,
		list(r.tasks)
			.map((t) => [str(obj(t).key) ?? "", task ? null : (obj(t).step ?? null)])
			.sort(([a], [b]) => String(a).localeCompare(String(b))),
		path.current ?? null,
		handles(path.excluded),
		r.path_health ?? null,
		course.goal ?? null,
		check,
		opened,
		role,
	]);
	return { key, text: lines.join("\n") };
}
