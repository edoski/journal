"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SetupDialog } from "@/components/setup-dialog";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { courseMove } from "@/components/study-home/study-facts";
import { unreadableLine } from "@/components/study-home/unreadable-course";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageFrame } from "@/components/page-frame/page-frame";
import { CourseChrome } from "@/components/course-page/course-chrome";
import { CourseLessonError } from "@/components/course-page/course-head/head-parts";
import { CourseHeaderSkeleton } from "@/components/course-page/course-header-skeleton";
import type { CourseRead, CourseView } from "@/components/course-page/course-model";
import { useCourse } from "@/components/course-page/use-course";

/** What a candidate draws once its course is read. */
export interface CourseReady {
	view: CourseView;
	busy: boolean;
	/** Take up the course's next step as Home's line does (`courseMove`). */
	onContinue: (workspace: string) => void;
}

/**
 * What the course page wraps itself in (spec: course-page.md): the chrome,
 * the read of the course with its states, each in the shared page frame
 * (`PageFrame`, page-frame.md), and the lesson start behind the head's
 * press, whose failure the head says under its next line (the window's
 * title is the route's metadata). The ready course draws its own frame;
 * the page fits the window with no bar showing.
 */
export function CourseFrame({ workspace, children }: { workspace: string; children: (ready: CourseReady) => React.ReactNode }) {
	const { read, chats, retry } = useCourse(workspace);
	const lesson = useLessonStart();
	const router = useRouter();
	const onContinue = (view: CourseView) => (ws: string) => {
		const move = courseMove(view.course, chats);
		if (move.kind === "open") router.push(`/chat/${move.chat.id}`);
		else lesson.start(move.opening, ws, { topics: move.topics, from: move.from });
	};
	return (
		<CourseChrome>
			<ScrollArea bar={false} data-slot="course-page" className="min-h-0 flex-1" viewportClassName="[&>div]:block! [&>div]:h-full">
				<CourseLessonError value={lesson.error}>
					<CourseBody read={read} onRetry={retry}>
						{(view) => children({ view, busy: lesson.busy, onContinue: onContinue(view) })}
					</CourseBody>
				</CourseLessonError>
			</ScrollArea>
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</CourseChrome>
	);
}

/** The course, or the one plain sentence that says why it cannot show, in the page frame. */
function CourseBody({ read, onRetry, children }: { read: CourseRead; onRetry: () => void; children: (view: CourseView) => React.ReactNode }) {
	switch (read.status) {
		case "loading":
			return (
				<PageFrame className="h-full">
					<CourseHeaderSkeleton />
				</PageFrame>
			);
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
			return children(read.view);
	}
}

function Notice({ children }: { children: React.ReactNode }) {
	return (
		<PageFrame className="h-full">
			<p data-slot="course-notice" className="flex min-h-8 flex-wrap items-center text-row text-muted-foreground">
				{children}
			</p>
		</PageFrame>
	);
}
