"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon, EllipsisIcon, WaypointsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useModelStatus } from "@/components/model-status";
import { sessionStatLabels } from "@/components/usage-format";
import { CLAUDE_MODEL, kbdEventForAction, type SessionPricing, type TurnUsage } from "@/src/core";

/** The lesson's top bar contents (spec: lesson-top-bar.md), rendered inside
 *  the shared TopBar at its slim size: the course and the title as one
 *  breadcrumb (the title is the rename button or its input, owned by the
 *  session), then on the right the phase, the plan toggle and the details
 *  menu. */
export function LessonTopBar({
	title,
	course,
	courseHref,
	phase,
	plan,
	tonight,
	details,
}: {
	title: ReactNode;
	course?: string;
	/** The course's page, which the crumb links to. */
	courseHref?: string;
	/** Sentence case: "Probing", "Planning", "Teaching", "Practice". */
	phase: string;
	/** Present once the session has a plan: the toggle opens it as a popover. */
	plan?: { open: boolean; onOpenChange: (open: boolean) => void; body: ReactNode };
	/** Done for tonight (done-tonight.tsx): stop now, whatever is open. */
	tonight?: ReactNode;
	details: ReactNode;
}) {
	const linked = courseHref !== undefined;
	return (
		<>
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				{course && (
					<>
						{linked ? (
							<Link
								href={courseHref}
								data-testid="course-label"
								className="lh-no-drag min-w-0 max-w-40 shrink-[2] truncate rounded-sm text-control text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
							>
								{course}
							</Link>
						) : (
							<span data-testid="course-label" className="min-w-0 max-w-40 shrink-[2] truncate text-control text-muted-foreground">
								{course}
							</span>
						)}
						<ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
					</>
				)}
				{title}
			</div>
			<span data-testid="phase-chip" aria-hidden className="pointer-events-none shrink-0 select-none text-row text-muted-foreground">
				{phase}
			</span>
			{tonight}
			{plan && (
				<Popover open={plan.open} onOpenChange={plan.onOpenChange}>
					<Hint label="Open the plan" side="bottom">
						<PopoverTrigger asChild>
							<Button variant="quiet" size="row" data-slot="plan-toggle" data-testid="plan-chip" className="font-normal">
								<WaypointsIcon />
								Plan
							</Button>
						</PopoverTrigger>
					</Hint>
					<PopoverContent align="end" aria-label="Plan" data-testid="plan-panel" className="w-80 p-2">
						{plan.body}
					</PopoverContent>
				</Popover>
			)}
			{details}
		</>
	);
}

/** The one place the agent's machinery lives in a lesson: the model every
 *  agent runs (CLAUDE_MODEL, no choice), the context it has used and what
 *  it has cost. ⌘K opens it. */
export function LessonDetails({
	turns,
	contextTokens,
	pricing,
}: {
	turns: TurnUsage[];
	contextTokens: number | null;
	pricing?: SessionPricing;
}) {
	const [open, setOpen] = useState(false);
	const limit = useModelStatus().status?.contextWindow ?? null;
	const { contextLabel, costLabel } = sessionStatLabels({ turns, contextTokens, pricing, limit });
	useEffect(() => {
		const onOpen = () => setOpen(true);
		window.addEventListener(kbdEventForAction("open-model-picker"), onOpen);
		return () => window.removeEventListener(kbdEventForAction("open-model-picker"), onOpen);
	}, []);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Hint label="Session details" side="bottom">
				<PopoverTrigger asChild>
					<Button variant="quiet" size="icon-row" aria-label="Session details" data-testid="session-details" className="shrink-0">
						<EllipsisIcon />
					</Button>
				</PopoverTrigger>
			</Hint>
			<PopoverContent forceMount hidden={!open} align="end" data-testid="session-details-panel" className="w-[22rem] p-3">
				<dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 [&_dt]:whitespace-nowrap">
					<dt className="text-muted-foreground">Model</dt>
					<dd data-testid="stats-model" className="text-right">{CLAUDE_MODEL.name}</dd>
					<dt className="text-muted-foreground">Context</dt>
					<dd data-testid="stats-context" className="text-right tabular-nums">{contextLabel}</dd>
					<dt className="text-muted-foreground">Cost</dt>
					<dd data-testid="stats-cost" className="text-right tabular-nums">{costLabel}</dd>
				</dl>
			</PopoverContent>
		</Popover>
	);
}
