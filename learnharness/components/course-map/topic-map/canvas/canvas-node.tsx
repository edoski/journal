"use client";

import { useContext } from "react";
import Link from "next/link";
import { CornerLeftUpIcon } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ArcHandle, TopicHandle } from "@/src/core";
import { cn } from "@/lib/utils";
import { MathLine } from "@/components/ui/math-line";
import { MathText } from "@/components/ui/math-text";
import { entryCaption } from "../arc-view";
import { TopicGlyph } from "../topic-glyph";
import { CURRENT_TAG, type CardFact } from "../topic-standing";
import { LineMark, RECEDED, TopicMapContext, type TopicData } from "../topic-node";
import { BaseNode, BaseNodeContent, BaseNodeHeader } from "./base-node";
import { NodeAppendix } from "./node-appendix";
import { useCanvas } from "./canvas-context";
import type { Focus } from "./canvas-focus";

export type CanvasFlowNode = Node<TopicData, "canvasTopic">;

/** How far a card recedes while another topic is in focus (canvas.md, Focus): further than a lit chain's, so what it
 *  needs and leads to stand out; its title still reads at 3:1. */
const FOCUS_RECEDED = 0.45;

/** A card's part in the focus: the topic itself, one it needs, one it leads to, one a lit line passes through, or none. */
function focusRole(focus: Focus, handle: TopicHandle): "topic" | "need" | "leads-to" | "via" | null {
	if (focus.topic === handle) return "topic";
	if (focus.needs.includes(handle)) return "need";
	if (focus.leadsTo.includes(handle)) return "leads-to";
	return focus.via.has(handle) ? "via" : null;
}

/** The header strip's tint: the accent where a session waits on him, the
 *  warning ink where the engine calls it weak, a whisper for a plan or a
 *  task, none where it only says where he stands (canvas.md, Node). */
function headerTone(line: CardFact | null): string {
	if (!line) return "bg-transparent";
	if (line.kind === "your-turn" || line.kind === "stopped" || line.kind === "working") return "bg-[color-mix(in_oklab,var(--ring)_14%,transparent)]";
	if (line.kind === "slip") return "bg-[color-mix(in_oklab,var(--lh-warning)_10%,transparent)]";
	return "bg-white/4";
}

/**
 * One topic on the canvas (canvas.md): React Flow UI's two-tier node, a
 * header strip saying what the topic needs from him (or where he stands)
 * over its pie and title. A link to the topic's page. "You are here" sits
 * above the card's top edge, on the header's text line (React Flow UI's
 * NodeAppendix, its words alone).
 */
export function CanvasNode({ data }: NodeProps<CanvasFlowNode>) {
	const state = useContext(TopicMapContext);
	const { topic, current, standing, line, label, needs, href, from } = data;
	const canvas = useCanvas();
	const focus = canvas?.focus ?? null;
	const role = focus ? focusRole(focus, topic.handle) : null;
	const receded = focus ? role === null : state?.lit ? !state.lit.has(topic.handle) : from !== null;
	const marked = state?.marked === topic.handle;
	// An entry card's "From <arc>" line opens that arc on the map, where the page can show it (Edo, 16 Nov 2026).
	const openFrom = from !== null && topic.arc && state?.openArc ? { arc: topic.arc, open: state.openArc } : null;
	return (
		<div
			data-focus={role ?? undefined}
			className="group/card relative size-full transition-opacity duration-[120ms] motion-reduce:transition-none"
			style={role === "via" ? { opacity: RECEDED } : receded ? { opacity: focus ? FOCUS_RECEDED : RECEDED } : undefined}
		>
			{current && (
				<NodeAppendix data-slot="course-map-current-tag" className="left-3.25 mb-1.5 h-5 px-0 text-foreground">
					{CURRENT_TAG}
				</NodeAppendix>
			)}
			<BaseNode
				className={cn(
					"flex size-full flex-col overflow-hidden transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
					current ? "border-ring shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_16%,transparent)]" : "hover:border-white/20",
					marked && "lh-card-mark",
				)}
			>
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
					onMouseEnter={() => {
						state?.onActive(topic.handle);
						canvas?.point(topic.handle);
					}}
					onMouseLeave={() => {
						state?.onActive(null);
						canvas?.point(null);
					}}
					onFocus={() => {
						state?.onFocus(topic.handle);
						canvas?.point(topic.handle);
					}}
					onBlur={() => {
						state?.onActive(null);
						canvas?.point(null);
					}}
					onKeyDown={(event) => state?.onKeyDown(topic.handle, event)}
					className="pointer-events-auto flex min-h-0 w-full flex-1 cursor-pointer flex-col rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
				>
					<BaseNodeHeader className={cn("h-6 shrink-0 border-b border-white/6", headerTone(from ? null : line), openFrom && "group-has-[[data-slot=topic-from]:hover]/card:bg-fill-hover")}>
						{from ? (
							<span
								data-slot={openFrom ? "topic-from-face" : "topic-from"}
								aria-hidden={openFrom ? true : undefined}
								className="flex min-w-0 items-center gap-1 text-callout text-muted-foreground transition-colors group-has-[[data-slot=topic-from]:hover]/card:text-foreground motion-reduce:transition-none"
							>
								<CornerLeftUpIcon aria-hidden="true" className="size-3 shrink-0" />
								<span className="truncate">
									<MathText>{entryCaption(from)}</MathText>
								</span>
							</span>
						) : line ? (
							<LineMark line={line} />
						) : (
							<span data-slot="topic-standing" className="truncate text-callout text-muted-foreground">
								{standing.words}
							</span>
						)}
					</BaseNodeHeader>
					<BaseNodeContent className="min-h-0 flex-1">
						<TopicGlyph standing={standing} />
						<MathLine className={cn("h-4.5 min-w-0 flex-1 text-body", topic.level !== "new" ? "text-foreground" : "text-muted-foreground")}>{topic.title}</MathLine>
					</BaseNodeContent>
				</Link>
			</BaseNode>
			{openFrom && <FromLink title={from!} arc={openFrom.arc} onOpen={openFrom.open} />}
			<Handle type="target" position={Position.Top} isConnectable={false} className="invisible" />
			<Handle type="source" position={Position.Bottom} isConnectable={false} className="invisible" />
		</div>
	);
}

/**
 * An entry card's "From <arc>" line as a press of its own, laid over the
 * card's header strip beside the card's link (never inside it): it shows
 * the arc the topic comes from on the map (Edo, 16 Nov 2026: "make perhaps
 * the From... header in cards clickable"). The strip keeps its words and
 * place, inside the link, so every card's link is the card's size; under
 * the pointer the strip fills and its words read in the foreground ink.
 * Its press reaches 8 above the card, so it stays 24 tall at the map's
 * smallest readable scale (WCAG 2.5.8). Pointer only, like the card's
 * other shortcuts: ⇧↑ and ⇧↓ are the keyboard's way
 * to another arc.
 */
function FromLink({ title, arc, onOpen }: { title: string; arc: ArcHandle; onOpen: (arc: ArcHandle) => void }) {
	return (
		<button
			type="button"
			data-slot="topic-from"
			data-arc={arc}
			tabIndex={-1}
			aria-label={`Open ${title}`}
			onClick={() => onOpen(arc)}
			className="pointer-events-auto absolute inset-x-0 -top-2 h-8 cursor-pointer"
		>
			<span className="sr-only">{entryCaption(title)}</span>
		</button>
	);
}
