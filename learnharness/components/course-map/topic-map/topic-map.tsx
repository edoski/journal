"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ReactFlow, ReactFlowProvider, useReactFlow, useStore, useStoreApi, type CoordinateExtent, type Edge, type Node } from "@xyflow/react";
import type { ArcHandle, CourseMap, CourseMapEdge, TopicHandle } from "@/src/core";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { cn } from "@/lib/utils";
import { READABLE_ZOOM, TAG_ROOM, cameraAt, centreOf, chainOf, framedCamera, isWalkKey, neighbourOf, showsWhole, slackOf, wholeExtent, wholeZoom, type Camera, type NodeSize, type TopicMapLayout } from "./topic-map-layout";
import { TopicMapContext, type CardData, type TopicMapState } from "./topic-node";
import { CURRENT_TAG, cardLine, standingOf, topicLabel } from "./topic-standing";
import type { Said } from "@/components/unit-inbox/sidebar-says";
import { litCamera, litFollow } from "./lit-camera";
import { cardNode, drawingOf, mapEdges, trailOf, type Trail } from "./map-drawing";
import type { ArcView } from "./arc-view";
import { CanvasNode, CardContent } from "./canvas/canvas-node";
import { BaseNode } from "./canvas/base-node";
import { CANVAS_NODE } from "./canvas/canvas-layout";
import { CanvasLinesEdge } from "./canvas/canvas-lines";
import { CanvasFrame } from "./canvas/canvas-frame";
import { CanvasChrome } from "./canvas/canvas-chrome";
import { TrailNode } from "./trail-node";

/** Room around the drawing: the least a topic at its edge can be brought
 *  in from the frame's edge, enough to clear a frame that fades. */
const ROOM = { x: 48, y: 32 };
/** How long the camera takes to follow the keyboard to a topic out of view, or a page to the topics it points at. */
const FOLLOW_MS = 200;
/** How long the camera takes to glide from one arc to the next (topic-map.md, Arcs). */
const TRAVEL_MS = 420;
/** How far a pinch zooms in: a card reads closer, past its own size, even where the whole arc fits at 100%. */
const MAX_ZOOM = 1.5;
/** A shown arc's cards, a card of the arc being left (out of the map's focus, keys and links), and the one edge that
 *  draws every line. */
const NODE_TYPES = { card: CanvasNode, trail: TrailNode };
const EDGE_TYPES = { canvasLines: CanvasLinesEdge };
/** Every place the camera may look while it glides between arcs. */
const ANYWHERE: CoordinateExtent = [
	[-Infinity, -Infinity],
	[Infinity, Infinity],
];
/** The glide between arcs: eased in and out, as a camera moving between two fixed views. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** The follow's glide: fast out, settling in. */
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
 * topics it leads to whole (`framedCamera`), a drawing shorter than the
 * frame in its middle or at its top (`fitsDown`); `whole` shows the
 * whole course however small (the maps' Whole course). It pans by
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
	whole = false,
	framed = null,
	onOpensWhole,
	opensOn,
	onOpenArc,
	fitsDown,
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
	/** Show the whole course in the frame, at whatever scale fits it. */
	whole?: boolean;
	/** Topics a page points at, which the camera brings into view; null
	 *  points at none, and the camera returns to where it opened. */
	framed?: ReadonlySet<TopicHandle> | null;
	/** Told, whenever the frame changes, whether the map opens on the whole
	 *  course (it fits at a readable scale), so a page offers a zoom out only
	 *  when there is more to see. */
	onOpensWhole?: (fits: boolean) => void;
	/** The topic the map opens framed on; unset, where he is (the course's
	 *  current topic). A topic's page opens on its own topic (round 10,
	 *  3 m9: Invertible matrices' page opened on the top of the map,
	 *  without it). */
	opensOn?: TopicHandle | null;
	/** Shows another arc of the course, which a card's "From <arc>" line asks for; unset, that line is words only. */
	onOpenArc?: (arc: ArcHandle) => void;
	/** Where a drawing shorter than the frame sits: in its middle (Home), or at its top (the course page, beside its
	 *  list). */
	fitsDown?: "middle" | "top";
}) {
	const [shownArc, setShownArc] = useState(arc);
	// The arc the map just left, drawn beside the shown one while the camera glides over.
	const [trailArc, setTrailArc] = useState<ArcHandle | null>(null);
	if (shownArc !== arc) {
		setShownArc(arc);
		setTrailArc(!whole && shownArc && arc && !reducedMotion() ? shownArc : null);
	}
	const card = useCardBox(course);
	const { view, layout } = useMemo(() => drawingOf(course, arc, card.box), [course, arc, card.box]);
	const trail = useMemo(() => (trailArc && arc ? trailOf(course, trailArc, arc, layout) : null), [course, trailArc, arc, layout]);
	const endTravel = useCallback((from: ArcHandle) => setTrailArc((was) => (was === from ? null : was)), []);
	const map = view.map;
	const titleOf = useCallback((handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle, [map.topics]);
	const nodes = useMemo<Node[]>(
		() => [...topicNodes(map, view, layout, said, titleOf), ...(trail ? topicNodes(trail.view.map, trail.view, trail.layout, said, titleOf, trail) : [])],
		[map, said, layout, titleOf, view, trail],
	);
	const edges = useMemo<Edge[]>(() => mapEdges(layout, trail), [layout, trail]);
	// The course's own title for where he is, whichever arc is drawn (round 15, 2 free: "You are at eigen.").
	const here = course.current ? (course.topics.find((t) => t.handle === course.current)?.title ?? null) : null;
	const graph = useMemo<MapGraph>(
		() => ({ edges: map.edges, current: map.current, caption: `${map.title}: ${map.topics.length} topics, prerequisites above the topics that need them.${here ? ` You are at ${here}.` : ""}` }),
		[map.edges, map.current, map.title, map.topics.length, here],
	);
	return (
		<>
			<CardMap graph={graph} layout={layout} nodes={nodes} edges={edges} margin={margin} highlight={highlight} marked={marked} whole={whole} framed={framed} trail={trail} onTravelled={endTravel} onOpensWhole={onOpensWhole} opensOn={opensOn === undefined ? map.current : opensOn} onOpenArc={onOpenArc} fitsDown={fitsDown} />
			{card.measurer}
		</>
	);
}

/**
 * Every card's box on a course's map (canvas.md, Node): as wide as the
 * course's widest topic title needs on one line, `CANVAS_NODE` at the
 * least, so a title stays on one line and whole (Edo: map titles stay on
 * one line, and You are here and its next topics are whole; round 15, 1 m8
 * and 4 minor 11: "Random variables and distri…"). Each title is measured
 * in a hidden copy of its card's body (`CardContent`, `whole`), again once
 * the web fonts a formula needs have loaded. One box for the whole course,
 * so moving between its arcs no card changes size.
 */
function useCardBox(course: CourseMap): { box: NodeSize; measurer: React.ReactNode } {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState<number>(CANVAS_NODE.width);
	const titles = useMemo(() => [...new Set(course.topics.map((t) => t.title))], [course.topics]);
	const key = titles.join("\n");
	useLayoutEffect(() => {
		const box = ref.current;
		if (!box) return;
		let live = true;
		const measure = () => {
			if (!live) return;
			const widest = Math.max(0, ...[...box.children].map((card) => card.getBoundingClientRect().width));
			const next = Math.max(CANVAS_NODE.width, Math.ceil(widest));
			setWidth((was) => (was === next ? was : next));
		};
		measure();
		void document.fonts?.ready.then(measure);
		return () => {
			live = false;
		};
	}, [key]);
	const box = useMemo(() => ({ width, height: CANVAS_NODE.height }), [width]);
	const measurer = (
		<div ref={ref} aria-hidden="true" data-slot="map-card-measurer" className="pointer-events-none invisible fixed top-0 left-0 flex flex-col items-start">
			{titles.map((title) => (
				<BaseNode key={title} className="w-max border">
					<CardContent whole data={{ kind: "topic", title, topic: { level: "independent" }, standing: { fill: 1, slipping: false, words: "", short: "" } } as unknown as CardData} />
				</BaseNode>
			))}
		</div>
	);
	return { box, measurer };
}

/** What a map draws, whatever its cards are: a course's topics or a lesson's steps (topic-map.md, Node). */
export interface MapGraph {
	/** The needs between its cards: a topic's prerequisites, the steps a step rests on. */
	edges: readonly CourseMapEdge[];
	/** The ringed card: the keyboard's first stop, and what the page's highlight never recedes with the cards it
	 *  leads to. */
	current: TopicHandle | null;
	/** What a screen reader hears of the drawing. */
	caption: string;
}

type CardMapProps = {
	graph: MapGraph;
	layout: TopicMapLayout;
	nodes: Node[];
	edges: Edge[];
	margin?: { x: number; y: number };
	highlight?: ReadonlySet<TopicHandle> | null;
	marked?: TopicHandle | null;
	whole?: boolean;
	framed?: ReadonlySet<TopicHandle> | null;
	/** The arc the camera glides away from, drawn beside this one; null at rest. */
	trail?: Trail | null;
	onTravelled?: (from: ArcHandle) => void;
	onOpensWhole?: (fits: boolean) => void;
	/** The card the map opens framed on. */
	opensOn: TopicHandle | null;
	onOpenArc?: (arc: ArcHandle) => void;
	/** Where a drawing shorter than the frame sits: in its middle, or at its top (a lesson's steps, by the list's
	 *  first row). */
	fitsDown?: "middle" | "top";
};

/**
 * Every map's drawing (spec: topic-map.md, canvas/canvas.md): the cards on
 * the canvas, its lines, focus and dot grid, the camera that opens on
 * `opensOn` and follows the keyboard and the page, and the keyboard walk.
 * A course's map (`TopicMap`) and a lesson's step map (lesson-map.tsx)
 * both draw through it.
 */
export function CardMap({ margin = ROOM, highlight = null, marked = null, whole = false, framed = null, trail = null, fitsDown = "middle", ...props }: CardMapProps) {
	return (
		// The provider takes the drawing too, so a server render has it before any effect runs.
		<ReactFlowProvider initialNodes={props.nodes} initialEdges={props.edges}>
			<Flow {...props} margin={margin} highlight={highlight} marked={marked} whole={whole} framed={framed} trail={trail} fitsDown={fitsDown} />
		</ReactFlowProvider>
	);
}

const NO_TRAVEL = () => {};

function Flow({
	graph,
	layout,
	nodes,
	edges,
	margin: frameMargin,
	highlight,
	marked,
	whole,
	framed,
	trail,
	onTravelled = NO_TRAVEL,
	onOpensWhole,
	opensOn,
	onOpenArc,
	fitsDown,
}: Required<Pick<CardMapProps, "margin" | "highlight" | "marked" | "whole" | "framed" | "trail" | "fitsDown">> & Omit<CardMapProps, "margin" | "highlight" | "marked" | "whole" | "framed" | "trail" | "fitsDown">) {
	const captionId = useId();
	const margin = useMemo(() => ({ x: frameMargin.x, y: frameMargin.y + TAG_ROOM }), [frameMargin.x, frameMargin.y]);
	const flow = useReactFlow();
	const store = useStoreApi();
	const frameWidth = useStore((s) => s.width);
	const frameHeight = useStore((s) => s.height);

	const [active, setActive] = useState<TopicHandle | null>(null);
	const [tabStop, setTabStop] = useState<TopicHandle | null>(graph.current ?? layout.layers[0]?.[0] ?? null);
	const links = useRef(new Map<TopicHandle, HTMLAnchorElement>());
	// A hovered or focused topic's chain; else the page's highlight, with "You are here" and the topics it leads to
	// (Edo, 14 Nov 2026: they stay whole and readable; only topics further away recede).
	const lit = useMemo(() => {
		if (active) return chainOf(active, graph.edges);
		if (!highlight) return null;
		const here = graph.current;
		const next = here ? graph.edges.flatMap((e) => (e.kind === "needs" && e.prerequisite === here ? [e.topic] : [])) : [];
		return new Set([...highlight, ...(here ? [here] : []), ...next]);
	}, [active, graph.edges, graph.current, highlight]);

	const frame = frameWidth > 0 && frameHeight > 0 ? { width: frameWidth, height: frameHeight } : null;
	// Zoomed out as far as the whole course, however small: the enlarged map's Whole course.
	const fitted = frame ? Math.min(1, wholeZoom(layout, frame, margin)) : 1;
	// While the camera glides between arcs it may look anywhere and at any scale the two views need.
	const minZoom = trail ? Math.min(fitted, 0.1) : fitted;
	// As far as the camera may look: the room (in the frame's pixels) at the smallest scale the map shows, and one
	// topic past it for a pan or a follow (`slackOf`).
	const reach = useMemo(() => {
		const slack = slackOf(layout.node);
		const smallest = Math.min(READABLE_ZOOM, minZoom);
		return { x: margin.x / smallest + slack.x, y: margin.y / smallest + slack.y };
	}, [layout.node, margin.x, margin.y, minZoom]);
	const extent = useMemo<CoordinateExtent>(() => {
		// Held still while it fits, the map looks no further than the view that shows it whole, so zooming back out to
		// that view lands on it, centred.
		if (trail) return ANYWHERE;
		if (frameWidth > 0 && frameHeight > 0) return wholeExtent(layout, { width: frameWidth, height: frameHeight }, fitted);
		return [
			[-reach.x, -reach.y],
			[layout.width + reach.x, layout.height + reach.y],
		];
	}, [trail, frameWidth, frameHeight, fitted, layout, reach]);
	// All of it on screen: nothing to pan to, so only a pinch moves the map (topic-map.md, Held still while it fits).
	const zoomNow = useStore((s) => s.transform[2]);
	const still = frame !== null && showsWhole(zoomNow, fitted);
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
	/** The arc change the camera last glided for, so a render during the glide does not start it again. */
	const travelled = useRef<Trail | null>(null);
	/** What the follow reads when it fires, as of the last render. */
	const now = useRef({ layout, frame, frameMargin, reach, minZoom, current: graph.current, tag: TAG_ROOM });
	now.current = { layout, frame, frameMargin, reach, minZoom, current: graph.current, tag: TAG_ROOM };
	const [follower] = useState(() =>
		litFollow({
			plan: (lit) => {
				const { layout, frame, frameMargin, reach, minZoom, current, tag } = now.current;
				return frame ? litCamera(layout, flow.getViewport(), lit, frame, frameMargin, reach, minZoom, current, tag) : null;
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
		const camera = whole ? cameraAt(layout, [layout.width / 2, layout.height / 2], minZoom, size, margin) : framedCamera(layout, opensOn, size, frameMargin, TAG_ROOM, fitsDown);
		// Zooming out to the whole course and back glides; any other move is at once. Without a duration React Flow
		// sets the viewport synchronously; only its promise settles later.
		const glide = wasWhole.current !== whole && !reducedMotion();
		wasWhole.current = whole;
		opening.current = camera;
		follower.stay();
		const from = trail?.arc;
		if (trail && travelled.current !== trail) {
			// Another arc: the camera stays on the arc it left, now drawn beside this one, and glides over to this one.
			// React Flow takes the glide's bounds from its props only after this effect, so they are set first.
			travelled.current = trail;
			const was = flow.getViewport();
			store.getState().setMinZoom(minZoom);
			store.getState().setTranslateExtent(ANYWHERE);
			void flow.setViewport({ x: was.x - trail.dx * was.zoom, y: was.y - trail.dy * was.zoom, zoom: was.zoom });
			void flow.setViewport(camera, { duration: TRAVEL_MS, ease: easeInOut }).then(() => from && onTravelled(from));
		} else if (!trail) void flow.setViewport(camera, { duration: glide ? FOLLOW_MS : 0 });
		setPlaced(true);
	}, [flow, store, follower, layout, opensOn, frameWidth, frameHeight, margin, frameMargin, whole, minZoom, trail, onTravelled, fitsDown]);

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
			framed: pointedAt ? new Set(pointedAt) : null,
			tabStop,
			onActive: setActive,
			onFocus: (handle) => {
				setActive(handle);
				setTabStop(handle);
				// While the camera glides between arcs it is already on its way to this arc's opening view; a follow would
				// cut the glide short, and the arc it left would stay drawn.
				if (!trail && links.current.get(handle)?.matches(":focus-visible")) follow(handle);
			},
			onKeyDown: (handle, event: KeyboardEvent<HTMLAnchorElement>) => {
				if (!isWalkKey(event.key)) return;
				const next = neighbourOf(layout, graph.edges, handle, event.key);
				if (!next) return;
				event.preventDefault();
				setTabStop(next);
				links.current.get(next)?.focus({ preventScroll: true });
			},
			register: (handle, el) => {
				if (el) links.current.set(handle, el);
				else links.current.delete(handle);
			},
			openArc: onOpenArc,
			fade: frameMargin,
		}),
		[lit, marked, pointedAt, tabStop, layout, graph.edges, follow, onOpenArc, trail, frameMargin],
	);

	return (
		<figure data-slot="course-map-graph" aria-labelledby={captionId} className="relative min-h-0 flex-1">
			<figcaption id={captionId} className="sr-only">
				{graph.caption}
			</figcaption>
			<CanvasFrame edges={graph.edges} layout={layout}>
				<TopicMapContext.Provider value={state}>
					<ReactFlow
						nodes={nodes}
						edges={edges}
						nodeTypes={NODE_TYPES}
						edgeTypes={EDGE_TYPES}
						// No `colorMode="dark"`: its `dark` class on the wrapper would restate the old theme's tokens inside the map.
						// Hidden only until the frame is measured and the opening view set, in the same frame.
						className={cn(!placed && "invisible")}
						minZoom={minZoom}
						maxZoom={MAX_ZOOM}
						translateExtent={extent}
						panOnScroll={!still}
						panOnDrag={!still}
						// Held still, a scroll is the page's and a pinch still zooms.
						zoomOnScroll={!still}
						preventScrolling={!still}
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
					>
						<CanvasChrome />
					</ReactFlow>
				</TopicMapContext.Provider>
			</CanvasFrame>
		</figure>
	);
}

/** A drawing's topic cards: each topic the layout places, with what its card says and where a click goes. A `trail`
 *  (the arc the map is leaving) draws its cards beside the shown arc, out of the map's focus and keys. */
function topicNodes(
	map: CourseMap,
	view: ArcView,
	layout: TopicMapLayout,
	said: ReadonlyMap<TopicHandle, Said>,
	titleOf: (handle: TopicHandle) => string,
	trail: Trail | null = null,
): Node<CardData>[] {
	return map.topics.flatMap((topic) => {
		const placed = layout.topics.get(topic.handle);
		if (!placed) return [];
		const line = cardLine(said.get(topic.handle));
		const needs = map.edges.flatMap((e) => (e.kind === "needs" && e.topic === topic.handle ? [titleOf(e.prerequisite)] : []));
		const current = map.current === topic.handle;
		const data: CardData = {
			kind: "topic",
			handle: topic.handle,
			title: topic.title,
			topic,
			current,
			tag: current ? CURRENT_TAG : null,
			standing: standingOf(topic),
			line,
			label: topicLabel(topic, current, line),
			needs: needs.length ? `Needs ${needs.join(", ")}` : null,
			href: unitHref(map.workspace, topic.handle),
			from: view.entry.get(topic.handle) ?? null,
		};
		return [cardNode(data, placed, layout, trail)];
	});
}
