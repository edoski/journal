"use client";

import { createContext, useContext, type KeyboardEvent } from "react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { BookmarkIcon, CircleXIcon, HistoryIcon, type LucideIcon } from "lucide-react";
import type { CourseMapTopic, TopicHandle } from "@/src/core";
import { cn } from "@/lib/utils";
import { TopicGlyph } from "./topic-glyph";
import { CURRENT_TAG, type Standing, type Status } from "./topic-standing";
import { MathText } from "@/components/ui/math-text";

/** What the map hands each node: the topic, what the card says, and where
 *  a click goes. */
export type TopicFlowNode = Node<
	{
		topic: CourseMapTopic;
		current: boolean;
		standing: Standing;
		/** What the card says under its title in place of the standing. */
		status: Status | null;
		/** The topic's name for a screen reader, and its prerequisites by name. */
		label: string;
		needs: string | null;
		/** The topic's page. */
		href: string;
		layer: number;
	},
	"topic"
>;

/** What the nodes share: the lit chain, the one tab stop, and the map's handlers. */
export interface TopicMapState {
	/** The hovered or focused topic with its prerequisites, or null at rest. */
	lit: ReadonlySet<TopicHandle> | null;
	tabStop: TopicHandle | null;
	onActive: (handle: TopicHandle | null) => void;
	onFocus: (handle: TopicHandle) => void;
	onKeyDown: (handle: TopicHandle, event: KeyboardEvent<HTMLAnchorElement>) => void;
	register: (handle: TopicHandle, el: HTMLAnchorElement | null) => void;
}

export const TopicMapContext = createContext<TopicMapState | null>(null);

/** One icon per kind of need, the ones Today's rows and the sidebar use. */
const NEED_ICON: Record<Status["kind"], LucideIcon> = { slip: CircleXIcon, review: HistoryIcon, task: BookmarkIcon };

/** A status as Home's rows draw a reason: a 12px icon, then its words,
 *  on a caption line whose middle is the words' cap height. */
function StatusMark({ status }: { status: Status }) {
	const Icon = NEED_ICON[status.kind];
	return (
		<span data-slot="topic-need" data-kind={status.kind} className="flex h-3.5 min-w-0 items-center gap-1 text-caption text-muted-foreground">
			<Icon aria-hidden="true" className="size-3 shrink-0" />
			<span className="truncate">
				<MathText>{status.words}</MathText>
			</span>
		</span>
	);
}

/**
 * What a node holds (spec: topic-map.md, Node): Home's pie centred beside
 * two lines, as a hybrid row centres its pie beside its course and lesson.
 * The title on one 18px line, so a formula in it never makes the line
 * taller; under it, on its left edge, the status, or else where he stands
 * in words.
 */
export function NodeBody({ topic, standing, status }: { topic: CourseMapTopic; standing: Standing; status: Status | null }) {
	return (
		<span className="flex w-full min-w-0 items-center gap-4">
			<TopicGlyph standing={standing} />
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className={cn("block h-4.5 truncate text-row font-medium", topic.level !== "new" ? "text-foreground" : "text-muted-foreground")}>
					<MathText>{topic.title}</MathText>
				</span>
				{status ? (
					<StatusMark status={status} />
				) : (
					<span data-slot="topic-standing" className="block h-3.5 truncate text-caption text-muted-foreground">
						{standing.words}
					</span>
				)}
			</span>
		</span>
	);
}

/** The open's per-layer stagger, capped so the whole entrance ends under 300ms. */
const STAGGER_MS = 15;
const STAGGER_CAP_MS = 110;

/**
 * One topic on the map (spec: topic-map.md): one card, its pie beside its
 * title and one line under it. A link to the topic's page.
 */
export function TopicNode({ data }: NodeProps<TopicFlowNode>) {
	const state = useContext(TopicMapContext);
	const { topic, current, standing, status, label, needs, href, layer } = data;
	const dim = state?.lit ? !state.lit.has(topic.handle) : false;
	return (
		<div
			className={cn(
				"relative size-full transition-opacity duration-[120ms] motion-safe:animate-[lh-card-enter_180ms_cubic-bezier(0.19,1,0.22,1)_backwards] motion-reduce:transition-none",
				// Faded, yet its muted line still reads at 3.2:1 on the page (WCAG 1.4.3's floor for large text, 1.4.11's for marks).
				dim && "opacity-60",
			)}
			style={{ animationDelay: `${Math.min(layer * STAGGER_MS, STAGGER_CAP_MS)}ms` }}
		>
			{current && (
				<span data-slot="course-map-current-tag" className="absolute -top-5 left-0 text-caption font-medium text-foreground">
					{CURRENT_TAG}
				</span>
			)}
			<Link
				ref={(el) => state?.register(topic.handle, el)}
				href={href}
				draggable={false}
				data-slot="course-map-node"
				data-level={topic.level}
				data-current={current || undefined}
				data-testid={`map-node-${topic.handle}`}
				aria-label={label}
				aria-description={needs ?? undefined}
				aria-current={current ? "location" : undefined}
				tabIndex={state?.tabStop === topic.handle ? 0 : -1}
				onMouseEnter={() => state?.onActive(topic.handle)}
				onMouseLeave={() => state?.onActive(null)}
				onFocus={() => state?.onFocus(topic.handle)}
				onBlur={() => state?.onActive(null)}
				onKeyDown={(event) => state?.onKeyDown(topic.handle, event)}
				className={cn(
					"pointer-events-auto flex size-full cursor-pointer rounded-lg border outline-none transition-colors duration-150 motion-reduce:transition-none",
					"hover:border-white/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					"items-center border-border bg-card px-3",
					current && "border-ring shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_16%,transparent)] hover:border-ring",
				)}
			>
				<NodeBody topic={topic} standing={standing} status={status} />
			</Link>
			<Handle type="target" position={Position.Top} isConnectable={false} className="invisible" />
			<Handle type="source" position={Position.Bottom} isConnectable={false} className="invisible" />
		</div>
	);
}
