"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "@/components/composer";
import { CourseControl, CoursesUnavailable, useCourseChoice } from "@/components/course-picker";
import { useFieldCycle } from "@/components/field-cycle";
import { OPENING_PROMPT_FAILURE } from "@/components/opening-prompt";
import { SetupDialog } from "@/components/setup-dialog";
import { useModelSetup } from "@/components/setup-cta";
import { SessionStarter } from "@/components/start-session";
import { Button } from "@/components/ui/button";
import { usePhotoDraft } from "@/components/photos";
import { keepPhotos, keepWords, keptWords, NEW_LESSON_BOX } from "@/components/lesson/kept-drafts";

/** The heading over the composer. It names no mode: the tutor routes the
 *  request to teaching or practice itself. */
const START_HEADING = "What do you want to work on?";

/** The composer's prompt, for a lesson and for practice alike. */
const START_PLACEHOLDER = "Name a topic, ask a question or paste a problem";

/**
 * The Proposed start surface (spec: start-screen.md), T3 Code's new-chat
 * anatomy: a light question and the composer centred in a 736px column,
 * nothing else. It is the draft at /chat/new; a session is created only
 * when something is sent.
 */
/** The New lesson box's scope in kept-drafts.ts. */
const START_SCOPE = NEW_LESSON_BOX;

export function StartScreen() {
	const router = useRouter();
	const [text, setText] = useState("");
	// His words and photos survive a reload (kept-drafts.ts); the photos go
	// with the lesson's first message.
	const photos = usePhotoDraft(undefined, START_SCOPE);
	const restoredRef = useRef(false);
	useEffect(() => {
		const kept = keptWords(START_SCOPE)?.text;
		if (kept) setText(kept);
		restoredRef.current = true;
	}, []);
	useEffect(() => {
		if (restoredRef.current) keepWords(START_SCOPE, { text });
	}, [text]);
	const [busy, setBusy] = useState(false);
	const startingRef = useRef(false);
	const starterRef = useRef(new SessionStarter());
	const [startError, setStartError] = useState<string | null>(null);
	const courseChoice = useCourseChoice();
	const { unconnected } = useModelSetup();
	const [setupOpen, setSetupOpen] = useState(false);

	const cycleComposer = useCallback(
		(): readonly HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="composer"] textarea')),
		[],
	);
	useFieldCycle(cycleComposer);

	/** The pre-send guard: a signed-out Claude account opens sign-in;
	 *  nothing is created, so no orphan session. */
	const canStart = (): boolean => {
		if (!unconnected) return true;
		setSetupOpen(true);
		return false;
	};

	// The session is created with no mode: the prober reads the opening and
	// hands it to practice when it asks for problems.
	const launch = (opening: string, course: string) => {
		startingRef.current = true;
		setBusy(true);
		setStartError(null);
		void starterRef.current
			.start({ title: opening, course: { workspace: course } }, fetch)
			.then(async (target) => {
				const waiting = photos.photos.map((p) => p.photo);
				if (waiting.length) await keepPhotos(`${target.slice(target.lastIndexOf("/") + 1)}:opening`, waiting);
				keepWords(START_SCOPE, null);
				photos.take();
				router.push(target);
			})
			.catch(() => {
				startingRef.current = false;
				setBusy(false);
				setStartError(OPENING_PROMPT_FAILURE);
			});
	};

	const send = () => {
		const draft = text.trim();
		if (!draft || startingRef.current || !canStart()) return;
		const course = courseChoice.requireCourse();
		if (!course) return;
		launch(draft, course);
	};


	const { state } = courseChoice;

	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			{/* Window drag strip, first in the DOM: carved controls later in the
			    tree subtract from it (Electron resolves the mask by DOM order). */}
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<main data-slot="start-screen" className="relative flex min-h-0 flex-1 flex-col px-5">
				<div className="flex min-h-0 flex-1 flex-col justify-end pb-8">
					<h1 className="text-center text-large-title font-normal text-foreground">{START_HEADING}</h1>
				</div>
				<div className="mx-auto w-full max-w-[46rem]">
					<Composer
						busy={busy}
						value={text}
						onChange={setText}
						onSend={send}
						onStop={() => {}}
						canSend={text.trim().length > 0}
						autoFocus
						placeholder={START_PLACEHOLDER}
						toolbar={<CourseControl choice={courseChoice} />}
						photos={photos}
					/>
				</div>
				<div className="mx-auto flex min-h-0 w-full max-w-[46rem] flex-1 flex-col gap-6 overflow-y-auto pt-4 pb-6">
					{(startError || courseChoice.notice || unconnected) && (
						<div className="flex flex-col items-start gap-2 px-4">
							{startError && <p role="alert" className="text-body text-danger">{startError}</p>}
							{courseChoice.notice && (
								<p role="alert" data-testid="course-notice" className="text-body text-danger">{courseChoice.notice}</p>
							)}
							{unconnected && (
								<Button
									variant="quiet"
									data-testid="setup-cta-keys"
									onClick={() => setSetupOpen(true)}
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
			<SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
		</div>
	);
}
