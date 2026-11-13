"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type CoordinateExtent } from "@xyflow/react";
import type { TopicHandle } from "@/src/core";
import { NeedEdge, type NeedFlowEdge } from "@/components/course-map/topic-map/need-edge";
import { MIN_ZOOM, NODE_HEIGHT, NODE_WIDTH, cameraAt, centreOf, chainOf, isWalkKey, neighbourOf, openingCamera, wholeZoom } from "@/components/course-map/topic-map/topic-map-layout";
import { TopicMapContext, type TopicMapState } from "@/components/course-map/topic-map/topic-node";
import { mapFade } from "@/components/study-home/map-frame";
import { StepNode, type StepFlowNode } from "@/components/unit-inbox/topic-page/steps/step-node";
import { stepsLayout, type StepsDrawing } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { hybridMarks, type PlannedEntry } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { cn } from "@/lib/utils";
import { mathPlain } from "@/components/ui/math-text";

const nodeTypes = { step: StepNode };
const edgeTypes = { need: NeedEdge };

/** How far the fade reaches in from the sides and from the top and bottom: Home's map frame's. */
const FADE = { x: 64, y: 40 };
/** The frame's edges fade into the page on every side, like Home's map. */
const VIGNETTE = mapFade(FADE.x, FADE.y);
/** A step's tag sits this far above its node, inside the room. */
const TAG_ROOM = 20;
/** As much room around the drawing as the fade, so a step at the edge pans clear of it. */
const MARGIN = { x: FADE.x, y: FADE.y + TAG_ROOM };
/** How long the camera takes to follow the keyboard to a step out of view. */
const FOLLOW_MS = 200;

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One lesson's plan in a bounded frame (spec: hybrid.md): the frame keeps
 * its size and fades its edges as Home's course map does, and the plan
 * pans inside it by wheel, trackpad or drag, with no bar. It opens on the
 * whole plan when that fits at three quarters size or more, else at full
 * size on the step the lesson stopped on. That step is ringed, the steps
 * right after it say Next, and every step opens the lesson.
 */
export function LessonMap({ entry, label }: { entry: PlannedEntry; label: string }) {
	const { plan } = entry;
	const waits = entry.state === "your-turn";
	const href = `/chat/${entry.chat.id}`;
	const drawing = useMemo(() => stepsLayout(plan), [plan]);
	const nodes = useMemo<StepFlowNode[]>(() => {
		const marks = hybridMarks(plan, waits);
		const titleOf = new Map(plan.tree.nodes.map((node) => [node.id, mathPlain(node.title)]));
		// A step the plan repeats is drawn once.
		const steps = plan.tree.nodes.filter((node, index, all) => all.findIndex((other) => other.id === node.id) === index);
		return steps.flatMap((node) => {
			const handle = node.id as TopicHandle;
			const placed = drawing.layout.topics.get(handle);
			const mark = marks.get(node.id);
			if (!placed || !mark) return [];
			const rests = drawing.needs.flatMap((need) => (need.kind === "needs" && need.topic === handle ? [titleOf.get(need.prerequisite) ?? need.prerequisite] : []));
			const said = mark.status === "current" && waits ? "Your turn" : mark.tag;
			return {
				id: node.id,
				type: "step" as const,
				position: { x: placed.x, y: placed.y },
				width: NODE_WIDTH,
				height: NODE_HEIGHT,
				// A server render has no measured handles; these let it draw the edges.
				handles: [
					{ type: "target" as const, position: Position.Top, x: NODE_WIDTH / 2, y: 0 },
					{ type: "source" as const, position: Position.Bottom, x: NODE_WIDTH / 2, y: NODE_HEIGHT },
				],
				draggable: false,
				selectable: false,
				focusable: false,
				ariaRole: "none" as const,
				data: {
					handle,
					title: node.title,
					status: mark.status,
					tag: mark.tag,
					label: [mathPlain(node.title), said, `Opens ${label}`].filter(Boolean).join(". "),
					rests: rests.length ? `Rests on ${rests.join(", ")}` : null,
					summary: node.summary?.trim() || null,
					href,
					layer: placed.layer,
				},
			};
		});
	}, [plan, waits, href, label, drawing]);
	const edges = useMemo<NeedFlowEdge[]>(
		() =>
			drawing.layout.routes.map((route) => ({
				id: `${route.prerequisite}>${route.topic}`,
				source: route.prerequisite,
				target: route.topic,
				type: "need" as const,
				data: { points: route.points },
				focusable: false,
				selectable: false,
				domAttributes: { "aria-hidden": true },
			})),
		[drawing],
	);
	const current = plan.tree.nodes.find((node) => node.id === plan.current) ?? null;
	return (
		<div data-slot="topic-lesson-map" className="relative flex min-h-0 flex-1 flex-col" style={VIGNETTE}>
			{/* The provider takes the drawing too, so a server render has it before any effect runs. */}
			<ReactFlowProvider initialNodes={nodes} initialEdges={edges}>
				<Flow
					drawing={drawing}
					nodes={nodes}
					edges={edges}
					current={(current?.id as TopicHandle | undefined) ?? null}
					caption={`${label}: ${nodes.length} steps, each below the steps it rests on.${current ? ` ${waits ? "Your turn on" : "Left off at"} ${mathPlain(current.title)}.` : ""}`}
				/>
			</ReactFlowProvider>
		</div>
	);
}

function Flow({ drawing, nodes, edges, current, caption }: { drawing: StepsDrawing; nodes: StepFlowNode[]; edges: NeedFlowEdge[]; current: TopicHandle | null; caption: string }) {
	const { layout, needs } = drawing;
	const captionId = useId();
	const flow = useReactFlow<StepFlowNode, NeedFlowEdge>();
	const frameWidth = useStore((s) => s.width);
	const frameHeight = useStore((s) => s.height);

	const [active, setActive] = useState<TopicHandle | null>(null);
	const [tabStop, setTabStop] = useState<TopicHandle | null>(current ?? layout.layers[0]?.[0] ?? null);
	const links = useRef(new Map<TopicHandle, HTMLAnchorElement>());
	const lit = useMemo(() => (active ? chainOf(active, needs) : null), [active, needs]);

	const extent = useMemo<CoordinateExtent>(
		() => [
			[-MARGIN.x, -MARGIN.y],
			[layout.width + MARGIN.x, layout.height + MARGIN.y],
		],
		[layout],
	);
	const frame = frameWidth > 0 && frameHeight > 0 ? { width: frameWidth, height: frameHeight } : null;
	const minZoom = frame ? Math.max(MIN_ZOOM, Math.min(1, wholeZoom(layout, frame, MARGIN))) : 1;

	// The camera returns to its opening view whenever the frame grows or shrinks.
	const [placed, setPlaced] = useState(false);
	useEffect(() => {
		if (frameWidth <= 0 || frameHeight <= 0) return;
		void flow.setViewport(openingCamera(layout, current, { width: frameWidth, height: frameHeight }, MARGIN)).then(() => setPlaced(true));
	}, [flow, layout, current, frameWidth, frameHeight]);

	/** Brings a step the keyboard reached into view, when part of it is out of the frame. */
	const follow = useCallback(
		(handle: TopicHandle) => {
			const at = layout.topics.get(handle);
			if (!at || frameWidth <= 0) return;
			const { x, y, zoom } = flow.getViewport();
			const left = at.x * zoom + x;
			const top = at.y * zoom + y;
			const inside = left >= MARGIN.x && top >= MARGIN.y && left + NODE_WIDTH * zoom <= frameWidth - MARGIN.x && top + NODE_HEIGHT * zoom <= frameHeight - MARGIN.y;
			if (!inside) void flow.setViewport(cameraAt(layout, centreOf(layout, at), zoom, { width: frameWidth, height: frameHeight }, MARGIN), { duration: reducedMotion() ? 0 : FOLLOW_MS });
		},
		[flow, layout, frameWidth, frameHeight],
	);

	const state = useMemo<TopicMapState>(
		() => ({
			lit,
			tabStop,
			onActive: setActive,
			onFocus: (handle) => {
				setActive(handle);
				setTabStop(handle);
				if (links.current.get(handle)?.matches(":focus-visible")) follow(handle);
			},
			onKeyDown: (handle, event: KeyboardEvent<HTMLAnchorElement>) => {
				if (!isWalkKey(event.key)) return;
				const next = neighbourOf(layout, needs, handle, event.key);
				if (!next) return;
				event.preventDefault();
				setTabStop(next);
				links.current.get(next)?.focus({ preventScroll: true });
			},
			register: (handle, el) => {
				if (el) links.current.set(handle, el);
				else links.current.delete(handle);
			},
		}),
		[lit, tabStop, layout, needs, follow],
	);

	return (
		<figure data-slot="topic-steps" aria-labelledby={captionId} className="relative min-h-0 flex-1">
			<figcaption id={captionId} className="sr-only">
				{caption}
			</figcaption>
			<TopicMapContext.Provider value={state}>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					// No `colorMode="dark"`: its `dark` class on the wrapper would restate the old theme's tokens inside the map.
					// The opening view is set once the frame is measured; the map fades in on it.
					className={cn("transition-opacity duration-[180ms] ease-out motion-reduce:transition-none", !placed && "opacity-0")}
					minZoom={minZoom}
					maxZoom={1}
					translateExtent={extent}
					panOnScroll
					zoomOnDoubleClick={false}
					nodesDraggable={false}
					nodesConnectable={false}
					nodesFocusable={false}
					edgesFocusable={false}
					elementsSelectable={false}
					deleteKeyCode={null}
					selectionKeyCode={null}
					multiSelectionKeyCode={null}
					panActivationKeyCode={null}
					disableKeyboardA11y
					// As the topic map: MIT asks for no badge (spec: topic-map.md).
					proOptions={{ hideAttribution: true }}
				/>
			</TopicMapContext.Provider>
		</figure>
	);
}
