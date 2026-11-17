"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { TopicHandle } from "@/src/core";
import { CardMap, type MapGraph } from "@/components/course-map/topic-map/topic-map";
import { cardNode, mapEdges } from "@/components/course-map/topic-map/map-drawing";
import type { NodeSize } from "@/components/course-map/topic-map/topic-map-layout";
import type { StepData } from "@/components/course-map/topic-map/topic-node";
import { BaseNode } from "@/components/course-map/topic-map/canvas/base-node";
import { CardContent } from "@/components/course-map/topic-map/canvas/canvas-node";
import { MAP_FADE, vignette } from "@/components/course-map/map-fade";
import { STEP_SIZE, ringedStep, stepCard, stepsAcross, stepsLayout } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { hybridMarks, type PlannedEntry } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { cn } from "@/lib/utils";
import { mathPlain } from "@/components/ui/math-text";

const VIGNETTE = vignette("pane");

/**
 * Each step's card sized to the pane (`stepCard`, round 14, m34): the
 * pane's width, read as it changes, and every card measured in a hidden
 * copy of the drawn card (`CardContent`), its title unwrapped for the
 * one-line width, then at the chosen width for the height. Again once the
 * web fonts a formula needs have loaded. `STEP_SIZE` until then.
 */
function useStepCard(steps: readonly StepData[], across: number) {
	const root = useRef<HTMLDivElement>(null);
	const measurer = useRef<HTMLDivElement>(null);
	const [paneWidth, setPaneWidth] = useState(0);
	const [size, setSize] = useState<NodeSize | null>(null);
	useLayoutEffect(() => {
		const el = root.current;
		if (!el) return;
		const read = () => setPaneWidth(el.clientWidth);
		read();
		const observer = new ResizeObserver(read);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	useLayoutEffect(() => {
		const box = measurer.current;
		if (!box || paneWidth <= 0) return;
		let live = true;
		const measure = () => {
			if (!live) return;
			const cards = [...box.children] as HTMLElement[];
			const widest = (): number => Math.max(0, ...cards.map((card) => card.getBoundingClientRect().width));
			const tallest = (): number => Math.max(0, ...cards.map((card) => card.getBoundingClientRect().height));
			for (const card of cards) card.style.width = "max-content";
			const oneLine = widest();
			const next = stepCard(across, paneWidth, MAP_FADE.pane, oneLine, (width) => {
				for (const card of cards) card.style.width = `${width}px`;
				return tallest();
			});
			setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
		};
		measure();
		void document.fonts?.ready.then(measure);
		return () => {
			live = false;
		};
	}, [steps, across, paneWidth]);
	return { root, measurer, size };
}

/**
 * One lesson's plan as a map (spec: hybrid.md, Lesson map), drawn by the
 * course map's own drawing (`CardMap`): its card, lines, tags, focus,
 * camera and keys, under the topic page's fade. Each step is the course
 * map's card less what a step lacks, its width from the pane, at most
 * four across, every card as tall as the tallest title needs
 * (`useStepCard`). The ringed step carries "Left off here" or "Your
 * turn", the step after it "Next", and every step opens the lesson.
 */
export function LessonMap({ entry, label }: { entry: PlannedEntry; label: string }) {
	const { plan } = entry;
	const waits = entry.state === "your-turn";
	const href = `/chat/${entry.chat.id}`;
	const ring = ringedStep(plan, waits) as TopicHandle | null;
	const steps = useMemo<StepData[]>(() => {
		const marks = hybridMarks(plan, waits);
		const { needs } = stepsLayout(plan);
		const titleOf = new Map(plan.tree.nodes.map((node) => [node.id, mathPlain(node.title)]));
		// A step the plan repeats is drawn once.
		const unique = plan.tree.nodes.filter((node, index, all) => all.findIndex((other) => other.id === node.id) === index);
		return unique.flatMap((node) => {
			const handle = node.id as TopicHandle;
			const mark = marks.get(node.id);
			if (!mark) return [];
			const rests = needs.flatMap((need) => (need.kind === "needs" && need.topic === handle ? [titleOf.get(need.prerequisite) ?? need.prerequisite] : []));
			return [
				{
					kind: "step" as const,
					handle,
					title: node.title,
					status: mark.status,
					current: mark.status === "current",
					tag: mark.tag,
					label: [mathPlain(node.title), mark.tag, `Opens ${label}`].filter(Boolean).join(". "),
					needs: rests.length ? `Rests on ${rests.join(", ")}` : null,
					summary: node.summary?.trim() || null,
					href,
				},
			];
		});
	}, [plan, waits, href, label]);
	const across = useMemo(() => stepsAcross(stepsLayout(plan).layout), [plan]);
	const { root, measurer, size } = useStepCard(steps, across);
	const card = size ?? STEP_SIZE;
	const drawing = useMemo(() => stepsLayout(plan, card), [plan, card]);
	const nodes = useMemo<Node[]>(
		() =>
			steps.flatMap((step) => {
				const placed = drawing.layout.topics.get(step.handle);
				return placed ? [cardNode(step, placed, drawing.layout)] : [];
			}),
		[steps, drawing],
	);
	const edges = useMemo<Edge[]>(() => mapEdges(drawing.layout), [drawing]);
	const current = plan.tree.nodes.find((node) => node.id === ring) ?? null;
	const graph = useMemo<MapGraph>(
		() => ({
			edges: drawing.needs,
			current: ring,
			caption: `${label}: ${steps.length} steps, each below the steps it rests on.${current ? ` ${waits ? "Your turn on" : "Left off at"} ${mathPlain(current.title)}.` : ""}`,
		}),
		[drawing.needs, ring, label, steps.length, current, waits],
	);
	return (
		<div ref={root} data-slot="topic-lesson-map" className="relative flex min-h-0 flex-1 flex-col" style={VIGNETTE}>
			<div ref={measurer} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 -z-10">
				{steps.map((step) => (
					<BaseNode key={step.handle} className="flex flex-col">
						<CardContent data={step} />
					</BaseNode>
				))}
			</div>
			{/* Shown once the cards are sized to the pane, so no card jumps. */}
			<div className={cn("relative flex min-h-0 flex-1 flex-col", size === null && "invisible")}>
				<CardMap graph={graph} layout={drawing.layout} nodes={nodes} edges={edges} margin={MAP_FADE.pane} opensOn={ring} fitsDown="top" />
			</div>
		</div>
	);
}
