"use client";

import { useMemo } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { derivedNodeStatus, derivePlanStatuses, type PlanBlockData, type PlanNodeStatus } from "@/src/core";
import { latestTree, topoFor, type LayoutNode, type PopupMessage } from "@/components/lesson/plan-facts";
import { Button } from "@/components/ui/button";
import { LessonCard } from "@/components/lesson/lesson-card";
import { MathText } from "@/components/ui/math-text";

export interface PlanMapStep {
	id: string;
	title: string;
	status: PlanNodeStatus;
	/** The first step after the current one (or the first step, before any). */
	next: boolean;
}

/** The plan as the learner reads it: its steps in teaching order (each
 *  after everything it rests on), with where they are and what comes
 *  next. Pure, for the map and its tests. */
export function planMapSteps(
	nodes: readonly LayoutNode[],
	edges: ReadonlyArray<{ from: string; to: string }>,
	statusOf: (id: string) => PlanNodeStatus,
): PlanMapStep[] {
	const steps = topoFor(nodes, edges).order.map((n) => ({ id: n.id, title: n.title, status: statusOf(n.id), next: false }));
	const current = steps.findIndex((s) => s.status === "current");
	const next = steps.findIndex((s, i) => i > current && s.status === "upcoming");
	if (next >= 0) steps[next]!.next = true;
	return steps;
}

/** The calm plan map (spec: plan-map.md): one line per step, a small
 *  marker for visited, current and upcoming, "Now" and "Next" as quiet
 *  words; a lesson nobody is in names its current step by `currentWord`.
 *  No diagram, no node numbers. */
export function PlanMap({ steps, currentWord = "Now" }: { steps: readonly PlanMapStep[]; currentWord?: string }) {
	return (
		<ol data-slot="plan-map" className="flex flex-col">
			{steps.map((s) => (
				<li key={s.id} data-testid={`plan-step-${s.id}`} data-status={s.status} className="flex h-7 items-center gap-3 text-row">
					<span
						aria-hidden
						className={cn(
							"size-2 shrink-0 rounded-full",
							s.status === "current" ? "bg-primary" : s.status === "visited" ? "bg-muted-foreground" : "ring-1 ring-inset ring-muted-foreground",
						)}
					/>
					<span className={cn("min-w-0 flex-1 truncate", s.status === "current" ? "text-foreground" : "text-muted-foreground")}><MathText>{s.title}</MathText></span>
					{s.status === "current" && <span className="shrink-0 text-muted-foreground">{currentWord}</span>}
					{s.next && <span className="shrink-0 text-muted-foreground">Next</span>}
				</li>
			))}
		</ol>
	);
}

/** The plan panel's body, inside the top bar's plan popover: the live map
 *  (statuses derived from the transcript's checks, the popup's rule) under
 *  a title and a close button. */
export function PlanPanel({ messages, onClose }: { messages: readonly PopupMessage[]; onClose: () => void }) {
	const tree = useMemo(() => latestTree(messages), [messages]);
	const steps = useMemo(() => {
		if (!tree) return [];
		const statuses = derivePlanStatuses(tree, messages as Parameters<typeof derivePlanStatuses>[1]);
		return planMapSteps(tree.nodes, tree.edges, (id) => derivedNodeStatus(statuses, id));
	}, [tree, messages]);
	return (
		<>
			<div className="flex h-8 items-center justify-between pl-2">
				<span className="text-row font-medium">Plan</span>
				<Button variant="quiet" size="icon-row" aria-label="Close the plan" onClick={onClose}>
					<XIcon />
				</Button>
			</div>
			<div className="px-2 pb-1">
				<PlanMap steps={steps} />
			</div>
		</>
	);
}

/** The plan as the transcript carried it (a frozen snapshot, never
 *  re-derived): a card with the step count and the map; it opens the
 *  live panel. */
export function PlanCard({ data, onOpen }: { data: PlanBlockData; onOpen: () => void }) {
	const steps = useMemo(() => {
		const status = new Map(data.nodes.map((n) => [n.id, n.status] as const));
		return planMapSteps(data.nodes, data.edges, (id) => status.get(id) ?? "upcoming");
	}, [data]);
	return (
		<Button
			variant="quiet"
			data-testid="plan-block-full"
			aria-label="Open the plan"
			onClick={onOpen}
			className="block h-auto w-full whitespace-normal rounded-xl p-0 text-left text-[length:inherit] font-normal text-inherit hover:bg-transparent hover:text-inherit"
		>
			<LessonCard label="Plan" note={`${steps.length} step${steps.length === 1 ? "" : "s"}`}>
				<PlanMap steps={steps} />
			</LessonCard>
		</Button>
	);
}
