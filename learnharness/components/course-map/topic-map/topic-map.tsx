"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type CoordinateExtent } from "@xyflow/react";
import type { CourseMap, TopicHandle } from "@/src/core";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { cn } from "@/lib/utils";
import { NeedEdge, type NeedFlowEdge } from "./need-edge";
import { MIN_ZOOM, cameraAt, centreOf, chainOf, isWalkKey, layoutTopicMap, neighbourOf, openingCamera, wholeZoom, type TopicMapLayout } from "./topic-map-layout";
import { TopicMapContext, TopicNode, type TopicFlowNode, type TopicMapState } from "./topic-node";
import { useNodeSize } from "./node-size";
import { needOf, standingOf, statusOf, topicLabel } from "./topic-standing";

const nodeTypes = { topic: TopicNode };
const edgeTypes = { need: NeedEdge };

/** Room around the drawing: the least a topic at its edge can be brought
 *  in from the frame's edge, enough to clear a frame that fades. */
const ROOM = { x: 48, y: 32 };
/** The current topic's tag sits this far above its node, inside the room. */
const TAG_ROOM = 20;
/** How long the camera takes to follow the keyboard to a topic out of view. */
const FOLLOW_MS = 200;

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One course as a map (spec: topic-map.md): its topics in layers,
 * prerequisites above the topics that need them, drawn with React Flow
 * over the layout's own geometry. Each node says where he stands and
 * whether it needs him, and opens the topic's page. The map opens on the
 * whole course when that fits, else on the current topic; it pans by drag
 * or scroll and zooms by pinch. Hover or focus lights a topic's
 * prerequisite chain; arrows walk the edges. `highlight` lights a set of
 * topics while nothing is hovered or focused, for a page that points at
 * them from elsewhere; off by default.
 */
export function TopicMap({
	map,
	margin = ROOM,
	highlight = null,
}: {
	map: CourseMap;
	margin?: { x: number; y: number };
	/** Topics to light, the rest dimmed as a hover dims them; null lights none. */
	highlight?: ReadonlySet<TopicHandle> | null;
}) {
	const node = useNodeSize();
	const layout = useMemo(() => layoutTopicMap(map.topics, map.edges, node), [map.topics, map.edges, node]);
	const titleOf = useCallback((handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle, [map.topics]);
	const nodes = useMemo<TopicFlowNode[]>(
		() =>
			map.topics.flatMap((topic) => {
				const placed = layout.topics.get(topic.handle);
				if (!placed) return [];
				const needs = map.edges.flatMap((e) => (e.kind === "needs" && e.topic === topic.handle ? [titleOf(e.prerequisite)] : []));
				return {
					id: topic.handle,
					type: "topic" as const,
					position: { x: placed.x, y: placed.y },
					width: node.width,
					height: node.height,
					// A server render has no measured handles; these let it draw the needs.
					handles: [
						{ type: "target" as const, position: Position.Top, x: node.width / 2, y: 0 },
						{ type: "source" as const, position: Position.Bottom, x: node.width / 2, y: node.height },
					],
					draggable: false,
					selectable: false,
					focusable: false,
					ariaRole: "none" as const,
					data: {
						topic,
						current: map.current === topic.handle,
						standing: standingOf(topic),
						need: needOf(topic, titleOf),
						status: statusOf(topic, map.tasks, titleOf),
						label: topicLabel(topic, map.current === topic.handle, titleOf),
						needs: needs.length ? `Needs ${needs.join(", ")}` : null,
						href: unitHref(map.workspace, topic.handle),
						layer: placed.layer,
					},
				};
			}),
		[map, layout, node, titleOf],
	);
	const edges = useMemo<NeedFlowEdge[]>(
		() =>
			layout.routes.map((route) => ({
				id: `${route.prerequisite}>${route.topic}`,
				source: route.prerequisite,
				target: route.topic,
				type: "need" as const,
				data: { points: route.points },
				focusable: false,
				selectable: false,
				domAttributes: { "aria-hidden": true },
			})),
		[layout],
	);
	return (
		// The provider takes the drawing too, so a server render has it before any effect runs.
		<ReactFlowProvider initialNodes={nodes} initialEdges={edges}>
			<Flow map={map} layout={layout} nodes={nodes} edges={edges} titleOf={titleOf} margin={margin} highlight={highlight} />
		</ReactFlowProvider>
	);
}

function Flow({
	map,
	layout,
	nodes,
	edges,
	titleOf,
	margin: frameMargin,
	highlight,
}: {
	map: CourseMap;
	layout: TopicMapLayout;
	nodes: TopicFlowNode[];
	edges: NeedFlowEdge[];
	titleOf: (handle: TopicHandle) => string;
	margin: { x: number; y: number };
	highlight: ReadonlySet<TopicHandle> | null;
}) {
	const captionId = useId();
	const margin = useMemo(() => ({ x: frameMargin.x, y: frameMargin.y + TAG_ROOM }), [frameMargin.x, frameMargin.y]);
	const flow = useReactFlow<TopicFlowNode, NeedFlowEdge>();
	const frameWidth = useStore((s) => s.width);
	const frameHeight = useStore((s) => s.height);

	const [active, setActive] = useState<TopicHandle | null>(null);
	const [tabStop, setTabStop] = useState<TopicHandle | null>(map.current ?? map.topics[0]?.handle ?? null);
	const links = useRef(new Map<TopicHandle, HTMLAnchorElement>());
	// A hovered or focused topic's chain, else the page's highlight.
	const lit = useMemo(() => (active ? chainOf(active, map.edges) : highlight), [active, map.edges, highlight]);

	const extent = useMemo<CoordinateExtent>(
		() => [
			[-margin.x, -margin.y],
			[layout.width + margin.x, layout.height + margin.y],
		],
		[layout, margin.x, margin.y],
	);
	const frame = frameWidth > 0 && frameHeight > 0 ? { width: frameWidth, height: frameHeight } : null;
	const minZoom = frame ? Math.max(MIN_ZOOM, Math.min(1, wholeZoom(layout, frame, margin))) : 1;

	// The camera returns to its opening view whenever the frame grows or shrinks.
	const [placed, setPlaced] = useState(false);
	useEffect(() => {
		if (frameWidth <= 0 || frameHeight <= 0) return;
		void flow.setViewport(openingCamera(layout, map.current, { width: frameWidth, height: frameHeight }, margin)).then(() => setPlaced(true));
	}, [flow, layout, map.current, frameWidth, frameHeight, margin]);

	/** Brings a topic the keyboard reached into view, when part of it is out of the frame. */
	const follow = useCallback(
		(handle: TopicHandle) => {
			const at = layout.topics.get(handle);
			if (!at || frameWidth <= 0) return;
			const { x, y, zoom } = flow.getViewport();
			const left = at.x * zoom + x;
			const top = at.y * zoom + y;
			const inside = left >= margin.x && top >= margin.y && left + layout.node.width * zoom <= frameWidth - margin.x && top + layout.node.height * zoom <= frameHeight - margin.y;
			if (!inside) void flow.setViewport(cameraAt(layout, centreOf(layout, at), zoom, { width: frameWidth, height: frameHeight }, margin), { duration: reducedMotion() ? 0 : FOLLOW_MS });
		},
		[flow, layout, frameWidth, frameHeight, margin],
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
				const next = neighbourOf(layout, map.edges, handle, event.key);
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
		[lit, tabStop, layout, map.edges, follow],
	);

	const current = map.current ? titleOf(map.current) : null;
	return (
		<figure data-slot="course-map-graph" aria-labelledby={captionId} className="relative min-h-0 flex-1">
			<figcaption id={captionId} className="sr-only">
				{`${map.title}: ${map.topics.length} topics, prerequisites above the topics that need them.`}
				{current ? ` You are at ${current}.` : ""}
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
					// MIT asks for no badge; the maintainers ask organisations that hide it to subscribe (spec: topic-map.md).
					proOptions={{ hideAttribution: true }}
				/>
			</TopicMapContext.Provider>
		</figure>
	);
}
