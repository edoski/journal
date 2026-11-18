"use client";

import { Button } from "@/components/ui/button";
import { PageNotice, PageReading } from "@/components/page-frame/page-frame";
import { WindowPage } from "@/components/page-frame/window-page";
import { CoursesUnavailable } from "@/components/course-picker";
import { StartScope } from "@/components/start/start-scope";
import { takeLine, useLessonStart, type TakeLine } from "@/components/start/use-lesson-start";
import { lessonOf, type Lesson } from "@/components/study-home/lesson-facts";
import { doneToday, nearExam, type NearExam } from "@/components/study-home/day-record";
import { needsYouNow } from "@/components/study-home/needs-you";
import { todayCourses, type TodayRow } from "@/components/study-home/study-facts";
import { UnreadableLines } from "@/components/study-home/unreadable-course";
import { useStudyHome, type StudyHomeState } from "@/components/study-home/use-study-home";
import type { ChatListItem, StudyCourse } from "@/src/core";

/** What a study home draws once the courses are read. */
export interface HomeReady {
	/** Today's lines, in the home's one order. */
	rows: readonly TodayRow[];
	/** The same lines as lessons in plain words. */
	lessons: readonly Lesson[];
	/** The courses, in Today's order, each once (two sessions waiting in
	 *  one course are two lines of one course). */
	courses: readonly StudyCourse[];
	/** Every session, newest first. */
	chats: readonly ChatListItem[];
	/** What he finished today, by title, oldest first (`doneToday`). */
	done: readonly string[];
	/** The nearest exam in the coming week, which the heading names (`nearExam`). */
	exam: NearExam | null;
	busy: boolean;
	/** Take up a course line's step, else the course's next (`takeLine`). */
	onContinue: TakeLine;
}

/**
 * What every study home shares (spec: lessons.md): the page chrome, the
 * read of the courses with its states, and the lesson start, the one its
 * lines and its composer share (`StartScope`). A home gives
 * its column's classes and draws the ready state; `quiet` leaves out the
 * lines that name an unreadable course, while a map fills the page.
 */
export function HomeFrame({
	className,
	quiet = false,
	children,
}: {
	className: string;
	quiet?: boolean;
	children: (home: HomeReady) => React.ReactNode;
}) {
	const { state, retry } = useStudyHome();
	const lesson = useLessonStart();

	return (
		<WindowPage>
			<StartScope lesson={lesson}>
				<main data-slot="study-home" className="min-h-0 flex-1 overflow-hidden">
					<HomeBody state={state} onRetry={retry}>
						{({ courses, chats, failed, readAt }) => (
							<div className={className}>
								{courses.length > 0 &&
									children({
										...homeOf(courses, chats, readAt),
										busy: lesson.busy,
										onContinue: takeLine(lesson.take, courses, chats),
									})}
								{(!quiet || courses.length === 0) && <UnreadableLines courses={failed} />}
								{lesson.error && (
									<p role="alert" className="shrink-0 text-body text-danger">
										{lesson.error}
									</p>
								)}
							</div>
						)}
					</HomeBody>
				</main>
			</StartScope>
		</WindowPage>
	);
}

/** Home's lines and what goes with them, from the courses read. */
function homeOf(courses: readonly StudyCourse[], chats: readonly ChatListItem[], readAt: string | undefined) {
	const { rows } = needsYouNow(courses, chats, courses[0]!.map.today, readAt);
	return {
		rows,
		lessons: rows.map(lessonOf),
		courses: todayCourses(rows, courses),
		chats,
		done: doneToday(chats, new Date(), courses),
		exam: nearExam(courses.flatMap(({ map }) => (map.exam ? [{ course: map.title, date: map.exam.date, daysLeft: map.exam.daysLeft, workspace: map.workspace, wontFit: (map.exam.doesNotFit ?? []).flatMap((h) => map.topics.find((t) => t.handle === h)?.title ?? []) }] : []))),
	};
}

/** Home's read: the page's notice while it reads or can't (`PageNotice`), else its column. */
function HomeBody({ state, onRetry, children }: { state: StudyHomeState; onRetry: () => void; children: (ready: Extract<StudyHomeState, { status: "ready" }>) => React.ReactNode }) {
	switch (state.status) {
		case "loading":
			return <PageReading />;
		case "unavailable":
			return (
				<PageNotice>
					<CoursesUnavailable reason={state.reason} />
				</PageNotice>
			);
		case "failed":
			return (
				<PageNotice>
					Couldn’t read your courses.{" "}
					<Button variant="quiet" size="sm" onClick={onRetry} className="text-link hover:text-link">
						Try again
					</Button>
				</PageNotice>
			);
		case "ready":
			if (state.courses.length === 0 && state.failed.length === 0) return <PageNotice>No courses yet. Start a lesson from New lesson and pick a course there.</PageNotice>;
			return children(state);
	}
}
