"use client";

import { createContext, useContext, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { BookmarkIcon, CircleXIcon, HistoryIcon, type LucideIcon } from "lucide-react";
import type { CourseMapTopic, TopicHandle } from "@/src/core";
import { useNodeVariant, type NodeVariant } from "@/components/design-variant";
import { cn } from "@/lib/utils";
import { TopicEdge, TopicGlyph, TopicRing } from "./topic-glyph";
import { CURRENT_TAG, type Need, type Standing, type Status } from "./topic-standing";
import { MathText } from "@/components/ui/math-text";

/** What the map hands each node: the topic, what the card says, and where
 *  a click goes. */
export type TopicFlowNode = Node<
	{
		topic: CourseMapTopic;
		current: boolean;
		standing: Standing;
		need: Need | null;
		/** What a candidate node says beyond the standing (Node switch). */
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

/** Each candidate's box around its body: the node as it was keeps its
 *  two surfaces; every candidate is one card for every topic. The header
 *  sits a pixel low, so its caption's cap height and the title's baseline
 *  are as far from the card's edges; the edge centres its line above its
 *  bar and clips the bar to the corners. */
const BOX: Record<NodeVariant, (started: boolean) => string> = {
	current: (started) => cn("items-center px-3", started ? "border-border bg-card" : "border-white/6 bg-background"),
	header: () => "items-center border-border bg-card px-3 pt-px",
	ring: () => "items-center border-border bg-card px-3",
	edge: () => "relative items-center overflow-hidden border-border bg-card px-3 pb-[3px]",
};

/** A topic's title on one line, muted for a topic not started. */
function Title({ topic, className }: { topic: CourseMapTopic; className?: string }) {
	return (
		<span className={cn("truncate text-row font-medium", topic.level !== "new" ? "text-foreground" : "text-muted-foreground", className)}>
			<MathText>{topic.title}</MathText>
		</span>
	);
}

/** A status as Home's rows draw a reason: a 12px icon, then a few words,
 *  on a caption line whose middle is the words' cap height. */
function StatusMark({ status, short = false, className }: { status: Status; short?: boolean; className?: string }) {
	const Icon = NEED_ICON[status.kind];
	return (
		<span data-slot="topic-need" data-kind={status.kind} className={cn("flex h-3.5 min-w-0 items-center gap-1 text-caption text-muted-foreground", className)}>
			<Icon aria-hidden="true" className="size-3 shrink-0" />
			<span className="truncate">
				<MathText>{short ? status.short : status.words}</MathText>
			</span>
		</span>
	);
}

/** A candidate's title: one 18px line, so a formula in it never makes
 *  the line taller and moves the line beside it. */
function CardTitle({ topic }: { topic: CourseMapTopic }) {
	return <Title topic={topic} className="block h-4.5" />;
}

interface BodyProps {
	topic: CourseMapTopic;
	standing: Standing;
	need: Need | null;
	status: Status | null;
}

/** As the topic map first drew it: a pie by a title of one line, the need
 *  under the title when there is one. */
function CurrentBody({ topic, standing, need }: BodyProps) {
	const NeedIcon = need ? NEED_ICON[need.kind] : null;
	return (
		<span className="flex min-w-0 items-start gap-2">
			<TopicGlyph standing={standing} className="mt-px" />
			<span className="flex min-w-0 flex-col gap-0.5">
				<Title topic={topic} />
				{need && NeedIcon && (
					<span data-slot="topic-need" data-kind={need.kind} className="flex min-w-0 items-center gap-1 text-caption text-muted-foreground">
						<NeedIcon aria-hidden="true" className="size-3 shrink-0" />
						<span className="truncate">
							<MathText>{need.short}</MathText>
						</span>
					</span>
				)}
			</span>
		</span>
	);
}

/** `header`: where he stands on top, as the sidebar puts the course over
 *  a lesson: a 12px pie and the standing in words, the status flush right
 *  in Home's few words; the title under them on the pie's left edge. */
function HeaderBody({ topic, standing, status }: BodyProps) {
	return (
		<span className="flex w-full min-w-0 flex-col gap-1">
			<span className="flex h-3.5 min-w-0 items-center gap-3">
				<span data-slot="topic-standing" className="flex min-w-0 flex-1 items-center gap-1 text-caption text-muted-foreground">
					<TopicGlyph standing={standing} className="size-3" />
					<span className="truncate">{standing.words}</span>
				</span>
				{status && <StatusMark status={status} short className="shrink-0" />}
			</span>
			<CardTitle topic={topic} />
		</span>
	);
}

/** `ring`: a 28px ring beside the title, centred on the card; under the
 *  title, on its left edge, the status in full words or else the standing
 *  in words. */
function RingBody({ topic, standing, status }: BodyProps) {
	return (
		<span className="flex w-full min-w-0 items-center gap-3">
			<TopicRing standing={standing} />
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<CardTitle topic={topic} />
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

/** `edge`: one line, the title and the status flush right in Home's few
 *  words, and the card's bottom edge filling as he learns. */
function EdgeBody({ topic, standing, status }: BodyProps) {
	return (
		<>
			<span className="flex w-full min-w-0 items-center gap-3">
				<span className="min-w-0 flex-1">
					<CardTitle topic={topic} />
				</span>
				{status && <StatusMark status={status} short className="max-w-1/2 shrink-0" />}
			</span>
			<TopicEdge standing={standing} />
		</>
	);
}

/** What a node holds, by the Node switch (spec: topic-map.md, "Node switch"). */
const BODY: Record<NodeVariant, (props: BodyProps) => ReactNode> = { current: CurrentBody, header: HeaderBody, ring: RingBody, edge: EdgeBody };

export function NodeBody({ variant, ...props }: BodyProps & { variant: NodeVariant }) {
	const Body = BODY[variant];
	return <Body {...props} />;
}

/** The open's per-layer stagger, capped so the whole entrance ends under 300ms. */
const STAGGER_MS = 15;
const STAGGER_CAP_MS = 110;

/**
 * One topic on the map (spec: topic-map.md): its pie, its title, and one
 * line only when it needs him. A link to the topic's page.
 */
export function TopicNode({ data }: NodeProps<TopicFlowNode>) {
	const state = useContext(TopicMapContext);
	const variant = useNodeVariant();
	const { topic, current, standing, need, status, label, needs, href, layer } = data;
	const started = topic.level !== "new";
	const dim = state?.lit ? !state.lit.has(topic.handle) : false;
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
					"pointer-events-auto flex size-full cursor-pointer rounded-lg border outline-none transition-colors duration-150 motion-reduce:transition-none",
					"hover:border-white/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					BOX[variant](started),
					current && "border-ring shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_16%,transparent)] hover:border-ring",
				)}
			>
				<NodeBody variant={variant} topic={topic} standing={standing} need={need} status={status} />
			</Link>
			<Handle type="target" position={Position.Top} isConnectable={false} className="invisible" />
			<Handle type="source" position={Position.Bottom} isConnectable={false} className="invisible" />
		</div>
	);
}
