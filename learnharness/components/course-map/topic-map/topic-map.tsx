"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type CoordinateExtent } from "@xyflow/react";
import type { ArcHandle, CourseMap, TopicHandle } from "@/src/core";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { cn } from "@/lib/utils";
import { NeedEdge, type NeedFlowEdge } from "./need-edge";
import { READABLE_ZOOM, TOPIC_NODE_SIZE as node, cameraAt, centreOf, chainOf, framedCamera, isWalkKey, layoutTopicMap, neighbourOf, slackOf, wholeZoom, type Camera, type TopicMapLayout } from "./topic-map-layout";
import { TopicMapContext, TopicNode, type TopicFlowNode, type TopicMapState } from "./topic-node";
import { cardLine, standingOf, topicLabel } from "./topic-standing";
import type { Said } from "@/components/unit-inbox/sidebar-says";
import { arcView } from "./arc-view";
import { litCamera, litFollow } from "./lit-camera";

const nodeTypes = { topic: TopicNode };
const edgeTypes = { need: NeedEdge };

/** Room around the drawing: the least a topic at its edge can be brought
 *  in from the frame's edge, enough to clear a frame that fades. */
const ROOM = { x: 48, y: 32 };
/** The current topic's tag sits this far above its node, inside the room. */
const TAG_ROOM = 20;
/** How long the camera takes to follow the keyboard to a topic out of view, or a page to the topics it points at. */
const FOLLOW_MS = 200;
/** The course page pane's glide (split-map.tsx): fast out, settling in. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One course as a map (spec: topic-map.md): its topics in layers,
 * prerequisites above the topics that need them, drawn with React Flow
 * over the layout's own geometry. Each node says where he stands and,
 * from `said` (`sidebarSays`), what the sidebar says for it when that
 * needs him, and opens the topic's page. The map opens on the
 * whole course when that fits, else framed on the current topic with the
 * topics it leads to whole (`framedCamera`), or at `zoom` with the whole course in
 * its middle, for a page that frames the map itself; `whole` shows the
 * whole course however small (the enlarged map's zoom out). It pans by
 * drag or scroll and zooms by pinch. Hover or focus lights a topic's
 * prerequisite chain; arrows walk the edges. `highlight` lights a set of
 * topics while nothing is hovered or focused, for a page that points at
 * them from elsewhere, and `marked` the one topic among them a page
 * points at, whose card glows (`lh-card-mark`); both off by default.
 * `arc` draws one arc of a course with arcs (`arcView`): its topics whole
 * and the topics it builds on from earlier arcs, faded and captioned with
 * their arc, in the top layer; the lit chain then stays inside it.
 * `framed` are topics a page points at, which the camera brings into view
 * whole once the page rests on them, and leaves for its opening view once
 * it points at nothing (`litFollow`); off by default.
 */
export function TopicMap({
	map: course,
	arc,
	said,
	margin = ROOM,
	highlight = null,
	marked = null,
	zoom,
	whole = false,
	framed = null,
	onOpensWhole,
}: {
	map: CourseMap;
	/** The one arc to draw; unset, the whole course. */
	arc?: ArcHandle;
	/** What the sidebar says for each topic (`sidebarSays`), so each card's
	 *  line is the sidebar row's. */
	said: ReadonlyMap<TopicHandle, Said>;
	margin?: { x: number; y: number };
	/** Topics to light, the rest dimmed as a hover dims them; null lights none. */
	highlight?: ReadonlySet<TopicHandle> | null;
	/** The topic a page points at from elsewhere, whose card glows; null marks none. */
	marked?: TopicHandle | null;
	/** The scale to draw the whole course at, in the frame's middle, for a
	 *  page that sizes the frame to it and scrolls it; unset, the map
	 *  frames itself. */
	zoom?: number;
	/** Show the whole course in the frame, at whatever scale fits it. */
	whole?: boolean;
	/** Topics a page points at, which the camera brings into view; null
	 *  points at none, and the camera returns to where it opened. */
	framed?: ReadonlySet<TopicHandle> | null;
	/** Told, whenever the frame changes, whether the map opens on the whole
	 *  course (it fits at a readable scale), so a page offers a zoom out only
	 *  when there is more to see. */
	onOpensWhole?: (fits: boolean) => void;
}) {
	const view = useMemo(() => arcView(course, arc), [course, arc]);
	const map = view.map;
	const layout = useMemo(() => layoutTopicMap(map.topics, map.edges, node, new Set(view.entry.keys())), [map.topics, map.edges, view.entry]);
	const titleOf = useCallback((handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle, [map.topics]);
	const nodes = useMemo<TopicFlowNode[]>(
		() =>
			map.topics.flatMap((topic) => {
				const placed = layout.topics.get(topic.handle);
				if (!placed) return [];
				const line = cardLine(said.get(topic.handle));
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
						line,
						label: topicLabel(topic, map.current === topic.handle, line),
						needs: needs.length ? `Needs ${needs.join(", ")}` : null,
						href: unitHref(map.workspace, topic.handle),
						from: view.entry.get(topic.handle) ?? null,
					},
				};
			}),
		[map, said, layout, titleOf, view.entry],
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
			<Flow map={map} layout={layout} nodes={nodes} edges={edges} titleOf={titleOf} margin={margin} highlight={highlight} marked={marked} zoom={zoom} whole={whole} framed={framed} onOpensWhole={onOpensWhole} />
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
	marked,
	zoom: fixedZoom,
	whole,
	framed,
	onOpensWhole,
}: {
	map: CourseMap;
	layout: TopicMapLayout;
	nodes: TopicFlowNode[];
	edges: NeedFlowEdge[];
	titleOf: (handle: TopicHandle) => string;
	margin: { x: number; y: number };
	highlight: ReadonlySet<TopicHandle> | null;
	marked: TopicHandle | null;
	zoom: number | undefined;
	whole: boolean;
	framed: ReadonlySet<TopicHandle> | null;
	onOpensWhole: ((fits: boolean) => void) | undefined;
}) {
	const captionId = useId();
	const margin = useMemo(() => ({ x: frameMargin.x, y: frameMargin.y + TAG_ROOM }), [frameMargin.x, frameMargin.y]);
	const flow = useReactFlow<TopicFlowNode, NeedFlowEdge>();
	const frameWidth = useStore((s) => s.width);
	const frameHeight = useStore((s) => s.height);

	const [active, setActive] = useState<TopicHandle | null>(null);
	const [tabStop, setTabStop] = useState<TopicHandle | null>(map.current ?? map.topics[0]?.handle ?? null);
	const links = useRef(new Map<TopicHandle, HTMLAnchorElement>());
	// A hovered or focused topic's chain; else the page's highlight, with "You are here" and the topics it leads to
	// (Edo, 14 Nov 2026: they stay whole and readable; only topics further away recede).
	const lit = useMemo(() => {
		if (active) return chainOf(active, map.edges);
		if (!highlight) return null;
		const here = map.current;
		const next = here ? map.edges.flatMap((e) => (e.kind === "needs" && e.prerequisite === here ? [e.topic] : [])) : [];
		return new Set([...highlight, ...(here ? [here] : []), ...next]);
	}, [active, map.edges, map.current, highlight]);

	const frame = frameWidth > 0 && frameHeight > 0 ? { width: frameWidth, height: frameHeight } : null;
	// Zoomed out as far as the whole course, however small: the enlarged map's overview.
	const fitted = frame ? Math.min(1, wholeZoom(layout, frame, margin)) : 1;
	const minZoom = fixedZoom === undefined ? fitted : Math.min(fitted, fixedZoom);
	// As far as the camera may look: the room (in the frame's pixels) at the smallest scale the map shows, and one
	// topic past it for a pan or a follow (`slackOf`).
	const reach = useMemo(() => {
		const slack = slackOf(layout.node);
		const smallest = Math.min(READABLE_ZOOM, minZoom);
		return { x: margin.x / smallest + slack.x, y: margin.y / smallest + slack.y };
	}, [layout.node, margin.x, margin.y, minZoom]);
	const extent = useMemo<CoordinateExtent>(
		() => [
			[-reach.x, -reach.y],
			[layout.width + reach.x, layout.height + reach.y],
		],
		[layout, reach],
	);
	const opensWhole = frame ? wholeZoom(layout, frame, margin) >= READABLE_ZOOM : null;
	const told = useRef(onOpensWhole);
	told.current = onOpensWhole;
	useLayoutEffect(() => {
		if (opensWhole !== null) told.current?.(opensWhole);
	}, [opensWhole]);

	// The camera returns to its opening view whenever the frame grows or shrinks, or `whole` turns.
	// Placed before the browser paints the measured frame: the map shows at once, already framed.
	const [placed, setPlaced] = useState(false);
	const wasWhole = useRef(whole);
	/** The opening view, where the camera returns once a page points at nothing. */
	const opening = useRef<Camera | null>(null);
	/** What the follow reads when it fires, as of the last render. */
	const now = useRef({ layout, frame, frameMargin, reach, minZoom, current: map.current });
	now.current = { layout, frame, frameMargin, reach, minZoom, current: map.current };
	const [follower] = useState(() =>
		litFollow({
			plan: (lit) => {
				const { layout, frame, frameMargin, reach, minZoom, current } = now.current;
				return frame ? litCamera(layout, flow.getViewport(), lit, frame, frameMargin, reach, minZoom, current, TAG_ROOM) : null;
			},
			home: () => {
				const { x, y, zoom } = flow.getViewport();
				const to = opening.current;
				return to && (Math.abs(to.x - x) > 0.5 || Math.abs(to.y - y) > 0.5 || to.zoom !== zoom) ? to : null;
			},
			move: (camera) => void flow.setViewport(camera, { duration: reducedMotion() ? 0 : FOLLOW_MS, ease: easeOut }),
		}),
	);
	useEffect(() => () => follower.stop(), [follower]);
	useLayoutEffect(() => {
		if (frameWidth <= 0 || frameHeight <= 0) return;
		const size = { width: frameWidth, height: frameHeight };
		const middle: [number, number] = [layout.width / 2, layout.height / 2];
		const camera = whole
			? cameraAt(layout, middle, minZoom, size, margin)
			: fixedZoom === undefined
				? framedCamera(layout, map.current, size, frameMargin, TAG_ROOM)
				: cameraAt(layout, middle, fixedZoom, size, margin);
		// Zooming out to the whole course and back glides; any other move is at once. Without a duration React Flow
		// sets the viewport synchronously; only its promise settles later.
		const glide = wasWhole.current !== whole && !reducedMotion();
		wasWhole.current = whole;
		opening.current = camera;
		follower.stay();
		void flow.setViewport(camera, { duration: glide ? FOLLOW_MS : 0 });
		setPlaced(true);
	}, [flow, follower, layout, map.current, frameWidth, frameHeight, margin, frameMargin, fixedZoom, whole, minZoom]);

	// The topics a page points at on this drawing, which the camera follows; none while it shows the whole course.
	const pointedAt = useMemo(() => {
		const onMap = whole || !framed ? [] : [...framed].filter((t) => layout.topics.has(t));
		return onMap.length ? onMap : null;
	}, [framed, layout, whole]);
	useEffect(() => follower.point(pointedAt), [follower, pointedAt]);

	/** Brings a topic the keyboard reached into view, when part of it is out of the frame. */
	const follow = useCallback(
		(handle: TopicHandle) => {
			const at = layout.topics.get(handle);
			if (!at || frameWidth <= 0) return;
			const { x, y, zoom } = flow.getViewport();
			const left = at.x * zoom + x;
			const top = at.y * zoom + y;
			const inside = left >= margin.x && top >= margin.y && left + layout.node.width * zoom <= frameWidth - margin.x && top + layout.node.height * zoom <= frameHeight - margin.y;
			follower.stay();
			if (!inside) void flow.setViewport(cameraAt(layout, centreOf(layout, at), zoom, { width: frameWidth, height: frameHeight }, margin), { duration: reducedMotion() ? 0 : FOLLOW_MS });
		},
		[flow, follower, layout, frameWidth, frameHeight, margin],
	);

	const state = useMemo<TopicMapState>(
		() => ({
			lit,
			marked,
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
		[lit, marked, tabStop, layout, map.edges, follow],
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
					// Hidden only until the frame is measured and the opening view set, in the same frame.
					className={cn(!placed && "invisible")}
					minZoom={minZoom}
					maxZoom={1}
					translateExtent={extent}
					panOnScroll
					// A pan or zoom of his own (an event; the camera's own moves have none) keeps the map where he leaves it.
					onMoveStart={(event) => event && follower.stay()}
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
