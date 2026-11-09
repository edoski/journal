"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EllipsisIcon, WaypointsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { ModelControl, catalogLimits, useModelCatalog } from "@/components/model-picker";
import { sessionStatLabels } from "@/components/stats-bar";
import type { SessionPricing, TurnUsage } from "@/src/core";

/** The lesson's top bar contents (spec: lesson-top-bar.md), rendered inside
 *  the shared TopBar at its slim size: the title (the rename button or its
 *  input, owned by the session), the course as a quiet label, then on the
 *  right the phase, the plan toggle and the details menu. */
export function LessonTopBar({
	title,
	course,
	phase,
	onOpenPlan,
	details,
}: {
	title: ReactNode;
	course?: string;
	/** Sentence case: "Probing", "Planning", "Teaching", "Practice". */
	phase: string;
	/** Present once the session has a plan. */
	onOpenPlan?: () => void;
	details: ReactNode;
}) {
	return (
		<>
			<div className="flex min-w-0 flex-1 items-baseline gap-2">
				{title}
				{course && (
					<span data-testid="course-label" className="min-w-0 shrink-[2] truncate text-row text-muted-foreground">
						{course}
					</span>
				)}
			</div>
			<span data-testid="phase-chip" aria-hidden className="pointer-events-none shrink-0 select-none text-row text-muted-foreground">
				{phase}
			</span>
			{onOpenPlan && (
				<Hint label="Open the plan" side="bottom">
					<Button variant="quiet" size="sm" data-slot="plan-toggle" data-testid="plan-chip" onClick={onOpenPlan} className="h-8 gap-1.5 px-2 text-row font-normal">
						<WaypointsIcon />
						Plan
					</Button>
				</Hint>
			)}
			{details}
		</>
	);
}

/** The one place the agent's machinery lives in a lesson: the model and
 *  thinking level (the session's ModelControl), the context it has used,
 *  what it has cost, and, in teaching sessions, the extraction ring. The
 *  panel stays mounted while closed, so the model control keeps reporting
 *  the session's model to the send gate. */
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
	const rootRef = useRef<HTMLDivElement>(null);
	const { catalog } = useModelCatalog();
	const limit = useMemo(() => (catalog && selectedModel ? catalogLimits(catalog).get(selectedModel) ?? null : null), [catalog, selectedModel]);
	const { contextLabel, costLabel } = sessionStatLabels({ turns, contextTokens, pricing, limit });
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			const t = e.target as Element | null;
			if (!t || rootRef.current?.contains(t) || t.closest?.("[data-lh-menu]")) return;
			setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.stopPropagation();
			setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);
	return (
		<div ref={rootRef} className="relative shrink-0">
			<Hint label="Session details" side="bottom">
				<Button
					variant="quiet"
					size="icon-row"
					aria-label="Session details"
					aria-expanded={open}
					data-testid="session-details"
					onClick={() => setOpen((o) => !o)}
				>
					<EllipsisIcon />
				</Button>
			</Hint>
			<div
				hidden={!open}
				data-testid="session-details-panel"
				className="absolute right-0 top-full z-40 mt-1 w-[22rem] rounded-xl border bg-popover p-3 text-row shadow-lg"
			>
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
			</div>
		</div>
	);
}
