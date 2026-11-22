"use client";

import { useCallback } from "react";
import { LessonComposer } from "@/components/lesson/lesson-composer";
import { CourseControl, CoursesUnavailable, NEW_LEARNING_PLACEHOLDER, useCourseChoice } from "@/components/course-picker";
import { useFieldCycle } from "@/components/field-cycle";
import { SetupDialog } from "@/components/setup-dialog";
import { useModelSetup } from "@/components/setup-cta";
import { Button } from "@/components/ui/button";
import { WindowPage } from "@/components/page-frame/window-page";
import { NEW_LESSON_BOX } from "@/components/lesson/kept-drafts";
import { startCreation, useLessonStart, useStartDraft } from "@/components/start/use-lesson-start";

/** The heading over the composer. It names no mode: the tutor routes the
 *  request to teaching or practice itself. */
const START_HEADING = "What do you want to work on?";

/** The composer's prompt, for a lesson and for practice alike. */
const START_PLACEHOLDER = "Name a topic, ask a question or paste a problem";

/**
 * The start surface (spec: start-screen.md), T3 Code's new-chat anatomy: a
 * light question and the lesson's composer centred in a 736px column,
 * nothing else. It is the draft at /chat/new; a session is created only
 * when something is sent, through the one start path (`useLessonStart`).
 */
export function StartScreen() {
	// His words and photos survive a reload and a failed start; the photos
	// go with the lesson's first message.
	const draft = useStartDraft(NEW_LESSON_BOX);
	const lesson = useLessonStart();
	const courseChoice = useCourseChoice();
	const { unconnected } = useModelSetup();

	const cycleComposer = useCallback(
		(): readonly HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="composer"] textarea')),
		[],
	);
	useFieldCycle(cycleComposer);

	// The session is created with no mode: the prober reads the opening and
	// hands it to practice when it asks for problems. With no course picked
	// (New course or self-study), his words set something new up.
	const send = () => {
		if (!draft.canSend) return;
		if (courseChoice.state.status === "unavailable") {
			courseChoice.requireCourse();
			return;
		}
		lesson.start(startCreation(draft.text.trim(), courseChoice.workspace), { draft });
	};

	const { state } = courseChoice;

	return (
		<WindowPage>
			<main data-slot="start-screen" className="relative flex min-h-0 flex-1 flex-col px-5">
				<div className="flex min-h-0 flex-1 flex-col justify-end pb-8">
					<h1 className="text-center text-large-title font-normal text-foreground">{START_HEADING}</h1>
				</div>
				<div className="mx-auto w-full max-w-[46rem]">
					<LessonComposer
						busy={lesson.busy}
						value={draft.text}
						onChange={draft.setText}
						onSend={send}
						onStop={() => {}}
						canSend={draft.canSend}
						autoFocus
						placeholder={courseChoice.workspace ? START_PLACEHOLDER : NEW_LEARNING_PLACEHOLDER}
						leading={<CourseControl choice={courseChoice} />}
						photos={draft.photos}
					/>
				</div>
				<div className="mx-auto flex min-h-0 w-full max-w-[46rem] flex-1 flex-col gap-6 overflow-y-auto pt-4 pb-6">
					{(lesson.error || draft.photos.error || courseChoice.notice || unconnected) && (
						<div className="flex flex-col items-start gap-2 px-4">
							{(lesson.error || draft.photos.error) && <p role="alert" className="text-body text-danger">{lesson.error ?? draft.photos.error}</p>}
							{courseChoice.notice && (
								<p role="alert" data-testid="course-notice" className="text-body text-danger">{courseChoice.notice}</p>
							)}
							{unconnected && (
								<Button
									variant="quiet"
									data-testid="setup-cta-keys"
									onClick={lesson.openSetup}
									className="-ml-3 h-8 px-3 text-body font-normal text-link hover:text-link"
								>
									Sign in to Claude to start
								</Button>
							)}
						</div>
					)}
					{state.status === "unavailable" && (
						<div className="px-4">
							<CoursesUnavailable reason={state.reason} />
						</div>
					)}
				</div>
			</main>
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</WindowPage>
	);
}
