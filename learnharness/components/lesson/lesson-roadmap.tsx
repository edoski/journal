"use client";

import { useEffect, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { BookOpenIcon, MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArcLabel } from "@/components/course-map/arc-label";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MathText, mathPlain } from "@/components/ui/math-text";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { focusWhereHeTypes } from "@/components/ui/overlay";
import { courseHref, unitHref } from "@/components/unit-inbox/unit-href";
import { kbdEventForAction, type LessonPlace } from "@/src/core";
import { roadmapLabel, type RoadmapStep } from "@/components/lesson/roadmap-facts";

/** The panel's words for a step whose title waits on his prediction. */
export const HELD_TITLE = "Your prediction first";

/** A step behind him: one he reached, or one before Now he never did. */
const behind = (step: RoadmapStep) => step.status === "visited" || step.status === "passed";

/** A step's dot in the strip: where he is is a short primary bar, steps
 *  behind him a filled dot, steps ahead a faint one. */
export function stripDot(step: RoadmapStep): string {
	if (step.status === "current") return "h-1.5 w-3 bg-primary";
	return behind(step) ? "size-1.5 bg-muted-foreground" : "size-1.5 bg-muted-foreground/35";
}

/** The panel's marker: the plan list's 8px circle (the topic page's
 *  step map wears the same), centred in the 16px slot the links' icons
 *  take, so steps and links share one column. */
export function rowDot(step: RoadmapStep): string {
	if (step.status === "current") return "bg-primary";
	return behind(step) ? "bg-muted-foreground" : "ring-1 ring-inset ring-muted-foreground";
}

/** The trailing word on a step's row, literal: where he is, what comes
 *  next, what the tutor marked done. */
export function rowWord(step: RoadmapStep): string | null {
	if (step.status === "current") return "Now";
	if (step.next) return "Next";
	return step.done ? "Done" : null;
}

/** The panel's stops, in order: the taught steps, then the topic's page
 *  and the course map. */
const STOPS = '[data-slot="roadmap-step"]:is(button), [data-slot="roadmap-link"]';

/** Tab is dead, so the panel takes its own arrows (the page's arrows leave
 *  an open popover alone): ↑ ↓ move between its stops, Home and End go to
 *  its ends, Enter opens one. */
function walkStops(e: KeyboardEvent<HTMLElement>) {
	const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "Home" ? -Infinity : e.key === "End" ? Infinity : 0;
	if (step === 0) return;
	const stops = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(STOPS));
	if (stops.length === 0) return;
	e.preventDefault();
	const at = stops.indexOf(document.activeElement as HTMLElement);
	const next = Number.isFinite(step) ? Math.min(stops.length - 1, Math.max(0, (at < 0 ? -1 : at) + step)) : step < 0 ? 0 : stops.length - 1;
	stops[next]?.focus();
}

/**
 * Where this lesson is (spec: lesson-roadmap.md), in the top bar: a strip
 * of the plan's steps and the one he is on. A click (or ⌘K) opens the
 * steps, each one taught opening the transcript where it was taught, and
 * the way up: the topic's page, and the course map with the topic's arc.
 */
export function LessonRoadmap({
	steps,
	place,
	course,
	open,
	onOpenChange,
	onJump,
}: {
	steps: readonly RoadmapStep[];
	place?: LessonPlace;
	course?: { title: string; workspace: string };
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Opens the transcript where the step was first taught. */
	onJump: (stepId: string) => void;
}) {
	useEffect(() => {
		const onOpen = () => onOpenChange(true);
		window.addEventListener(kbdEventForAction("open-model-picker"), onOpen);
		return () => window.removeEventListener(kbdEventForAction("open-model-picker"), onOpen);
	}, [onOpenChange]);
	const label = roadmapLabel(steps);
	// A lesson with no plan (practice) draws no strip, but ⌘K still opens
	// the way up from where the strip would be (round 7: ⌘K did nothing).
	if (label === null) {
		if (!course) return null;
		return (
			<Popover open={open} onOpenChange={onOpenChange}>
				<PopoverAnchor asChild>
					<span aria-hidden data-slot="roadmap-anchor" className="h-8 w-0 shrink-0" />
				</PopoverAnchor>
				<RoadmapPanel>
					<RoadmapLinks place={place} course={course} />
				</RoadmapPanel>
			</Popover>
		);
	}
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<Hint label="Where this lesson is" action="open-model-picker" side="bottom">
				<PopoverTrigger asChild>
					<Button
						variant="quiet"
						size="row"
						data-slot="lesson-roadmap-trigger"
						data-testid="roadmap"
						aria-label={label ? `Where this lesson is: ${mathPlain(label)}` : "Where this lesson is"}
						className="min-w-0 shrink gap-2.5 font-normal"
					>
						<span data-slot="roadmap-strip" aria-hidden className="flex shrink-0 items-center gap-1">
							{steps.map((s) => (
								<span key={s.id} data-status={s.status} className={cn("shrink-0 rounded-full", stripDot(s))} />
							))}
						</span>
						{label && (
							<span className="min-w-0 truncate">
								<MathText>{label}</MathText>
							</span>
						)}
					</Button>
				</PopoverTrigger>
			</Hint>
			<RoadmapPanel>
				<ol data-slot="roadmap-steps" className="flex flex-col">
					{steps.map((s) => {
						const word = rowWord(s);
						const inner = (
							<>
								<span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
									<span className={cn("size-2 rounded-full", rowDot(s))} />
								</span>
								<span className={cn("min-w-0 flex-1 break-words", s.status === "current" && !s.held ? "text-foreground" : "text-muted-foreground")}>
									{s.held ? HELD_TITLE : <MathText>{s.title}</MathText>}
								</span>
								{word && <span className="shrink-0 text-muted-foreground">{word}</span>}
							</>
						);
						return (
							<li key={s.id} data-testid={`roadmap-step-${s.id}`} data-status={s.status} data-done={s.done || undefined}>
								{s.taught ? (
									<button
										type="button"
										data-slot="roadmap-step"
										data-status={s.status}
										onClick={() => {
											onOpenChange(false);
											onJump(s.id);
										}}
										className="flex min-h-8 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-body outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
									>
										{inner}
									</button>
								) : (
									<div data-slot="roadmap-step" data-status={s.status} className="flex min-h-8 items-center gap-3 rounded-md px-2 py-1.5 text-body">
										{inner}
									</div>
								)}
							</li>
						);
					})}
				</ol>
				{course && (
					<>
						<div role="separator" className="mx-2 my-1 h-px bg-border" />
						<RoadmapLinks place={place} course={course} />
					</>
				)}
			</RoadmapPanel>
		</Popover>
	);
}

/** The panel: its own arrows, and focus back where he types once it closes. */
function RoadmapPanel({ children }: { children: ReactNode }) {
	return (
		<PopoverContent
			align="end"
			aria-label="Where this lesson is"
			data-testid="roadmap-panel"
			className="p-1"
			onKeyDown={walkStops}
			// Opens on Now (round 8: ⌘K opened on the first done step): the
			// step he is on, else the last one taught before it.
			onOpenAutoFocus={(e) => {
				const panel = e.currentTarget as HTMLElement | null;
				const steps = Array.from(panel?.querySelectorAll<HTMLElement>('[data-slot="roadmap-step"]') ?? []);
				const now = steps.findIndex((step) => step.dataset.status === "current");
				const target = steps.slice(0, now < 0 ? steps.length : now + 1).reverse().find((step) => step.tagName === "BUTTON");
				if (!target) return;
				e.preventDefault();
				target.focus();
			}}
			// Closed by Esc, a jump or a link: his next key goes to the
			// box he answers in, not back to the strip.
			onCloseAutoFocus={(e) => {
				e.preventDefault();
				focusWhereHeTypes(document, false);
			}}
		>
			{children}
		</PopoverContent>
	);
}

/** The way up: the topic's page and the course map with the topic's arc. */
function RoadmapLinks({ place, course }: { place?: LessonPlace; course: { title: string; workspace: string } }) {
	return (
		<>
			{place?.topic && (
				<Link href={unitHref(course.workspace, place.topic.handle)} data-slot="roadmap-link" data-testid="roadmap-topic" className={LINK_ROW}>
					<BookOpenIcon aria-hidden className="size-4 shrink-0" />
					<span className="min-w-0 flex-1 truncate">
						<MathText>{place.topic.title}</MathText>
					</span>
				</Link>
			)}
			{/* The arc on a line of its own, whole: beside "Course map" it was cut, its number left bare (round 15, 4 free). */}
			<Link href={courseHref(course.workspace)} data-slot="roadmap-link" data-testid="roadmap-course" className={cn(LINK_ROW, "group/arc", place?.arc && "h-auto items-start py-1.5")}>
				<MapIcon aria-hidden className={cn("size-4 shrink-0", place?.arc && "mt-0.5")} />
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="truncate">Course map</span>
					{place?.arc && <ArcLabel {...place.arc} />}
				</span>
			</Link>
		</>
	);
}

const LINK_ROW =
	"flex h-8 items-center gap-3 rounded-md px-2 text-body text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
