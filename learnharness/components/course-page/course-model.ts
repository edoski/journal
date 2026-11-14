import type { ChatListItem, CourseMapTopic, StudyCourse, UnreadableCourse } from "@/src/core";
import { CURRENT_TAG, standingOf, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { courseProgress, lastStudied, whyOf, type Why } from "@/components/study-home/agenda-rows/row-facts";
import { examWords, todayRows, type TodayRow } from "@/components/study-home/study-facts";
import { lessonOf, type Lesson } from "@/components/study-home/lesson-facts";
import { slotWords } from "@/components/study-home/needs-you";
import type { StudyHomeState } from "@/components/study-home/use-study-home";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { nowFor, plannedKeys, restShelves, shelfStatus } from "@/components/unit-inbox/now-inbox";
import { claimedKeys, todayTop, type NowItem } from "@/components/unit-inbox/today/today-top";
import { buildInbox, unitKey, type Unit, type UnitStatus } from "@/components/unit-inbox/units";
import { courseShareWords } from "@/components/study-words";
import { lastSessionOf } from "@/components/course-page/course-head/head-facts";

/**
 * The course page's model (spec: course-page.md): one course's topics, each
 * in the group the sidebar puts it in, ending in the fact the sidebar's row
 * says, and the header's facts and next lesson. It reads the sidebar's own
 * model (Home's Today on top, `todayTop`; the shelves under it,
 * `restShelves`; a row's fact, `shelfStatus`), so a topic is in one group
 * with one fact wherever it shows. Engine fields only. Pure.
 */

/** The page's groups, in the order he would act on them. */
export const GROUP_IDS = ["needs-you", "learning", "not-started", "on-your-own"] as const;
export type GroupId = (typeof GROUP_IDS)[number];

/** Each group's name on the page: Needs you is Home's Today, the others
 *  the sidebar's shelves. */
export const GROUP_WORDS: Record<GroupId, string> = {
	"needs-you": "Needs you",
	learning: "Learning",
	"not-started": "Not started",
	"on-your-own": "On your own",
};

/** The one fact a topic's row ends with, in the words the sidebar's row or
 *  Today's card says for it. `kind` picks its icon. */
export type TopicFact =
	/** A session on the topic waits on him: "Your turn". */
	| { kind: "your-turn"; words: string }
	/** The tutor is writing in a session on it: "Working". */
	| { kind: "working"; words: string }
	/** The tutor stopped mid-reply in a session on it. */
	| { kind: "stopped"; words: string }
	/** The engine calls it weak, and why: "Not right last time", "Sure, but wrong". */
	| { kind: "slip"; words: string }
	/** Its review is due: "Due today", "3d overdue". */
	| { kind: "review"; words: string }
	/** An open task holds it, and when he left it: "Left off 3d ago". */
	| { kind: "task"; words: string }
	/** Today's plan starts it: "Planned today", "Next up". */
	| { kind: "next"; words: string }
	/** When its next review comes: "Back in 5d", "Due since 21 Oct". */
	| { kind: "back"; words: string }
	/** When he last studied it: "3d ago". */
	| { kind: "studied"; words: string }
	/** The course's current topic: "You are here". */
	| { kind: "here"; words: string };

/** One topic as the page lists it. */
export interface CourseTopic {
	topic: CourseMapTopic;
	group: GroupId;
	/** The map's pie and its words. */
	standing: Standing;
	current: boolean;
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

const WHY_FACT: Record<Why["kind"], TopicFact["kind"]> = { reply: "your-turn", working: "working", stopped: "stopped", missed: "slip", review: "review", task: "task", next: "next" };

/** A topic Today takes up says Today's reason, as the sidebar's card for
 *  its line does (`slotWords`). Pure. */
function todayFact(item: NowItem, topic: CourseMapTopic): TopicFact | null {
	const { why } = item.line;
	const words = slotWords(why, topic);
	return why && words ? { kind: WHY_FACT[why.kind], words } : null;
}

/** A shelf row's fact (`shelfStatus`), the current topic saying "You are
 *  here" in place of when it comes back or was studied. Pure. */
function shelfFact(status: UnitStatus, current: boolean): TopicFact | null {
	if (current && (status.kind === "returns" || status.kind === "studied" || status.kind === "none")) return { kind: "here", words: CURRENT_TAG };
	switch (status.kind) {
		case "none":
			return null;
		case "your-turn":
			return { kind: "your-turn", words: "Your turn" };
		case "working":
			return { kind: "working", words: "Working" };
		case "returns":
			return { kind: "back", words: status.words };
		default:
			return { kind: status.kind, words: status.words };
	}
}

/**
 * Every topic of the course once, in four groups, each the sidebar's own
 * (spec: course-page.md, "The groups"):
 *   - Needs you: the topics Home's Today takes up (the sidebar's top,
 *     `todayTop` over every course), in Today's order, with Today's reason;
 *   - Learning: the sidebar's Working and Learning shelves, in their order;
 *   - Not started: the rest of the path, in the order the plan starts
 *     them (`starts`), those it has no day for last, in the engine's path
 *     order;
 *   - On your own: the sidebar's On your own shelf, in its order.
 * Each shelf row ends in the sidebar row's fact (`shelfStatus`). `chats`
 * are every session (with those started on a topic's page linked to it);
 * `courses` every course, since Today weighs them together. Always the
 * four groups, an empty one included. Pure.
 */
export function courseGroups(course: StudyCourse, chats: readonly ChatListItem[] = [], courses: readonly StudyCourse[] = [course]): CourseGroup[] {
	const { map } = course;
	const inbox = buildInbox(courses, chats, null);
	const top = todayTop(nowFor(courses, chats, null, map.today), inbox, chats);
	const today = new Map<string, NowItem>();
	for (const item of top) for (const key of claimedKeys(item)) if (!today.has(key)) today.set(key, item);
	const shelves = restShelves(inbox, new Set(today.keys()));
	const planned = plannedKeys(courses);
	const shelved = new Map<string, { group: GroupId; unit: Unit }>([
		...[...shelves.working, ...shelves.learning].map((unit) => [unit.key, { group: "learning" as const, unit }] as const),
		...shelves.known.map((unit) => [unit.key, { group: "on-your-own" as const, unit }] as const),
	]);
	const order = [...today.keys(), ...shelved.keys()];

	const rows = map.topics.map((topic): CourseTopic & { key: string } => {
		const key = unitKey(map.workspace, topic.handle);
		const current = map.current === topic.handle;
		const item = today.get(key);
		const shelf = shelved.get(key);
		const base = { key, topic, standing: standingOf(topic), current, href: unitHref(map.workspace, topic.handle) };
		if (item) return { ...base, group: "needs-you", fact: todayFact(item, topic) };
		if (shelf) return { ...base, group: shelf.group, fact: shelfFact(shelfStatus(shelf.unit, map.today, planned), current) };
		return { ...base, group: "not-started", fact: current ? { kind: "here", words: CURRENT_TAG } : null };
	});
	const at = (key: string) => order.indexOf(key);
	const NEVER = "9999-12-31";
	const byStart = (a: CourseTopic, b: CourseTopic) => (a.topic.starts ?? NEVER).localeCompare(b.topic.starts ?? NEVER);
	return GROUP_IDS.map((id) => {
		const mine = rows.filter((row) => row.group === id);
		const sorted = id === "not-started" ? mine.sort(byStart) : mine.sort((a, b) => at(a.key) - at(b.key));
		return { id, title: GROUP_WORDS[id], topics: sorted.map(({ key: _, ...row }) => row) };
	});
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
	/** "Some topics on your own": in words, the share Home's progress ring draws. */
	progress: string | null;
	/** "Exam in 21 days", "Exam tomorrow", "Exam today". */
	exam: string | null;
	/** "Studied 2 days ago", "Studied today", "Not studied yet". */
	studied: string | null;
	/** His latest session in the course, which "Studied" opens. */
	lastSession: { id: string; title: string } | null;
}

/** The facts line, in Home's words. `chats` are every session. Pure. */
export function courseFacts(course: StudyCourse, chats: readonly ChatListItem[] = []): CourseFacts {
	const progress = courseProgress(course);
	return {
		progress: progress ? courseShareWords(progress.solid, progress.of) : null,
		exam: examWords(course),
		studied: lastStudied({ kind: "course", course, step: { kind: "none" } }),
		lastSession: lastSessionOf(course.map.workspace, chats),
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
	| { status: "unreadable"; course: UnreadableCourse }
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
			if (!course) {
				const unreadable = state.failed.find((c) => c.workspace === workspace);
				return unreadable ? { status: "unreadable", course: unreadable } : { status: "missing" };
			}
			return {
				status: "ready",
				view: { course, groups: courseGroups(course, state.chats, state.courses), facts: courseFacts(course, state.chats), next: courseNext(course, state.open) },
			};
		}
	}
}
