"use client";

import { Button } from "@/components/ui/button";
import { CoursesUnavailable } from "@/components/course-picker";
import { SetupDialog } from "@/components/setup-dialog";
import { SidebarToggle } from "@/components/sidebar";
import { CONTINUE_OPENING } from "@/components/start/course-facts";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { longDay } from "@/components/study-home/study-facts";
import { useStudyHome, type StudyHomeState } from "@/components/study-home/use-study-home";
import { Agenda } from "@/components/study-home/agenda";
import type { HomeProps } from "@/components/study-home/home-props";

/**
 * The study home (spec: study-home.md): where studying stands across every
 * course, as the agenda. The page chrome, the states and the lesson start
 * live here.
 */
export function StudyHome({ initialConfigured }: { initialConfigured: boolean }) {
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
			<main data-slot="study-home" className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-[46rem] px-8 pt-16 pb-16">
					<HomeBody
						state={state}
						onRetry={retry}
						props={{
							busy: lesson.busy,
							onContinue: (workspace) => lesson.start(CONTINUE_OPENING, workspace),
						}}
					/>
					{lesson.error && (
						<p role="alert" className="mt-6 text-row text-danger">
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
	props,
}: {
	state: StudyHomeState;
	onRetry: () => void;
	props: Pick<HomeProps, "busy" | "onContinue">;
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
			const home: HomeProps = { ...props, courses: state.courses, waiting: state.waiting, today };
			return (
				<>
					<HomeHeading today={today} />
					<Agenda {...home} />
					{state.failed.length > 0 && (
						<p className="mt-8 text-row text-muted-foreground">
							Couldn’t read {state.failed.length === 1 ? "one course" : "some courses"}: {state.failed.join(", ")}
						</p>
					)}
				</>
			);
		}
	}
}

/** The page's title: the engine's study day over "Home". */
function HomeHeading({ today }: { today: string }) {
	return (
		<hgroup data-slot="study-home-heading" className="mb-8 flex flex-col gap-1">
			<p className="text-label text-muted-foreground">{longDay(today)}</p>
			<h1 className="text-heading font-semibold text-foreground">Home</h1>
		</hgroup>
	);
}

function Notice({ children }: { children: React.ReactNode }) {
	return <p className="text-row text-muted-foreground">{children}</p>;
}
