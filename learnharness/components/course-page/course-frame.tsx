"use client";

import Link from "next/link";
import { SetupDialog } from "@/components/setup-dialog";
import { CONTINUE_OPENING } from "@/components/start/course-facts";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CourseChrome } from "@/components/course-page/course-chrome";
import { CourseLessonError } from "@/components/course-page/course-header";
import { CourseHeaderSkeleton } from "@/components/course-page/course-header-skeleton";
import type { CourseRead, CourseView } from "@/components/course-page/course-model";
import { useCourse } from "@/components/course-page/use-course";

/** What a candidate draws once its course is read. */
export interface CourseReady {
	view: CourseView;
	busy: boolean;
	/** Take up the course's next step (Home's Continue). */
	onContinue: (workspace: string) => void;
}

/**
 * What every course page candidate shares (spec: course-page.md): the
 * chrome, the read of the course with its states, and the lesson start
 * behind the header's button, whose failure the header says under its next
 * line (the window's title is the route's metadata). A candidate gives its
 * column's classes and draws the ready course; the page scrolls with no
 * bar showing, and a column of `h-full` fits the window instead.
 */
export function CourseFrame({
	workspace,
	initialConfigured,
	className,
	children,
}: {
	workspace: string;
	initialConfigured: boolean;
	className: string;
	children: (ready: CourseReady) => React.ReactNode;
}) {
	const { read, retry } = useCourse(workspace);
	const lesson = useLessonStart(initialConfigured);
	return (
		<CourseChrome>
			<ScrollArea bar={false} data-slot="course-page" className="min-h-0 flex-1" viewportClassName="[&>div]:block! [&>div]:h-full">
				<div className={className}>
					<CourseLessonError value={lesson.error}>
						<CourseBody read={read} onRetry={retry}>
							{(view) => children({ view, busy: lesson.busy, onContinue: (ws) => lesson.start(CONTINUE_OPENING, ws) })}
						</CourseBody>
					</CourseLessonError>
				</div>
			</ScrollArea>
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} onDone={lesson.closeSetup} />
		</CourseChrome>
	);
}

/** The course, or the one plain sentence that says why it cannot show. */
function CourseBody({ read, onRetry, children }: { read: CourseRead; onRetry: () => void; children: (view: CourseView) => React.ReactNode }) {
	switch (read.status) {
		case "loading":
			return <CourseHeaderSkeleton />;
		case "unavailable":
			return <Notice>The study engine is not answering, so this course can’t show right now.</Notice>;
		case "failed":
			return (
				<Notice>
					Couldn’t read this course.{" "}
					<Button variant="quiet" size="sm" onClick={onRetry} className="text-link hover:text-link">
						Try again
					</Button>
				</Notice>
			);
		case "unreadable":
			return (
				<Notice>
					The study engine couldn’t read this course.{" "}
					<Button variant="quiet" size="sm" onClick={onRetry} className="text-link hover:text-link">
						Try again
					</Button>
				</Notice>
			);
		case "missing":
			return (
				<Notice>
					This course is not here.{" "}
					<Button variant="quiet" size="sm" asChild className="text-link hover:text-link">
						<Link href="/">Go to Home</Link>
					</Button>
				</Notice>
			);
		case "ready":
			return children(read.view);
	}
}

function Notice({ children }: { children: React.ReactNode }) {
	return (
		<p data-slot="course-notice" className="flex min-h-8 flex-wrap items-center text-row text-muted-foreground">
			{children}
		</p>
	);
}
