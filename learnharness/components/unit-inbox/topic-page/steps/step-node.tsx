"use client";

import { useContext } from "react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { PlanNodeStatus, TopicHandle } from "@/src/core";
import { TopicMapContext } from "@/components/course-map/topic-map/topic-node";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/** What the steps map hands each node: the step, its mark, and the lesson a click opens. */
export type StepFlowNode = Node<
	{
		handle: TopicHandle;
		title: string;
		status: PlanNodeStatus;
		/** "Left off here" above the current step of a lesson that does not wait; null elsewhere. */
		tag: string | null;
		/** The step for a screen reader: its title, its tag, the lesson it opens. */
		label: string;
		/** "Rests on A, B"; null for a step that rests on none. */
		rests: string | null;
		/** The tutor's one or two sentences on the step, when written. */
		summary: string | null;
		/** The lesson's page. */
		href: string;
		layer: number;
	},
	"step"
>;

/** The lesson's Plan list's marks (components/lesson/plan-map.tsx) for
 *  what is known: the step it stopped on, and a step a question was asked
 *  on. Any other step keeps the dot's room and no mark, since nothing says
 *  whether it was taught. */
const DOT: Record<PlanNodeStatus, string> = {
	current: "bg-primary",
	visited: "bg-muted-foreground",
	upcoming: "",
};

/** The open's per-layer stagger, capped so the whole entrance ends under 300ms (the topic map's). */
const STAGGER_MS = 15;
const STAGGER_CAP_MS = 110;

/**
 * One step of a lesson's plan (spec: ../hybrid/hybrid.md, Lesson map): the Plan list's dot and
 * the step's title on the topic map's node. Every step has the same
 * surface, since nothing says which are done; the step the lesson stopped
 * on is ringed and tagged. A link to the lesson.
 */
export function StepNode({ data }: NodeProps<StepFlowNode>) {
	const state = useContext(TopicMapContext);
	const { handle, title, status, tag, label, rests, summary, href, layer } = data;
	const current = status === "current";
	const dim = state?.lit ? !state.lit.has(handle) : false;
	const link = (
		<Link
			ref={(el) => state?.register(handle, el)}
			href={href}
			draggable={false}
			data-slot="topic-step"
			data-status={status}
			aria-label={label}
			aria-description={rests ?? undefined}
			aria-current={current ? "step" : undefined}
			tabIndex={state?.tabStop === handle ? 0 : -1}
			onMouseEnter={() => state?.onActive(handle)}
			onMouseLeave={() => state?.onActive(null)}
			onFocus={() => state?.onFocus(handle)}
			onBlur={() => state?.onActive(null)}
			onKeyDown={(event) => state?.onKeyDown(handle, event)}
			className={cn(
				"pointer-events-auto flex size-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 outline-none transition-colors duration-150 motion-reduce:transition-none",
				"hover:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
				current && "border-ring shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_16%,transparent)] hover:border-ring",
				// Linked columns: the step answers its tied row being pointed at.
				current && "in-data-[lit]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--ring)_36%,transparent)]",
			)}
		>
			<span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[status])} />
			<span className="line-clamp-2 min-w-0 text-row font-medium text-foreground">
				<MathText>{title}</MathText>
			</span>
		</Link>
	);
	return (
		<div
			className={cn(
				"relative size-full transition-opacity duration-[120ms] motion-safe:animate-[lh-card-enter_180ms_cubic-bezier(0.19,1,0.22,1)_backwards] motion-reduce:transition-none",
				dim && "opacity-35",
			)}
			style={{ animationDelay: `${Math.min(layer * STAGGER_MS, STAGGER_CAP_MS)}ms` }}
		>
			{tag && (
				<span data-slot="topic-step-tag" aria-hidden className="absolute -top-5 left-0 text-caption font-medium text-foreground">
					{tag}
				</span>
			)}
			{summary ? <Hint label={summary}>{link}</Hint> : link}
			<Handle type="target" position={Position.Top} isConnectable={false} className="invisible" />
			<Handle type="source" position={Position.Bottom} isConnectable={false} className="invisible" />
		</div>
	);
}
