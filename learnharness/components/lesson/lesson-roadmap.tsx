"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BookOpenIcon, MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MathText } from "@/components/ui/math-text";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { courseHref, unitHref } from "@/components/unit-inbox/unit-href";
import { kbdEventForAction, type LessonPlace } from "@/src/core";
import { roadmapLabel, type RoadmapStep } from "@/components/lesson/roadmap-facts";

/** A step's dot in the strip: where he is is a short primary bar, steps
 *  behind him a filled dot, steps ahead a faint one. */
function stripDot(step: RoadmapStep): string {
	if (step.status === "current") return "h-1.5 w-3 bg-primary";
	return step.status === "visited" ? "size-1.5 bg-muted-foreground" : "size-1.5 bg-muted-foreground/35";
}

/** The panel's marker: the plan list's 8px circle (the topic page's
 *  step map wears the same). */
function rowDot(step: RoadmapStep): string {
	if (step.status === "current") return "bg-primary";
	return step.status === "visited" ? "bg-muted-foreground" : "ring-1 ring-inset ring-muted-foreground";
}

/** The trailing word on a step's row, literal: where he is, what comes
 *  next, what the tutor marked done. */
function rowWord(step: RoadmapStep): string | null {
	if (step.status === "current") return "Now";
	if (step.next) return "Next";
	return step.done ? "Done" : null;
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
	if (label === null) return null;
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<Hint label="Where this lesson is" action="open-model-picker" side="bottom">
				<PopoverTrigger asChild>
					<Button
						variant="quiet"
						size="row"
						data-slot="lesson-roadmap-trigger"
						data-testid="roadmap"
						aria-label={`Where this lesson is: ${label}`}
						className="min-w-0 max-w-[22rem] shrink gap-2.5 font-normal"
					>
						<span data-slot="roadmap-strip" aria-hidden className="flex shrink-0 items-center gap-1">
							{steps.map((s) => (
								<span key={s.id} data-status={s.status} className={cn("shrink-0 rounded-full", stripDot(s))} />
							))}
						</span>
						<span className="min-w-0 truncate">
							<MathText>{label}</MathText>
						</span>
					</Button>
				</PopoverTrigger>
			</Hint>
			<PopoverContent align="end" aria-label="Where this lesson is" data-testid="roadmap-panel" className="w-80 p-1">
				<ol data-slot="roadmap-steps" className="flex flex-col">
					{steps.map((s) => {
						const word = rowWord(s);
						const inner = (
							<>
								<span aria-hidden className={cn("size-2 shrink-0 rounded-full", rowDot(s))} />
								<span className={cn("min-w-0 flex-1 truncate", s.status === "current" ? "text-foreground" : "text-muted-foreground")}>
									<MathText>{s.title}</MathText>
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
										onClick={() => {
											onOpenChange(false);
											onJump(s.id);
										}}
										className="flex h-8 w-full items-center gap-3 rounded-md px-2 text-left text-row outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
									>
										{inner}
									</button>
								) : (
									<div data-slot="roadmap-step" className="flex h-8 items-center gap-3 rounded-md px-2 text-row">
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
						{place?.topic && (
							<Link href={unitHref(course.workspace, place.topic.handle)} data-slot="roadmap-link" data-testid="roadmap-topic" className={LINK_ROW}>
								<BookOpenIcon aria-hidden className="size-4 shrink-0" />
								<span className="min-w-0 flex-1 truncate">
									<MathText>{place.topic.title}</MathText>
								</span>
							</Link>
						)}
						<Link href={courseHref(course.workspace)} data-slot="roadmap-link" data-testid="roadmap-course" className={LINK_ROW}>
							<MapIcon aria-hidden className="size-4 shrink-0" />
							<span className="min-w-0 flex-1 truncate">Course map</span>
							{place?.arc && (
								<span data-slot="arc-pill" className="max-w-32 shrink-0 truncate rounded-full bg-fill-hover px-2 py-0.5 text-label text-muted-foreground">
									{place.arc.title}
								</span>
							)}
						</Link>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}

const LINK_ROW =
	"flex h-8 items-center gap-3 rounded-md px-2 text-row text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";
