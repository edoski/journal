"use client";

import { Button } from "@/components/ui/button";
import { CoursesUnavailable } from "@/components/course-picker";
import { SetupDialog } from "@/components/setup-dialog";
import { takeLine, useLessonStart, type LessonStart, type TakeLine } from "@/components/start/use-lesson-start";
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
 * read of the courses with its states, and the lesson start. A home gives
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
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<main data-slot="study-home" className="min-h-0 flex-1 overflow-hidden">
				<div className={className}>
					<HomeBody state={state} onRetry={retry} quiet={quiet} busy={lesson.busy} onTake={lesson.take}>
						{children}
					</HomeBody>
					{lesson.error && (
						<p role="alert" className="shrink-0 text-body text-danger">
							{lesson.error}
						</p>
					)}
				</div>
			</main>
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</div>
	);
}

function HomeBody({
	state,
	onRetry,
	quiet,
	busy,
	onTake,
	children,
}: {
	state: StudyHomeState;
	onRetry: () => void;
	quiet: boolean;
	busy: boolean;
	onTake: LessonStart["take"];
	children: (home: HomeReady) => React.ReactNode;
}) {
	switch (state.status) {
		case "loading":
			return <Notice>Reading your courses…</Notice>;
		case "unavailable":
			return <CoursesUnavailable reason={state.reason} />;
		case "failed":
			return (
				<Notice>
					Couldn’t read your courses.{" "}
					<Button variant="quiet" size="sm" onClick={onRetry} className="text-link hover:text-link">
						Try again
					</Button>
				</Notice>
			);
		case "ready": {
			if (state.courses.length === 0) {
				if (state.failed.length > 0) return <UnreadableLines courses={state.failed} />;
				return <Notice>No courses yet. Start a lesson from New lesson and pick a course there.</Notice>;
			}
			const today = state.courses[0]!.map.today;
			const { rows } = needsYouNow(state.courses, state.chats, today, state.readAt);
			return (
				<>
					{children({
						rows,
						lessons: rows.map(lessonOf),
						courses: todayCourses(rows, state.courses),
						chats: state.chats,
						done: doneToday(state.chats, new Date(), state.courses),
						exam: nearExam(state.courses.flatMap(({ map }) => (map.exam ? [{ course: map.title, date: map.exam.date, daysLeft: map.exam.daysLeft }] : []))),
						busy,
						onContinue: takeLine(onTake, state.courses, state.chats),
					})}
					{!quiet && <UnreadableLines courses={state.failed} />}
				</>
			);
		}
	}
}

function Notice({ children }: { children: React.ReactNode }) {
	return <p className="text-body text-muted-foreground">{children}</p>;
}
