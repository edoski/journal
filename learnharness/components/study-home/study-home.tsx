"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CoursesUnavailable } from "@/components/course-picker";
import { SetupDialog } from "@/components/setup-dialog";
import { SidebarToggle } from "@/components/sidebar";
import { CONTINUE_OPENING } from "@/components/start/course-facts";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { todayRows, type TodayRow } from "@/components/study-home/study-facts";
import { useStudyHome, type StudyHomeState } from "@/components/study-home/use-study-home";
import { HomeMap } from "@/components/study-home/home-map";
import { Today } from "@/components/study-home/today";
import { cn } from "@/lib/utils";
import type { StudyCourse } from "@/src/core";

/**
 * The study home (spec: study-home.md): what to study now, in one window.
 * The selected course's map on top, then Today, one line per course. The
 * page chrome, the states and the lesson start live here.
 */
export function StudyHome({ initialConfigured }: { initialConfigured: boolean }) {
	const { state, retry } = useStudyHome();
	const lesson = useLessonStart(initialConfigured);
	const [enlarged, setEnlarged] = useState(false);

	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3 py-2">
				<div className="pointer-events-auto">
					<SidebarToggle />
				</div>
			</header>
			<main data-slot="study-home" className="min-h-0 flex-1 overflow-hidden">
				<div className={cn("mx-auto flex h-full w-full flex-col gap-5 px-8 pt-13 pb-6", !enlarged && "max-w-[60rem]")}>
					<HomeBody
						state={state}
						onRetry={retry}
						enlarged={enlarged}
						onEnlarge={setEnlarged}
						busy={lesson.busy}
						onStart={lesson.start}
					/>
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
	enlarged,
	onEnlarge,
	busy,
	onStart,
}: {
	state: StudyHomeState;
	onRetry: () => void;
	enlarged: boolean;
	onEnlarge: (enlarged: boolean) => void;
	busy: boolean;
	/** Open a lesson in a course with an opening. */
	onStart: (opening: string, workspace: string) => void;
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
			const rows = todayRows(state.courses, state.waiting, today);
			return (
				<>
					<MapOnHome rows={rows} enlarged={enlarged} onEnlarge={onEnlarge} busy={busy} onStart={onStart} />
					{!enlarged && <Today rows={rows} today={today} busy={busy} onContinue={(workspace) => onStart(CONTINUE_OPENING, workspace)} />}
					{!enlarged && state.failed.length > 0 && (
						<p className="shrink-0 text-row text-muted-foreground">
							Couldn’t read {state.failed.length === 1 ? "one course" : "some courses"}: {state.failed.join(", ")}
						</p>
					)}
				</>
			);
		}
	}
}

/** The map of one course, with the courses as tabs in Today's order; it
 *  opens on the course of Today's first line. */
function MapOnHome({
	rows,
	enlarged,
	onEnlarge,
	busy,
	onStart,
}: {
	rows: readonly TodayRow[];
	enlarged: boolean;
	onEnlarge: (enlarged: boolean) => void;
	busy: boolean;
	onStart: (opening: string, workspace: string) => void;
}) {
	const courses = rows.flatMap((r): StudyCourse[] => (r.course ? [r.course] : []));
	const [workspace, setWorkspace] = useState(() => courses[0]!.map.workspace);
	return (
		<HomeMap
			courses={courses}
			workspace={workspace}
			onSelect={setWorkspace}
			enlarged={enlarged}
			onEnlarge={onEnlarge}
			onStudy={(topic, ws) => onStart(topic.title, ws)}
			busy={busy}
		/>
	);
}

function Notice({ children }: { children: React.ReactNode }) {
	return <p className="text-row text-muted-foreground">{children}</p>;
}
