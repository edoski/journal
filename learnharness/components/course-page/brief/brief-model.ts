import type { CourseMapTopic, StudyCourse, TopicHandle, TopicLevel } from "@/src/core";
import { dayText } from "@/components/course-map/topic-words";
import { CURRENT_TAG, type Fill } from "@/components/course-map/topic-map/topic-standing";
import { courseProgress, whyOf } from "@/components/study-home/agenda-rows/row-facts";
import type { CourseTopic, CourseView, TopicFact } from "@/components/course-page/course-model";

/**
 * The brief candidate's model (spec: brief-course.md): the course's
 * standing as three counts, the one mistake the engine can name, and the
 * three answers he opens the page with (Fix first, Review, Next), each a
 * list of topics with the one line its row says under the title. Built on
 * the course page's groups (`courseGroups`) and Home's words, so the
 * brief, the header, the sidebar and Home say a topic the same way.
 * Engine fields only. Pure.
 */

/** The three parts of the standing bar, in the order they fill. */
export const STANDING_IDS = ["on-your-own", "learning", "not-started"] as const;
export type StandingId = (typeof STANDING_IDS)[number];

/** One part of the standing bar: how many topics, in a few words, and the
 *  topic pie that stands for it on the map. */
export interface StandingPart {
	id: StandingId;
	count: number;
	/** "3 on your own", "7 learning", "6 not started". */
	words: string;
	/** The map's pie for a topic in this part. */
	fill: Fill;
}

const STANDING_WORDS: Record<StandingId, string> = { "on-your-own": "on your own", learning: "learning", "not-started": "not started" };
const STANDING_FILL: Record<StandingId, Fill> = { "on-your-own": 1, learning: 0.5, "not-started": 0 };

/**
 * The course's pie unrolled: the topics he can do on his own (exactly the
 * ones the header's pie counts, `courseProgress`), the ones he has started
 * but cannot do alone yet, and the ones not started. Parts with no topics
 * are left out; an empty course has none. Pure.
 */
export function standingParts(course: StudyCourse): StandingPart[] {
	const progress = courseProgress(course);
	if (!progress) return [];
	const notStarted = course.map.topics.filter((t) => t.level === "new").length;
	const counts: Record<StandingId, number> = { "on-your-own": progress.solid, learning: progress.of - progress.solid - notStarted, "not-started": notStarted };
	return STANDING_IDS.filter((id) => counts[id] > 0).map((id) => ({ id, count: counts[id], words: `${counts[id]} ${STANDING_WORDS[id]}`, fill: STANDING_FILL[id] }));
}

/** The standing in one sentence for a screen reader: "3 on your own, 7
 *  learning and 6 not started, of 16 topics". Pure. */
export function standingSentence(parts: readonly StandingPart[]): string {
	const of = parts.reduce((sum, p) => sum + p.count, 0);
	const words = parts.map((p) => p.words);
	const list = words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : (words[0] ?? "");
	return `${list}, of ${of} ${of === 1 ? "topic" : "topics"}`;
}

/** The page's three answers, in the order he reads them. */
export const ANSWER_IDS = ["fix", "review", "next"] as const;
export type AnswerId = (typeof ANSWER_IDS)[number];

/** Each answer's name on the page. */
export const ANSWER_WORDS: Record<AnswerId, string> = { fix: "Fix first", review: "Review", next: "Next" };

/** One topic of an answer: its row, and the one thing its row says. */
export interface AnswerTopic {
	row: CourseTopic;
	/** The line under the title, a few words: "Your turn", "1w overdue", "Needs Rank". */
	words: string;
	/** The same as a fact with its icon at the row's end, when the words have
	 *  one of the app's icons; null for a topic's readiness or standing. */
	fact: TopicFact | null;
}

/** One answer: its name, its topics in the order he would take them, and
 *  the line it shows when it has none. */
export interface Answer {
	id: AnswerId;
	title: string;
	topics: readonly AnswerTopic[];
	empty: string;
}

/** The engine's sentence for the mistake on the first topic to fix that
 *  has one, and that topic's row. */
export interface BriefMistake {
	row: CourseTopic;
	sentence: string;
}

/** The levels at which he can do a topic on his own (the course pie's). */
const ON_YOUR_OWN = new Set<TopicLevel>(["independent", "retained", "transferred"]);

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
/** The part of a title or step before its colon: "Problem sheet 4", "Part (c)". */
const head = (text: string) => text.split(":")[0]!.trim();
const overdue = (t: CourseMapTopic) => (t.review?.kind === "due" ? t.review.overdue : -1);

/** Where the open task was left, in a few words: "Problem sheet 4, part
 *  (c)", or "Problem sheet 4" with no step. Pure. */
export function taskLine(task: { title: string; step: string | null }): string {
	return task.step ? `${head(task.title)}, ${lowerFirst(head(task.step))}` : head(task.title);
}

/** How overdue a topic's review is, in the words Home and the header use
 *  for it ("Due today", "3d overdue", "1w overdue"): Today's own reason for
 *  a review of this one topic, so the page has one vocabulary. Pure. */
export function overdueWords(course: StudyCourse, topic: CourseMapTopic): string {
	const alone = { ...course, map: { ...course.map, topics: [topic] } };
	const why = whyOf({ kind: "course", course: alone, step: { kind: "review", titles: [topic.title], topics: [topic.handle], then: null } }, course.map.today);
	return why?.kind === "review" ? why.short : "Review due";
}

/** How many of the topics a topic needs (the map's prerequisite lines) he
 *  cannot do on his own yet: none means he can start it now. Pure. */
function unready(course: StudyCourse, topic: CourseMapTopic): number {
	const needs = new Set(course.map.edges.flatMap((e) => (e.kind === "needs" && e.topic === topic.handle ? [e.prerequisite] : [])));
	return course.map.topics.filter((t) => needs.has(t.handle) && !(ON_YOUR_OWN.has(t.level) && !t.weak)).length;
}

/** Whether a topic not started can be taken up now: "Ready to start", or
 *  "Needs 2 topics first", counted rather than named so the line stays one
 *  line in a narrow column (the map's lines and the topic's page name
 *  them). Pure. */
function readiness(course: StudyCourse, topic: CourseMapTopic): string {
	const n = unready(course, topic);
	return n === 0 ? "Ready to start" : `Needs ${n} ${n === 1 ? "topic" : "topics"} first`;
}

/** An empty Review says when the first topic comes back, and which, the
 *  day first so a long title truncates before it does: "Back Mon 9 Nov:
 *  Quotient rule" (the sidebar's "Back"); or "Nothing due" with none
 *  scheduled. Pure. */
function nextBack(course: StudyCourse): string {
	const back = course.map.topics
		.flatMap((t) => (t.review?.kind === "scheduled" ? [{ title: t.title, date: t.review.date }] : []))
		.sort((a, b) => a.date.localeCompare(b.date))[0];
	return back ? `Back ${dayText(back.date)}: ${back.title}` : "Nothing due";
}

/** The topics the header's lesson takes up (the waiting session's topics,
 *  or the course's next step's), in its order. Pure. */
function lessonTopics(view: CourseView): readonly string[] {
	const { row } = view.next;
	if (row.kind === "session") return row.chat.topics ?? [];
	return row.step.kind === "none" ? [] : row.step.topics;
}

/**
 * The three answers (the course page research's brief, 13 Nov 2026), each
 * topic in one of them:
 *   - Fix first: the topics the engine calls weak, in the Needs you
 *     group's order (a wrong answer he was sure of on top, then the
 *     longest overdue).
 *   - Review: every other topic whose review is due, whatever his level,
 *     the longest overdue first. With Fix first that is every topic the
 *     header's Review takes up, so the page and the button agree.
 *   - Next: the topics the header's lesson takes up, then the rest being
 *     learned in the sidebar's order, then the topics not started, the
 *     ones he can start now first, each in path order. So Next starts
 *     where the button does.
 * Each row says one thing, by priority: a session that waits on him or
 * the tutor writing (the sidebar's), the open task where he left it (on
 * the one topic it sits on), then why the answer holds it: the map's
 * reason for a slip, how overdue a review is, "You are here", whether a
 * topic not started can be started, else where he stands. Pure.
 */
export function briefAnswers(view: CourseView): Answer[] {
	const { course, groups } = view;
	const { map } = course;
	const all = groups.flatMap((g) => g.topics);
	const path = new Map(map.topics.map((t, i) => [t.handle, i]));
	const inGroup = (id: CourseTopic["group"]) => groups.find((g) => g.id === id)?.topics ?? [];

	const task = map.tasks.find((t) => t.key === map.focus) ?? map.tasks[0];
	const held = task ? all.filter((r) => r.topic.tasks.includes(task.key)) : [];
	const taskRow = held.find((r) => r.current) ?? [...held].sort((a, b) => path.get(a.topic.handle)! - path.get(b.topic.handle)!)[0];

	const first = (row: CourseTopic): TopicFact | null => {
		if (row.fact?.kind === "your-turn" || row.fact?.kind === "working") return row.fact;
		if (task && row === taskRow) return { kind: "task", words: taskLine(task) };
		return null;
	};
	const withFact = (row: CourseTopic, own: TopicFact): AnswerTopic => {
		const fact = first(row) ?? own;
		return { row, words: fact.words, fact };
	};

	const fixRows = inGroup("needs-you").filter((r) => r.need?.kind === "slip");
	const fix = fixRows.map((row) => withFact(row, { kind: "slip", words: row.need!.words }));

	const taken = new Set<CourseTopic>(fixRows);
	const reviewRows = all
		.filter((r) => !taken.has(r) && r.topic.review?.kind === "due")
		.sort((a, b) => overdue(b.topic) - overdue(a.topic) || path.get(a.topic.handle)! - path.get(b.topic.handle)!);
	const review = reviewRows.map((row) => withFact(row, { kind: "review", words: overdueWords(course, row.topic) }));
	for (const row of reviewRows) taken.add(row);

	const lesson = lessonTopics(view);
	const rank = (row: CourseTopic) => {
		const i = lesson.indexOf(row.topic.handle);
		return i < 0 ? lesson.length : i;
	};
	// Of the topics not started, the ones he can start now first.
	const notStarted = inGroup("not-started").filter((r) => !taken.has(r));
	const ready = notStarted.filter((r) => unready(course, r.topic) === 0);
	const pool = [...inGroup("learning").filter((r) => !taken.has(r)), ...ready, ...notStarted.filter((r) => !ready.includes(r))];
	// A stable sort keeps the sidebar's order among the learning and the path's among the rest.
	const next = [...pool]
		.sort((a, b) => rank(a) - rank(b))
		.map((row): AnswerTopic => {
			const fact = first(row) ?? (row.current ? { kind: "here" as const, words: CURRENT_TAG } : null);
			if (fact) return { row, words: fact.words, fact };
			return { row, words: row.topic.level === "new" ? readiness(course, row.topic) : row.standing.words, fact: null };
		});

	return [
		{ id: "fix", title: ANSWER_WORDS.fix, topics: fix, empty: "Nothing to fix" },
		{ id: "review", title: ANSWER_WORDS.review, topics: review, empty: nextBack(course) },
		{ id: "next", title: ANSWER_WORDS.next, topics: next, empty: "Nothing new to start" },
	];
}

/** The engine's sentence for the mistake on the first topic to fix that
 *  has one (`signals.gap`), or null: the one sentence the page shows.
 *  Pure. */
export function briefMistake(answers: readonly Answer[]): BriefMistake | null {
	const fix = answers.find((a) => a.id === "fix")?.topics ?? [];
	const row = fix.find((t) => t.row.topic.signals.gap)?.row;
	return row ? { row, sentence: row.topic.signals.gap! } : null;
}

/** Where the map opens: on "You are here", unless he can already do that
 *  topic on his own and nothing about it is due (the sidebar's Known
 *  shelf); then on the first topic the answers name (the first to fix,
 *  else to review, else next), so the map opens where the page points.
 *  Null leaves the map on its own opening. Pure. */
export function mapAim(view: CourseView, answers: readonly Answer[]): TopicHandle | null {
	const current = view.groups.flatMap((g) => g.topics).find((r) => r.current);
	const named = answers.flatMap((a) => a.topics)[0]?.row.topic.handle ?? null;
	if (!current) return named;
	return current.group === "on-your-own" && named ? named : current.topic.handle;
}
