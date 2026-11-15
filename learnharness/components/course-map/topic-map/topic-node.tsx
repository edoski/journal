"use client";

import { createContext, useContext, type KeyboardEvent } from "react";
import { CornerLeftUpIcon } from "lucide-react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { CourseMapTopic, TopicHandle } from "@/src/core";
import { cn } from "@/lib/utils";
import { TopicGlyph } from "./topic-glyph";
import { CURRENT_TAG, type CardFact, type Standing } from "./topic-standing";
import { entryCaption } from "./arc-view";
import { BrailleSpinner } from "@/components/braille-spinner";
import { factIcon } from "@/components/unit-inbox/fact-icon";
import { MathText } from "@/components/ui/math-text";
import { MathLine } from "@/components/ui/math-line";

/** What the map hands each node: the topic, what the card says, and where
 *  a click goes. */
export type TopicFlowNode = Node<
	{
		topic: CourseMapTopic;
		current: boolean;
		standing: Standing;
		/** What the card says under its title in place of the standing (`cardLine`). */
		line: CardFact | null;
		/** The topic's name for a screen reader, and its prerequisites by name. */
		label: string;
		needs: string | null;
		/** The topic's page. */
		href: string;
		/** An arc's entry topic: the earlier arc it comes from, its card
		 *  faded and captioned with that arc ("From Vector spaces"). */
		from: string | null;
	},
	"topic"
>;

/** What the nodes share: the lit chain, the one tab stop, and the map's handlers. */
export interface TopicMapState {
	/** The hovered or focused topic with its prerequisites, or null at rest. */
	lit: ReadonlySet<TopicHandle> | null;
	/** The topic a page points at from elsewhere (a row on the course page), whose card glows. */
	marked?: TopicHandle | null;
	tabStop: TopicHandle | null;
	onActive: (handle: TopicHandle | null) => void;
	onFocus: (handle: TopicHandle) => void;
	onKeyDown: (handle: TopicHandle, event: KeyboardEvent<HTMLAnchorElement>) => void;
	register: (handle: TopicHandle, el: HTMLAnchorElement | null) => void;
}

export const TopicMapContext = createContext<TopicMapState | null>(null);

/** How far a card recedes when another chain is lit, or as an arc's entry
 *  topic: the lowest strength at which its muted line keeps 4.5:1 on its
 *  card (WCAG AA; tests/topic-map.test.tsx works it out from the tokens),
 *  so a receded card still reads (round 5: 50% drew it at 2.8:1). */
export const RECEDED = 0.8;

/** A card's line as Home's rows draw a reason: a 12px icon (the
 *  sidebar's and the course page's, a spinner while the tutor writes),
 *  then its words, on a caption line whose middle is the words' cap
 *  height. */
function LineMark({ line }: { line: CardFact }) {
	const Icon = factIcon(line);
	return (
		<span data-slot="topic-need" data-kind={line.kind} className="flex h-3.5 min-w-0 items-center gap-1 text-caption text-muted-foreground">
			{Icon ? <Icon aria-hidden="true" className="size-3 shrink-0" /> : <BrailleSpinner />}
			<span className="truncate">
				<MathText>{line.words}</MathText>
			</span>
		</span>
	);
}

/**
 * What a node holds (spec: topic-map.md, Node): Home's pie centred beside
 * two lines, as a hybrid row centres its pie beside its course and lesson.
 * The title on one 18px line, so a formula in it never makes the line
 * taller; under it, on its left edge, its line (`cardLine`), or else where
 * he stands in words.
 */
export function NodeBody({ topic, standing, line, from = null }: { topic: CourseMapTopic; standing: Standing; line: CardFact | null; from?: string | null }) {
	return (
		<span className="flex w-full min-w-0 items-center gap-4">
			<TopicGlyph standing={standing} />
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<MathLine className={cn("h-4.5 text-row font-medium", topic.level !== "new" ? "text-foreground" : "text-muted-foreground")}>{topic.title}</MathLine>
				{from ? (
					<span data-slot="topic-from" className="flex h-3.5 min-w-0 items-center gap-1 text-caption text-muted-foreground">
						<CornerLeftUpIcon aria-hidden="true" className="size-3 shrink-0" />
						<span className="truncate">
							<MathText>{entryCaption(from)}</MathText>
						</span>
					</span>
				) : line ? (
					<LineMark line={line} />
				) : (
					<span data-slot="topic-standing" className="block h-3.5 truncate text-caption text-muted-foreground">
						{standing.words}
					</span>
				)}
			</span>
		</span>
	);
}

/**
 * One topic on the map (spec: topic-map.md): one card, its pie beside its
 * title and one line under it. A link to the topic's page.
 */
export function TopicNode({ data }: NodeProps<TopicFlowNode>) {
	const state = useContext(TopicMapContext);
	const { topic, current, standing, line, label, needs, href, from } = data;
	// Outside the lit chain, or an arc's entry topic whose chain is not lit.
	const receded = state?.lit ? !state.lit.has(topic.handle) : from !== null;
	const marked = state?.marked === topic.handle;
	return (
		<div className="relative size-full transition-opacity duration-[120ms] motion-reduce:transition-none" style={receded ? { opacity: RECEDED } : undefined}>
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
				data-entry={from !== null || undefined}
				data-marked={marked || undefined}
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
					"pointer-events-auto flex size-full cursor-pointer rounded-lg border outline-none transition-[color,background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
					"hover:border-white/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					"items-center border-border bg-card px-3",
					current && "border-ring shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_16%,transparent)] hover:border-ring",
					marked && "lh-card-mark",
				)}
			>
				<NodeBody topic={topic} standing={standing} line={line} from={from} />
			</Link>
			<Handle type="target" position={Position.Top} isConnectable={false} className="invisible" />
			<Handle type="source" position={Position.Bottom} isConnectable={false} className="invisible" />
		</div>
	);
}
