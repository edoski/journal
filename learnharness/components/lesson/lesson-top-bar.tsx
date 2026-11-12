"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRightIcon, EllipsisIcon, WaypointsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ModelControl, catalogLimits, useModelCatalog } from "@/components/model-picker";
import { sessionStatLabels } from "@/components/stats-bar";
import type { SessionPricing, TurnUsage } from "@/src/core";

/** The lesson's top bar contents (spec: lesson-top-bar.md), rendered inside
 *  the shared TopBar at its slim size: the course and the title as one
 *  breadcrumb (the title is the rename button or its input, owned by the
 *  session), then on the right the phase, the plan toggle and the details
 *  menu. */
export function LessonTopBar({
	title,
	course,
	phase,
	plan,
	details,
}: {
	title: ReactNode;
	course?: string;
	/** Sentence case: "Probing", "Planning", "Teaching", "Practice". */
	phase: string;
	/** Present once the session has a plan: the toggle opens it as a popover. */
	plan?: { open: boolean; onOpenChange: (open: boolean) => void; body: ReactNode };
	details: ReactNode;
}) {
	return (
		<>
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				{course && (
					<>
						<span data-testid="course-label" className="min-w-0 max-w-40 shrink-[2] truncate text-control text-muted-foreground">
							{course}
						</span>
						<ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
					</>
				)}
				{title}
			</div>
			<span data-testid="phase-chip" aria-hidden className="pointer-events-none shrink-0 select-none text-row text-muted-foreground">
				{phase}
			</span>
			{plan && (
				<Popover open={plan.open} onOpenChange={plan.onOpenChange}>
					<Hint label="Open the plan" side="bottom">
						<PopoverTrigger asChild>
							<Button variant="quiet" size="sm" data-slot="plan-toggle" data-testid="plan-chip" className="h-8 gap-1.5 px-2 text-row font-normal">
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

/** The one place the agent's machinery lives in a lesson: the model and
 *  thinking level (the session's ModelControl), the context it has used,
 *  what it has cost, and, in teaching sessions, the extraction ring. The
 *  panel stays mounted while closed, so the model control keeps reporting
 *  the session's model to the send gate; ⌘K opens it with the model picker. */
export function LessonDetails({
	chatId,
	turns,
	contextTokens,
	pricing,
	selectedModel,
	onModelChange,
	extraction,
}: {
	chatId: string;
	turns: TurnUsage[];
	contextTokens: number | null;
	pricing?: SessionPricing;
	selectedModel?: string;
	onModelChange: (model: string | undefined) => void;
	/** The coverage ring (teaching sessions). */
	extraction?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const { catalog } = useModelCatalog();
	const limit = useMemo(() => (catalog && selectedModel ? catalogLimits(catalog).get(selectedModel) ?? null : null), [catalog, selectedModel]);
	const { contextLabel, costLabel } = sessionStatLabels({ turns, contextTokens, pricing, limit });
	useEffect(() => {
		const onOpenPicker = () => setOpen(true);
		window.addEventListener("lh:kbd-open-model-picker", onOpenPicker);
		return () => window.removeEventListener("lh:kbd-open-model-picker", onOpenPicker);
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
					<dd className="flex justify-end whitespace-nowrap">
						<ModelControl chatId={chatId} onModelChange={onModelChange} variant="proposed" />
					</dd>
					<dt className="text-muted-foreground">Context</dt>
					<dd data-testid="stats-context" className="text-right tabular-nums">{contextLabel}</dd>
					<dt className="text-muted-foreground">Cost</dt>
					<dd data-testid="stats-cost" className="text-right tabular-nums">{costLabel}</dd>
					{extraction && (
						<>
							<dt className="text-muted-foreground">Notes extracted</dt>
							<dd className="flex justify-end">{extraction}</dd>
						</>
					)}
				</dl>
			</PopoverContent>
		</Popover>
	);
}
