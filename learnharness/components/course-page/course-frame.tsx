"use client";

import Link from "next/link";
import { takeLine, useLessonStart, type TakeLine } from "@/components/start/use-lesson-start";
import { StartScope } from "@/components/start/start-scope";
import { unreadableLine } from "@/components/study-home/unreadable-course";
import { Button } from "@/components/ui/button";
import { PageFrame } from "@/components/page-frame/page-frame";
import { CourseChrome } from "@/components/course-page/course-chrome";
import { CourseHeaderSkeleton } from "@/components/course-page/course-header-skeleton";
import type { CourseRead, CourseView } from "@/components/course-page/course-model";
import { useCourse } from "@/components/course-page/use-course";
import { useCourseStanding, type StandingRead } from "@/components/course-page/use-course-standing";
import type { CourseStanding } from "@/src/core";

/** What the page draws once its course is read. */
export interface CourseReady {
	view: CourseView;
	/** Where he stands for the exam and the open mistakes; null when the engine cannot say. */
	standing: CourseStanding | null;
	busy: boolean;
	/** Take up Now's line as Home takes it (`takeLine`): its step, else the course's next. */
	onContinue: TakeLine;
}

/**
 * What the course page wraps itself in (spec: course-page.md): the chrome,
 * the read of the course with its states, each in the shared page frame
 * (`PageFrame`, page-frame.md), and the page's one lesson start
 * (`StartScope`), which every press on it goes through (Now, Check it, a
 * mistake, the exam's ways in, the composer) and whose failure the head
 * says under its lines (the window's title is the route's metadata). The
 * course and where he stands are read side by side, and the page draws
 * once both are in, so the head never grows under him. The ready course draws its own frame; the page fits the
 * window with no bar showing.
 */
export function CourseFrame({ workspace, children }: { workspace: string; children: (ready: CourseReady) => React.ReactNode }) {
	const { read, chats, retry } = useCourse(workspace);
	const standing = useCourseStanding(workspace);
	const lesson = useLessonStart();
	return (
		<CourseChrome>
			<div data-slot="course-page" className="min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<StartScope lesson={lesson}>
					<CourseBody read={read} standing={standing} onRetry={retry}>
						{(view, known) => children({ view, standing: known, busy: lesson.busy, onContinue: takeLine(lesson.take, [view.course], chats) })}
					</CourseBody>
				</StartScope>
			</div>
		</CourseChrome>
	);
}

/** The course, or the one plain sentence that says why it cannot show, in the page frame. */
function CourseBody({ read, standing, onRetry, children }: { read: CourseRead; standing: StandingRead; onRetry: () => void; children: (view: CourseView, standing: CourseStanding | null) => React.ReactNode }) {
	switch (read.status) {
		case "loading":
			return <Reading />;
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
					{unreadableLine(read.course.problem)}{" "}
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
			return standing.status === "read" ? children(read.view, standing.standing) : <Reading />;
	}
}

function Reading() {
	return (
		<PageFrame className="h-full">
			<CourseHeaderSkeleton />
		</PageFrame>
	);
}

function Notice({ children }: { children: React.ReactNode }) {
	return (
		<PageFrame className="h-full">
			<p data-slot="course-notice" className="flex min-h-8 flex-wrap items-center text-body text-muted-foreground">
				{children}
			</p>
		</PageFrame>
	);
}
