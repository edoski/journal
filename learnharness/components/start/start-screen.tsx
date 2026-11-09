"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "@/components/composer";
import { NodePickerControl } from "@/components/composer-actions";
import { ChainTableOverlay } from "@/components/chain-table.tsx";
import { CourseControl, CoursesUnavailable, NewCourseDialog, useCourseChoice } from "@/components/course-picker";
import { useFieldCycle } from "@/components/field-cycle";
import { OPENING_PROMPT_FAILURE } from "@/components/opening-prompt";
import { SetupDialog } from "@/components/setup-dialog";
import { openModelPicker, selectedModelUnavailable, useModelSetup } from "@/components/setup-cta";
import { SidebarToggle } from "@/components/sidebar";
import { SessionStarter } from "@/components/start-session";
import { CourseChips } from "@/components/start/course-chips";
import { CHIP_OPENING } from "@/components/start/course-facts";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { GraphSnapshot } from "@/src/core";

type Mode = "teach" | "practice";
/** A practice pick as the learner saw it in the chain table. */
type DraftPick = { id: string; name: string; statement: string };

const CHIP_START_FAILURE = "Couldn’t open the session. Try again.";

/** The heading over the composer: Today asks about the day, the draft
 *  about the session. */
export function startHeading(today: boolean, mode: Mode): string {
	if (today) return mode === "practice" ? "What are we practising today?" : "What are we learning today?";
	return mode === "practice" ? "What do you want to practise?" : "What do you want to learn?";
}

/**
 * The Proposed start surface (spec: start-screen.md), T3 Code's new-chat
 * anatomy: a light question, the composer centred in a 736px column, and
 * under it, on Today, one chip per course. Home
 * (`today`) and the draft at /chat/new share it; a session is created only
 * when something is sent, through the same path the current screens use.
 */
export function StartScreen({
	initialConfigured,
	initialMode = "teach",
	today = false,
}: {
	initialConfigured: boolean;
	initialMode?: Mode;
	/** Home: the day's question and the course chips. */
	today?: boolean;
}) {
	const router = useRouter();
	const [text, setText] = useState("");
	const [mode, setMode] = useState<Mode>(initialMode);
	// The sidebar's New lesson / practice entries navigate within /chat/new.
	useEffect(() => setMode(initialMode), [initialMode]);
	const [busy, setBusy] = useState(false);
	const startingRef = useRef(false);
	const starterRef = useRef(new SessionStarter());
	const [startError, setStartError] = useState<string | null>(null);
	const courseChoice = useCourseChoice();
	const [creatingCourse, setCreatingCourse] = useState(false);
	const { catalog, configured, zeroKeys } = useModelSetup(initialConfigured);
	const [setupOpen, setSetupOpen] = useState(false);

	// Practice picks: the chain table opens over this column on first use.
	const [picks, setPicks] = useState<DraftPick[]>([]);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
	const openPicker = () => {
		if (snapshot) {
			setPickerOpen(true);
			return;
		}
		void fetch("/api/graph")
			.then((r) => r.json() as Promise<GraphSnapshot>)
			.then((snap) => {
				setSnapshot(snap);
				setPickerOpen(true);
			})
			.catch(() => {
				/* an unreachable graph leaves the composer usable, without picks */
			});
	};

	const cycleComposer = useCallback(
		(): readonly HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="composer"] textarea')),
		[],
	);
	useFieldCycle(cycleComposer);

	/** The pre-send guards: missing models or keys open setup, an unavailable
	 *  model opens its picker; nothing is created, so no orphan session. */
	const canStart = (): boolean => {
		if (!configured || zeroKeys) {
			setSetupOpen(true);
			return false;
		}
		const strong = catalog?.slots.strong?.model;
		if (selectedModelUnavailable(catalog, strong ? `${strong.provider}:${strong.id}` : undefined)) {
			openModelPicker();
			return false;
		}
		return true;
	};

	const launch = (opening: string, kind: Mode, course: string, failure: string, chosen?: readonly DraftPick[]) => {
		startingRef.current = true;
		setBusy(true);
		setStartError(null);
		// The picks ride the creation as graph context, as on the current screens.
		const practice = kind === "practice"
			? { kind: "practice" as const, ...(chosen && chosen.length > 0 ? { graphContext: { propositions: chosen } } : {}) }
			: {};
		void starterRef.current
			.start({ title: opening, ...practice, course: { workspace: course } }, fetch, JSON.stringify(catalog?.slots.strong))
			.then((target) => router.push(target))
			.catch(() => {
				startingRef.current = false;
				setBusy(false);
				setStartError(failure);
			});
	};

	const send = () => {
		const draft = text.trim();
		if (!draft || startingRef.current || !canStart()) return;
		const course = courseChoice.requireCourse();
		if (!course) return;
		launch(draft, mode, course, OPENING_PROMPT_FAILURE, mode === "practice" ? picks : undefined);
	};

	// A chip opens a teaching session in its course; the tutor takes the
	// reviews due first, then the open task (CHIP_OPENING).
	const startCourse = (workspace: string) => {
		if (startingRef.current || !canStart()) return;
		launch(CHIP_OPENING, "teach", workspace, CHIP_START_FAILURE);
	};

	const { state } = courseChoice;
	const showPicker = mode === "practice" || picks.length > 0;

	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			{/* Window drag strip, first in the DOM: carved controls later in the
			    tree subtract from it (Electron resolves the mask by DOM order). */}
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<main data-slot="start-screen" className="relative flex min-h-0 flex-1 flex-col px-5">
				<div className="flex min-h-0 flex-1 flex-col justify-end pb-8">
					<h1 className="text-center text-display font-normal tracking-[-0.025em] text-foreground">{startHeading(today, mode)}</h1>
				</div>
				<div className="mx-auto w-full max-w-[46rem]">
					<Composer
						variant="proposed"
						busy={busy}
						value={text}
						onChange={setText}
						onSend={send}
						onStop={() => {}}
						canSend={text.trim().length > 0}
						autoFocus
						placeholder={mode === "practice" ? "Name a topic or paste a problem" : "Name a topic or ask a question"}
						toolbar={
							<>
								<CourseControl choice={courseChoice} variant="proposed" />
								<ToggleGroup
									type="single"
									variant="segmented"
									size="segment"
									value={mode}
									onValueChange={(next) => next && setMode(next as Mode)}
									aria-label="Session type"
									data-testid="home-mode-switch"
								>
									<ToggleGroupItem value="teach" data-testid="home-mode-teach">
										Teach
									</ToggleGroupItem>
									<ToggleGroupItem value="practice" data-testid="home-mode-practice">
										Practice
									</ToggleGroupItem>
								</ToggleGroup>
								{showPicker && (
									<NodePickerControl
										variant="proposed"
										count={picks.length}
										onOpen={openPicker}
										onClear={() => setPicks([])}
									/>
								)}
							</>
						}
					/>
				</div>
				<div className="mx-auto flex min-h-0 w-full max-w-[46rem] flex-1 flex-col gap-6 overflow-y-auto pt-4 pb-6">
					{(startError || courseChoice.notice || zeroKeys || !configured) && (
						<div className="flex flex-col items-start gap-2 px-4">
							{startError && <p role="alert" className="text-row text-danger">{startError}</p>}
							{courseChoice.notice && (
								<p role="alert" data-testid="course-notice" className="text-row text-danger">{courseChoice.notice}</p>
							)}
							{(zeroKeys || !configured) && (
								<Button
									variant="quiet"
									data-testid={zeroKeys ? "setup-cta-keys" : "setup-cta"}
									onClick={() => setSetupOpen(true)}
									className="-ml-3 h-8 px-3 text-row font-normal text-link hover:text-link"
								>
									{zeroKeys ? "Add a provider key to start" : "Set up your models to start"}
								</Button>
							)}
						</div>
					)}
					{state.status === "unavailable" && (
						<div className="px-4">
							<CoursesUnavailable reason={state.reason} variant="proposed" />
						</div>
					)}
					{today && state.status === "ready" && (
						<CourseChips
							courses={state.courses}
							disabled={busy}
							onStart={(chip) => startCourse(chip.workspace)}
							onNewCourse={() => setCreatingCourse(true)}
						/>
					)}
				</div>
				<ChainTableOverlay
					open={pickerOpen}
					nodes={snapshot?.propositions ?? []}
					chains={snapshot?.chains ?? []}
					sessions={snapshot?.sessions ?? {}}
					fileSources={snapshot?.fileSources ?? {}}
					onClose={() => setPickerOpen(false)}
					selectMode
					controlledSelection={new Set(picks.map((p) => p.id))}
					onSelectionChange={(ids) => {
						const byId = new Map((snapshot?.propositions ?? []).map((n) => [n.id, n]));
						const next: DraftPick[] = [];
						for (const id of ids) {
							const n = byId.get(id);
							if (n) next.push({ id: n.id, name: n.name, statement: n.statement });
						}
						setPicks(next);
					}}
				/>
			</main>
			<header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-3 py-2">
				<div className="pointer-events-auto">
					<SidebarToggle />
				</div>
			</header>
			{creatingCourse && state.status === "ready" && (
				<NewCourseDialog
					roots={state.roots}
					onClose={() => setCreatingCourse(false)}
					onCreated={(course) => {
						setCreatingCourse(false);
						courseChoice.add(course);
					}}
				/>
			)}
			<SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} onDone={() => setSetupOpen(false)} />
		</div>
	);
}
