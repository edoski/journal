import { currentArc, examCovers, type ArcHandle, type ChatListItem, type CourseMap, type CourseMapArc, type CourseMapTopic, type StudyCourse, type TopicHandle, type UnreadableCourse } from "@/src/core";
import { CURRENT_TAG, standingOf, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { courseProgress, lastStudied, whyOf, type Why } from "@/components/study-home/agenda-rows/row-facts";
import { examWords, nextStepOf, planDay, todayRows, type TodayRow } from "@/components/study-home/study-facts";
import { lessonOf, type Lesson } from "@/components/study-home/lesson-facts";
import type { StudyHomeState } from "@/components/study-home/use-study-home";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { sidebarSays, type Said, type SidebarPlace, type TopicFact } from "@/components/unit-inbox/sidebar-says";
import { AFTER_EXAM, ARC_EXAM_WORDS, courseShareWords, firstLessonWords, reviewWords, shortDay, shortReviewWords } from "@/components/study-words";
import { nowFor } from "@/components/unit-inbox/now-inbox";
import { todayTop } from "@/components/unit-inbox/today/today-top";
import { buildInbox } from "@/components/unit-inbox/units";
import type { NowLine } from "@/components/study-home/needs-you";
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

/** Each group's name on the page: Needs you is Home's Today. */
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
	/** The fact's words as the row shows them, its shortest whole words
	 *  ("Due 6 Nov", "Back 20 Nov", "Planned 18 Nov", `shownWords`), its
	 *  whole sentence (`fact.words`, the sidebar's) kept for the row's
	 *  hover hint. */
	factWords: string | null;
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
 *   - Learning: taught and not solid, or solid but weak (`restTopics`'
 *     working, then learning), in that order;
 *   - Not started: the rest of the path, in the order the plan starts
 *     them (`starts`), those it has no day for last, in the engine's path
 *     order;
 *   - On your own: solid and not weak (`restTopics`' known), in its order.
 * Each row ends in the sidebar's fact for it (`sidebarSays`). `chats`
 * are every session (with those started on a topic's page linked to it);
 * `courses` every course, since Today weighs them together. Always the
 * four groups, an empty one included. Pure.
 */
export function courseGroups(course: StudyCourse, chats: readonly ChatListItem[] = [], courses: readonly StudyCourse[] = [course]): CourseGroup[] {
	const { rows, said } = courseRows(course, chats, courses);
	const order = [...said.keys()];
	const at = (row: CourseTopic) => order.indexOf(row.topic.handle);
	const NEVER = "9999-12-31";
	const byStart = (a: CourseTopic, b: CourseTopic) => (a.topic.starts ?? NEVER).localeCompare(b.topic.starts ?? NEVER);
	return GROUP_IDS.map((id) => {
		const mine = rows.filter((row) => row.group === id);
		const sorted = id === "not-started" ? mine.sort(byStart) : mine.sort((a, b) => at(a) - at(b));
		return { id, title: GROUP_WORDS[id], topics: sorted };
	});
}

/** Every topic of the course as a row, in the engine's path order, each in
 *  the group the sidebar puts it in with the sidebar's fact (`sidebarSays`). */
function courseRows(course: StudyCourse, chats: readonly ChatListItem[], courses: readonly StudyCourse[]): { rows: CourseTopic[]; said: ReadonlyMap<TopicHandle, Said> } {
	const { map } = course;
	const said = sidebarSays(courses, chats, map.workspace);
	const rows = map.topics.map((topic): CourseTopic => {
		const current = map.current === topic.handle;
		const { place, fact = null } = said.get(topic.handle) ?? {};
		const group = place ? GROUP_OF[place] : "not-started";
		// "You are here" in place of when it comes back or was studied, never in place of what needs him.
		const here = current && group !== "needs-you" && (fact === null || fact.kind === "back" || fact.kind === "studied");
		// A topic not started says the day the plan starts it, not the group's own "Not started" (round 5).
		const planned: TopicFact | null = group === "not-started" && fact === null && topic.starts ? { kind: "next", words: topic.starts <= map.today ? "Planned today" : `Planned ${planDay(topic.starts)}` } : null;
		// A start the exam's plan puts after an exam still ahead, one it has no room for or leaves out, says so,
		// its day in the hint (round 12, 1 m11: "Geometric · Planned 29 Nov" on the exam's own course page while
		// its topic page said "Not before the exam"), where he is too (round 13, 1 n2: "You are here" beside the
		// head's no room before the exam to start it).
		const waits = [...(map.exam?.doesNotFit ?? []), ...(map.exam?.leavesOut ?? [])].includes(topic.handle);
		const afterExam = planned && topic.starts && map.exam && map.exam.daysLeft >= 0 && topic.starts > map.exam.date && waits;
		const shown = here && !afterExam ? HERE : (planned ?? fact);
		const words = afterExam ? AFTER_EXAM : planned && shown === planned && topic.starts && topic.starts > map.today ? `Planned ${shortDay(topic.starts)}` : shownWords(shown, topic, map.today);
		return { topic, group, fact: shown, factWords: words, standing: standingOf(topic), current, href: unitHref(map.workspace, topic.handle) };
	});
	return { rows, said };
}

/** A row's fact in its shortest whole words, the sidebar's sentence kept
 *  for the hint (round 11, 1 N8: rows showed a bare icon where the words
 *  did not fit): a review by its one day (`shortReviewWords`), a method
 *  he mixed up as "Mixed up", any other fact as the sidebar says it. */
function shownWords(fact: TopicFact | null, topic: CourseMapTopic, today: string): string | null {
	if (!fact) return null;
	if (fact.kind === "slip" && fact.slip === "mixed") return MIXED_UP;
	const review = fact.kind === "review" || fact.kind === "back" ? topic.review : null;
	return review && fact.words === reviewWords(review, today) ? shortReviewWords(review, today) : fact.words;
}

/** A mixed-up method's slip on a row, the method named in its hint. */
const MIXED_UP = "Mixed up";

/** The arcs the course page leads with: the map's, when it has two or more
 *  he can see; null otherwise, and the page shows its four groups as a
 *  course without arcs does. Pure. */
export function shownArcs(map: Pick<CourseMap, "arcs">): readonly CourseMapArc[] | null {
	return map.arcs && map.arcs.length >= 2 ? map.arcs : null;
}

/** One arc as the course page lists it (spec: course-page.md, "Arcs"). */
export interface CourseArcSection {
	arc: CourseMapArc;
	/** Its topics in path order, each as the groups' rows say it. */
	topics: readonly CourseTopic[];
	/** One of its topics is one Home's Today takes up: the line says
	 *  "Needs you" in place of where the arc stands. */
	needsYou: boolean;
	/** Its ring: the share of its live topics he can do on his own, as
	 *  Home's ring counts a course; null for an arc with none live. */
	share: number | null;
	/** "Partly on the exam" or "Not on the exam", when the next exam leaves
	 *  some arc out and this one is not wholly on it; else null. */
	exam: string | null;
	/** Where he is (`currentArc`): the arc open on arrival. */
	current: boolean;
}

/**
 * The course's arcs in study order (spec: course-page.md, "Arcs"), each
 * with its topics as the page's rows (the groups' words and facts), its
 * ring, "Needs you" when Today takes up one of its topics, and its exam
 * words. Null for a course `shownArcs` gives none. `chats` and `courses`
 * as `courseGroups` reads them. Pure.
 */
export function courseArcs(course: StudyCourse, chats: readonly ChatListItem[] = [], courses: readonly StudyCourse[] = [course]): CourseArcSection[] | null {
	const { map } = course;
	const arcs = shownArcs(map);
	if (!arcs) return null;
	const { rows } = courseRows(course, chats, courses);
	const here = currentArc(map);
	const covers = new Map(arcs.map((arc) => [arc.handle, examCovers(map.exam, arc, map.topics)]));
	const leavesSomeOut = [...covers.values()].some((c) => c === "part" || c === "none");
	return arcs.map((arc) => {
		const topics = rows.filter((row) => row.topic.arc === arc.handle);
		const cover = covers.get(arc.handle);
		return {
			arc,
			topics,
			needsYou: topics.some((row) => row.group === "needs-you"),
			share: arcShare(course, arc.handle),
			exam: leavesSomeOut && (cover === "part" || cover === "none") ? ARC_EXAM_WORDS[cover] : null,
			current: arc.handle === here,
		};
	});
}

/** An arc's ring: the share of its live topics he can do on his own, as
 *  Home's ring counts a course (`courseProgress`); null with none live. */
export function arcShare(course: StudyCourse, arc: ArcHandle): number | null {
	const live = course.map.topics.filter((t) => t.arc === arc && t.excluded === undefined);
	const progress = courseProgress({ ...course, map: { ...course.map, topics: live } });
	return progress ? progress.solid / progress.of : null;
}

/**
 * Where he picks up in a course with arcs (spec: course-page.md, "Now"):
 * the course's first line on Home's Today, read through `todayTop` over
 * every course, so a slip in another arc that Today puts first is what he
 * picks up. Null for a course the page shows without arcs, or when Today
 * has nothing here. Pure.
 */
export function pickUpLine(course: StudyCourse, chats: readonly ChatListItem[] = [], courses: readonly StudyCourse[] = [course]): NowLine | null {
	const { map } = course;
	if (!shownArcs(map)) return null;
	return todayTop(nowFor(courses, chats, null, map.today), buildInbox(courses, chats, null), chats).find((item) => item.line.row.course?.map.workspace === map.workspace)?.line ?? null;
}

/** The arc a page shows first: where he is, else the first. */
export function openingArc(sections: readonly CourseArcSection[]): ArcHandle | null {
	return (sections.find((s) => s.current) ?? sections[0])?.arc.handle ?? null;
}

/** The header's lesson: Home's line for this course (`todayRows`), as a
 *  lesson in Today's words (its press's word too), and why it is next. */
export interface CourseNext {
	row: TodayRow;
	lesson: Lesson;
	why: Why | null;
}

/** What the course's button takes up, exactly as Home's line for it would:
 *  a session in this course to pick up since yesterday, else the course's
 *  next step. Home has no line for a course whose lesson he ended today
 *  with Done for today (`todayRows`); its page still has its one button,
 *  on the course's next step, which the press takes up (`courseMove`).
 *  `open` are the sessions to pick up (`openSessions`). Pure. */
export function courseNext(course: StudyCourse, open: readonly ChatListItem[]): CourseNext {
	const mine = open.filter((c) => c.course?.workspace === course.map.workspace);
	const row: TodayRow = todayRows([course], mine, course.map.today)[0] ?? { kind: "course", course, step: nextStepOf(course) };
	return { row, lesson: lessonOf(row), why: whyOf(row) };
}

/** The header's facts, each a few words; null where the course has none. */
export interface CourseFacts {
	/** "Some topics on your own": in words, the share Home's progress ring draws. */
	progress: string | null;
	/** "Exam in 21 days", "Exam tomorrow", "Exam today". */
	exam: string | null;
	/** "Studied 4 Nov", "Studied today"; a course not studied yet,
	 *  when its first lesson comes and why ("First lesson Thu 19 Nov, after
	 *  Probability's new topics"), else "Not studied yet". */
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
		studied: (course.lastActiveDaysAgo === null ? firstLessonWords(course.map.topics, course.map.today) : null) ?? lastStudied({ kind: "course", course, step: { kind: "none" } }),
		lastSession: lastSessionOf(course.map.workspace, chats),
	};
}

/** Everything the course page draws: the engine's course, its
 *  topics in their groups, what the sidebar says for each (the map's
 *  cards), the header's facts and its next lesson. */
export interface CourseView {
	course: StudyCourse;
	groups: readonly CourseGroup[];
	/** The course's arcs, when the page leads with them (`courseArcs`). */
	arcs: readonly CourseArcSection[] | null;
	/** Where he picks up, Now's line under the head (`pickUpLine`). */
	pickUp: NowLine | null;
	said: ReadonlyMap<TopicHandle, Said>;
	facts: CourseFacts;
	next: CourseNext;
	/** Every session, those started on a topic's page linked to it. */
	chats: readonly ChatListItem[];
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
					arcs: courseArcs(course, state.chats, state.courses),
					pickUp: pickUpLine(course, state.chats, state.courses),
					said: sidebarSays(state.courses, state.chats, workspace),
					facts: courseFacts(course, state.chats),
					next: courseNext(course, state.open),
					chats: state.chats,
				},
			};
		}
	}
}
