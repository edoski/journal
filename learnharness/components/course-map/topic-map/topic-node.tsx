"use client";

import { createContext, useContext, type KeyboardEvent } from "react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { CircleXIcon, HistoryIcon, type LucideIcon } from "lucide-react";
import type { CourseMapTopic, TopicHandle } from "@/src/core";
import { cn } from "@/lib/utils";
import { TopicGlyph } from "./topic-glyph";
import { CURRENT_TAG, type Need, type Standing } from "./topic-standing";

/** What the map hands each node: the topic, what the card says, and where
 *  a click goes. */
export type TopicFlowNode = Node<
	{
		topic: CourseMapTopic;
		current: boolean;
		standing: Standing;
		need: Need | null;
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
const NEED_ICON: Record<Need["kind"], LucideIcon> = { slip: CircleXIcon, review: HistoryIcon };

/** The open's per-layer stagger, capped so the whole entrance ends under 300ms. */
const STAGGER_MS = 15;
const STAGGER_CAP_MS = 110;

/**
 * One topic on the map (spec: topic-map.md): its pie, its title, and one
 * line only when it needs him. A link to the topic's page.
 */
export function TopicNode({ data }: NodeProps<TopicFlowNode>) {
	const state = useContext(TopicMapContext);
	const { topic, current, standing, need, label, needs, href, layer } = data;
	const started = topic.level !== "new";
	const dim = state?.lit ? !state.lit.has(topic.handle) : false;
	const NeedIcon = need ? NEED_ICON[need.kind] : null;
	return (
		<div
			className={cn(
				"relative size-full transition-opacity duration-[120ms] motion-safe:animate-[lh-card-enter_180ms_cubic-bezier(0.19,1,0.22,1)_backwards] motion-reduce:transition-none",
				dim && "opacity-35",
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
					"pointer-events-auto flex size-full cursor-pointer items-center rounded-lg border px-3 outline-none transition-colors duration-150 motion-reduce:transition-none",
					"hover:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
					started ? "border-border bg-card" : "border-white/6 bg-background",
					current && "border-ring shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_16%,transparent)] hover:border-ring",
				)}
			>
				<span className="flex min-w-0 items-start gap-2">
					<TopicGlyph standing={standing} className="mt-px" />
					<span className="flex min-w-0 flex-col gap-0.5">
						<span className={cn("line-clamp-2 text-row font-medium", started ? "text-foreground" : "text-muted-foreground")}>{topic.title}</span>
						{need && NeedIcon && (
							<span data-slot="topic-need" data-kind={need.kind} className="flex min-w-0 items-center gap-1 text-caption text-muted-foreground">
								<NeedIcon aria-hidden="true" className="size-3 shrink-0" />
								<span className="truncate">{need.words}</span>
							</span>
						)}
					</span>
				</span>
			</Link>
			<Handle type="target" position={Position.Top} isConnectable={false} className="invisible" />
			<Handle type="source" position={Position.Bottom} isConnectable={false} className="invisible" />
		</div>
	);
}
