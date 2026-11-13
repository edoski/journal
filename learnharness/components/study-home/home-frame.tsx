"use client";

import { Button } from "@/components/ui/button";
import { CoursesUnavailable } from "@/components/course-picker";
import { SetupDialog } from "@/components/setup-dialog";
import { SidebarToggle } from "@/components/sidebar";
import { CONTINUE_OPENING } from "@/components/start/course-facts";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { lessonOf, type Lesson } from "@/components/study-home/lesson-facts";
import { needsYouNow } from "@/components/study-home/needs-you";
import type { TodayRow } from "@/components/study-home/study-facts";
import { useStudyHome, type StudyHomeState } from "@/components/study-home/use-study-home";
import type { StudyCourse } from "@/src/core";

/** What a study home draws once the courses are read. */
export interface HomeReady {
	/** Today's lines, in the home's one order. */
	rows: readonly TodayRow[];
	/** The same lines as lessons in plain words. */
	lessons: readonly Lesson[];
	/** The courses, in Today's order, each once (two sessions waiting in
	 *  one course are two lines of one course). */
	courses: readonly StudyCourse[];
	/** The engine's study day. */
	today: string;
	busy: boolean;
	/** Open a lesson in a course with an opening. */
	onStart: (opening: string, workspace: string) => void;
	/** Take up a course's next step. */
	onContinue: (workspace: string) => void;
}

/**
 * What every study home shares (spec: lessons.md): the page chrome, the
 * read of the courses with its states, and the lesson start. A home gives
 * its column's classes and draws the ready state; `quiet` leaves out the
 * line that names an unreadable course, while a map fills the page.
 */
export function HomeFrame({
	initialConfigured,
	className,
	quiet = false,
	children,
}: {
	initialConfigured: boolean;
	className: string;
	quiet?: boolean;
	children: (home: HomeReady) => React.ReactNode;
}) {
	const { state, retry } = useStudyHome();
	const lesson = useLessonStart(initialConfigured);

	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3 py-2">
				<div className="pointer-events-auto">
					<SidebarToggle />
				</div>
			</header>
			<main data-slot="study-home" className="min-h-0 flex-1 overflow-hidden">
				<div className={className}>
					<HomeBody state={state} onRetry={retry} quiet={quiet} busy={lesson.busy} onStart={lesson.start}>
						{children}
					</HomeBody>
					{lesson.error && (
						<p role="alert" className="shrink-0 text-row text-danger">
							{lesson.error}
						</p>
					)}
				</div>
			</main>
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} onDone={lesson.closeSetup} />
		</div>
	);
}

function HomeBody({
	state,
	onRetry,
	quiet,
	busy,
	onStart,
	children,
}: {
	state: StudyHomeState;
	onRetry: () => void;
	quiet: boolean;
	busy: boolean;
	onStart: (opening: string, workspace: string) => void;
	children: (home: HomeReady) => React.ReactNode;
}) {
	switch (state.status) {
		case "loading":
			return <Notice>Reading your courses…</Notice>;
		case "unavailable":
			return <CoursesUnavailable reason={state.reason} variant="proposed" />;
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
				return <Notice>No courses yet. Start a lesson from New lesson and pick a course there.</Notice>;
			}
			const today = state.courses[0]!.map.today;
			const { rows } = needsYouNow(state.courses, state.chats, today);
			return (
				<>
					{children({
						rows,
						lessons: rows.map(lessonOf),
						courses: [...new Set(rows.flatMap((r): StudyCourse[] => (r.course ? [r.course] : [])))],
						today,
						busy,
						onStart,
						onContinue: (workspace) => onStart(CONTINUE_OPENING, workspace),
					})}
					{!quiet && state.failed.length > 0 && (
						<p className="shrink-0 text-row text-muted-foreground">
							Couldn’t read {state.failed.length === 1 ? "one course" : "some courses"}: {state.failed.join(", ")}
						</p>
					)}
				</>
			);
		}
	}
}

function Notice({ children }: { children: React.ReactNode }) {
	return <p className="text-row text-muted-foreground">{children}</p>;
}
