import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { CURRENT_TAG, needOf, standingOf, type Need, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { courseProgress, lastStudied, whyOf, type Why } from "@/components/study-home/agenda-rows/row-facts";
import { examWords, todayRows, type TodayRow } from "@/components/study-home/study-facts";
import { lessonOf, type Lesson } from "@/components/study-home/lesson-facts";
import type { StudyHomeState } from "@/components/study-home/use-study-home";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { buildInbox, daysBetween, taskWords as leftOff, type Unit, type UnitNow } from "@/components/unit-inbox/units";
import { courseShareWords, returnWords } from "@/components/study-words";

/**
 * The course page's model (spec: course-page.md): one course's topics, each
 * sorted once into the group he would act on it from, with the one fact its
 * row ends with, and the header's facts and next lesson. Built on the
 * sidebar's classifier (`buildInbox`, `shelfOf`) and the topic map's words
 * (`standingOf`, `needOf`), in the app's one wording (study-words.ts), so
 * the sidebar, the map and the page agree.
 * Engine fields only. Pure.
 */

/** The page's groups, in the order he would act on them. */
export const GROUP_IDS = ["needs-you", "learning", "not-started", "on-your-own"] as const;
export type GroupId = (typeof GROUP_IDS)[number];

/** Each group's name on the page. */
export const GROUP_WORDS: Record<GroupId, string> = {
	"needs-you": "Needs you",
	learning: "Learning",
	"not-started": "Not started",
	"on-your-own": "On your own",
};

/** The one fact a topic's row ends with, in the words the sidebar, the map
 *  and the topic page already use. `kind` picks its icon. */
export type TopicFact =
	/** A session on the topic waits on him: "Your turn". */
	| { kind: "your-turn"; words: string }
	/** The tutor is writing in a session on it: "Working". */
	| { kind: "working"; words: string }
	/** The engine calls it weak, and why: "Missed last time", "Sure, but wrong". */
	| { kind: "slip"; words: string }
	/** He can do it on his own and its review is due, in Home's words: "3d overdue". */
	| { kind: "review"; words: string }
	/** The course's current topic: "You are here". */
	| { kind: "here"; words: string }
	/** An open task holds it, and where he left it: "At part (c)". */
	| { kind: "task"; words: string }
	/** He can do it on his own, and when it comes back: "Back in 5d". */
	| { kind: "back"; words: string };

/** One topic as the page lists it. */
export interface CourseTopic {
	topic: CourseMapTopic;
	group: GroupId;
	/** The map's pie and its words. */
	standing: Standing;
	/** The map's reason it needs him, or null. */
	need: Need | null;
	current: boolean;
	/** What a session on it is doing now. */
	now: UnitNow;
	fact: TopicFact | null;
	/** The topic's page. */
	href: string;
}

/** One group: its name and its topics in the order he would take them. */
export interface CourseGroup {
	id: GroupId;
	title: string;
	topics: readonly CourseTopic[];
}

const overdue = (t: CourseMapTopic) => (t.review?.kind === "due" ? t.review.overdue : -1);

/** When an open task holding the topic was left, the course's focused
 *  task first: "Left off 3d ago". Pure. */
function taskWords(course: StudyCourse, topic: CourseMapTopic): string | null {
	const held = course.map.tasks.filter((task) => topic.tasks.includes(task.key));
	const task = held.find((t) => t.key === course.map.focus) ?? held[0];
	return task ? leftOff(task, course.map.today) : null;
}

/** The row's one fact, by priority: a session that waits or runs, then
 *  what the group is about (why it needs him, where he is or left off,
 *  when it comes back). Pure. */
function factOf(course: StudyCourse, topic: CourseMapTopic, group: GroupId, now: UnitNow, need: Need | null, current: boolean): TopicFact | null {
	if (now === "your-turn") return { kind: "your-turn", words: "Your turn" };
	if (now === "working") return { kind: "working", words: "Working" };
	switch (group) {
		case "needs-you":
			return need ? { kind: need.kind, words: need.words } : null;
		case "learning": {
			if (current) return { kind: "here", words: CURRENT_TAG };
			const task = taskWords(course, topic);
			return task ? { kind: "task", words: task } : null;
		}
		case "not-started":
			return current ? { kind: "here", words: CURRENT_TAG } : null;
		case "on-your-own":
			return topic.review?.kind === "scheduled" ? { kind: "back", words: returnWords(Math.max(1, daysBetween(course.map.today, topic.review.date))) } : null;
	}
}

/**
 * Every topic of the course once, in four groups, in the order he would
 * act (the course page's research, 13 Nov 2026):
 *   - Needs you: every topic the map gives a reason (`needOf`): the slips
 *     first, a wrong answer he was sure of on top (the most corrected,
 *     Butterfield and Metcalfe 2001), then the reviews of topics he can do
 *     on his own; the longest overdue first in each.
 *   - Learning: the sidebar's Learning shelf (`shelfOf`) less those, in
 *     its order: a turn that waits first, then the latest studied.
 *   - Not started: the rest of the path, in the engine's order.
 *   - On your own: the sidebar's Known shelf, the soonest back first.
 * `chats` are every session (the sidebar's list, with those started on a
 * topic's page linked to it); without them no row says a session waits.
 * Always the four groups, an empty one included. Pure.
 */
export function courseGroups(course: StudyCourse, chats: readonly ChatListItem[] = []): CourseGroup[] {
	const { map } = course;
	const titleOf = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
	const inbox = buildInbox([course], chats, map.workspace);
	// The sidebar's own order: Learning by turn and recency, Review, the tutor's Working, then Known by return.
	const listed: Unit[] = [...inbox.active, ...inbox.working, ...inbox.known];
	const unitOf = new Map(listed.map((u) => [u.topic.handle, u]));
	const path = new Map(map.topics.map((t, i) => [t.handle, i]));

	const toRow = (topic: CourseMapTopic): CourseTopic => {
		const unit = unitOf.get(topic.handle);
		const need = needOf(topic, titleOf);
		const group: GroupId = need ? "needs-you" : !unit ? "not-started" : unit.shelf === "known" ? "on-your-own" : "learning";
		const now = unit?.now ?? null;
		const current = map.current === topic.handle;
		return {
			topic,
			group,
			standing: standingOf(topic),
			need,
			current,
			now,
			fact: factOf(course, topic, group, now, need, current),
			href: unitHref(map.workspace, topic.handle),
		};
	};

	const rows = map.topics.map(toRow);
	const byGroup = (id: GroupId) => rows.filter((r) => r.group === id);
	const inListed = (a: CourseTopic, b: CourseTopic) => listed.indexOf(unitOf.get(a.topic.handle)!) - listed.indexOf(unitOf.get(b.topic.handle)!);
	const needsFirst = (a: CourseTopic, b: CourseTopic) =>
		Number(b.need?.kind === "slip") - Number(a.need?.kind === "slip") ||
		Number(b.topic.signals.confidentErrors > 0) - Number(a.topic.signals.confidentErrors > 0) ||
		overdue(b.topic) - overdue(a.topic) ||
		path.get(a.topic.handle)! - path.get(b.topic.handle)!;

	const sorted: Record<GroupId, CourseTopic[]> = {
		"needs-you": byGroup("needs-you").sort(needsFirst),
		learning: byGroup("learning").sort(inListed),
		"not-started": byGroup("not-started"),
		"on-your-own": byGroup("on-your-own").sort(inListed),
	};
	return GROUP_IDS.map((id) => ({ id, title: GROUP_WORDS[id], topics: sorted[id] }));
}

/** The words on the course's one button: the same as Home's lesson, with
 *  the topic page's Resume for a session that waits on him. */
export type CourseAction = "Resume" | "Review" | "Continue" | "Start";

/** The header's lesson: Home's line for this course (`todayRows`), as a
 *  lesson in Today's words, why it is next, and the button's word. */
export interface CourseNext {
	row: TodayRow;
	lesson: Lesson;
	why: Why | null;
	action: CourseAction;
}

/** What the course's button takes up, exactly as Home's line for it would:
 *  a session in this course to pick up since yesterday, else the course's
 *  next step. `open` are the sessions to pick up (`openSessions`). Pure. */
export function courseNext(course: StudyCourse, open: readonly ChatListItem[]): CourseNext {
	const mine = open.filter((c) => c.course?.workspace === course.map.workspace);
	const row = todayRows([course], mine, course.map.today)[0]!;
	const lesson = lessonOf(row);
	return { row, lesson, why: whyOf(row), action: lesson.action === "Open" ? "Resume" : lesson.action };
}

/** The header's facts, each a few words; null where the course has none. */
export interface CourseFacts {
	/** "3 of 16 topics on your own": the topics Home's progress ring counts. */
	progress: string | null;
	/** "Exam in 21 days", "Exam tomorrow", "Exam today". */
	exam: string | null;
	/** "Studied 2 days ago", "Studied today", "Not studied yet". */
	studied: string | null;
}

/** The facts line, in Home's words. Pure. */
export function courseFacts(course: StudyCourse): CourseFacts {
	const progress = courseProgress(course);
	return {
		progress: progress ? courseShareWords(progress.solid, progress.of) : null,
		exam: examWords(course),
		studied: lastStudied({ kind: "course", course, step: { kind: "none" } }),
	};
}

/** Everything a course page candidate draws: the engine's course, its
 *  topics in their groups, the header's facts and its next lesson. */
export interface CourseView {
	course: StudyCourse;
	groups: readonly CourseGroup[];
	facts: CourseFacts;
	next: CourseNext;
}

/** The course page's read: still reading; the engine not answering; the
 *  read failing; the engine unable to read this course; a course that is
 *  not among his courses; or the course. */
export type CourseRead =
	| { status: "loading" }
	| { status: "unavailable" }
	| { status: "failed" }
	| { status: "unreadable" }
	| { status: "missing" }
	| { status: "ready"; view: CourseView };

/** One course's page from the study home's read (`useStudyHome`). Pure. */
export function courseRead(state: StudyHomeState, workspace: string): CourseRead {
	switch (state.status) {
		case "loading":
			return { status: "loading" };
		case "unavailable":
			return { status: "unavailable" };
		case "failed":
			return { status: "failed" };
		case "ready": {
			const course = state.courses.find((c) => c.map.workspace === workspace);
			if (!course) return { status: state.failed.includes(workspace) ? "unreadable" : "missing" };
			return {
				status: "ready",
				view: { course, groups: courseGroups(course, state.chats), facts: courseFacts(course), next: courseNext(course, state.open) },
			};
		}
	}
}
