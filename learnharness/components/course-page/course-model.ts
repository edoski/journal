import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle, UnreadableCourse } from "@/src/core";
import { CURRENT_TAG, standingOf, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { courseProgress, lastStudied, whyOf, type Why } from "@/components/study-home/agenda-rows/row-facts";
import { examWords, todayRows, type TodayRow } from "@/components/study-home/study-facts";
import { lessonOf, type Lesson } from "@/components/study-home/lesson-facts";
import type { StudyHomeState } from "@/components/study-home/use-study-home";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { sidebarSays, type Said, type SidebarPlace, type TopicFact } from "@/components/unit-inbox/sidebar-says";
import { courseShareWords } from "@/components/study-words";
import { lastSessionOf } from "@/components/course-page/course-head/head-facts";

/**
 * The course page's model (spec: course-page.md): one course's topics, each
 * in the group the sidebar puts it in, ending in the fact the sidebar's row
 * says, and the header's facts and next lesson. It reads what the sidebar
 * says for each topic (`sidebarSays`), as every map card does, so a topic
 * is in one group with one fact wherever it shows. Engine fields only. Pure.
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

const GROUP_OF: Record<SidebarPlace, GroupId> = { today: "needs-you", learning: "learning", known: "on-your-own" };
const HERE: TopicFact = { kind: "here", words: CURRENT_TAG };

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
 * Each row ends in the sidebar's fact for it (`sidebarSays`). `chats`
 * are every session (with those started on a topic's page linked to it);
 * `courses` every course, since Today weighs them together. Always the
 * four groups, an empty one included. Pure.
 */
export function courseGroups(course: StudyCourse, chats: readonly ChatListItem[] = [], courses: readonly StudyCourse[] = [course]): CourseGroup[] {
	const { map } = course;
	const said = sidebarSays(courses, chats, map.workspace);
	const order = [...said.keys()];

	const rows = map.topics.map((topic): CourseTopic => {
		const current = map.current === topic.handle;
		const { place, fact = null } = said.get(topic.handle) ?? {};
		const group = place ? GROUP_OF[place] : "not-started";
		// "You are here" in place of when it comes back or was studied, never in place of what needs him.
		const here = current && group !== "needs-you" && (fact === null || fact.kind === "back" || fact.kind === "studied");
		return { topic, group, fact: here ? HERE : fact, standing: standingOf(topic), current, href: unitHref(map.workspace, topic.handle) };
	});
	const at = (row: CourseTopic) => order.indexOf(row.topic.handle);
	const NEVER = "9999-12-31";
	const byStart = (a: CourseTopic, b: CourseTopic) => (a.topic.starts ?? NEVER).localeCompare(b.topic.starts ?? NEVER);
	return GROUP_IDS.map((id) => {
		const mine = rows.filter((row) => row.group === id);
		const sorted = id === "not-started" ? mine.sort(byStart) : mine.sort((a, b) => at(a) - at(b));
		return { id, title: GROUP_WORDS[id], topics: sorted };
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
 *  topics in their groups, what the sidebar says for each (the map's
 *  cards), the header's facts and its next lesson. */
export interface CourseView {
	course: StudyCourse;
	groups: readonly CourseGroup[];
	said: ReadonlyMap<TopicHandle, Said>;
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
				view: {
					course,
					groups: courseGroups(course, state.chats, state.courses),
					said: sidebarSays(state.courses, state.chats, workspace),
					facts: courseFacts(course, state.chats),
					next: courseNext(course, state.open),
				},
			};
		}
	}
}
