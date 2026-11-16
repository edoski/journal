"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ReactFlow, ReactFlowProvider, useReactFlow, useStore, useStoreApi, type CoordinateExtent, type Edge, type Node } from "@xyflow/react";
import type { ArcHandle, CourseMap, TopicHandle } from "@/src/core";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { cn } from "@/lib/utils";
import { READABLE_ZOOM, cameraAt, centreOf, chainOf, framedCamera, isWalkKey, showsWhole, slackOf, wholeExtent, wholeZoom, type Camera, type TopicMapLayout } from "./topic-map-layout";
import { TopicMapContext, type TopicMapState } from "./topic-node";
import { cardLine, standingOf, topicLabel } from "./topic-standing";
import type { Said } from "@/components/unit-inbox/sidebar-says";
import { litCamera, litFollow } from "./lit-camera";
import { drawingOf, handleAt, trailOf, type FrameProps, type MapSkin, type TopicData, type Trail } from "./map-skin";
import type { ArcView } from "./arc-view";
import { ArcOpenContext, type ArcOpen } from "./arcs/arc-open";
import { useMapSkin } from "./map-skins";

/** Room around the drawing: the least a topic at its edge can be brought
 *  in from the frame's edge, enough to clear a frame that fades. */
const ROOM = { x: 48, y: 32 };
/** How long the camera takes to follow the keyboard to a topic out of view, or a page to the topics it points at. */
const FOLLOW_MS = 200;
/** How long the camera takes to glide from one arc to the next (`MapSkin.travel`). */
const TRAVEL_MS = 420;
/** Every place the camera may look while it glides between arcs. */
const ANYWHERE: CoordinateExtent = [
	[-Infinity, -Infinity],
	[Infinity, Infinity],
];
/** The glide between arcs: eased in and out, as a camera moving between two fixed views. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
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
export function TopicMap(props: TopicMapProps) {
	// The map's one switch (map-style.ts): each style draws the same course, its own way.
	const { style, skin } = useMapSkin();
	return <SkinnedMap key={style} skin={skin} {...props} />;
}

type TopicMapProps = Parameters<typeof SkinnedMap>[0] extends infer P ? Omit<P, "skin"> : never;

function SkinnedMap({
	skin,
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
	opensOn,
	onOpenArc,
}: {
	skin: MapSkin;
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
	/** The topic the map opens framed on; unset, where he is (the course's
	 *  current topic). A topic's page opens on its own topic (round 10,
	 *  3 m9: Invertible matrices' page opened on the top of the map,
	 *  without it). */
	opensOn?: TopicHandle | null;
	/** Shows another arc of the course, which a card's "From <arc>" line asks for; unset, that line is words only. */
	onOpenArc?: (arc: ArcHandle) => void;
}) {
	// An arc he opens on the map (a `grouped` style's folded arc), until the page shows another.
	const [opened, setOpened] = useState<ArcHandle | null>(null);
	const [shownArc, setShownArc] = useState(arc);
	// The arc the map just left, drawn beside the shown one while the camera glides over (`travel`).
	const [trailArc, setTrailArc] = useState<ArcHandle | null>(null);
	if (shownArc !== arc) {
		setShownArc(arc);
		setOpened(null);
		setTrailArc(skin.travel && zoom === undefined && !whole && shownArc && arc && !reducedMotion() ? shownArc : null);
	}
	const drawing = useMemo(() => drawingOf(skin, course, arc, opened), [skin, course, arc, opened]);
	const { view, layout, framedArc } = drawing;
	const trail = useMemo(() => (trailArc && arc ? trailOf(skin, course, trailArc, arc, layout) : null), [skin, course, trailArc, arc, layout]);
	const endTravel = useCallback((from: ArcHandle) => setTrailArc((was) => (was === from ? null : was)), []);
	const map = view.map;
	const arcFramed = useMemo(() => (framedArc ? new Set(map.topics.filter((t) => t.arc === framedArc).map((t) => t.handle)) : null), [framedArc, map.topics]);
	const arcOpen = useMemo<ArcOpen>(() => ({ opened, open: setOpened, ownCamera: zoom === undefined, workspace: course.workspace }), [opened, zoom, course.workspace]);
	const titleOf = useCallback((handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle, [map.topics]);
	const nodes = useMemo<Node[]>(
		() => [
			...topicNodes(skin, map, view, layout, said, titleOf),
			...(trail ? topicNodes(skin, trail.view.map, trail.view, trail.layout, said, titleOf, trail) : []),
			...(skin.decorations?.(map, layout) ?? []),
		],
		[skin, map, said, layout, titleOf, view, trail],
	);
	const edges = useMemo<Edge[]>(
		() =>
			skin.edges?.(map, layout, trail) ??
			layout.routes.map((route) => ({
				id: `${route.prerequisite}>${route.topic}`,
				source: route.prerequisite,
				target: route.topic,
				type: skin.edgeType,
				data: { points: route.points },
				focusable: false,
				selectable: false,
				domAttributes: { "aria-hidden": true },
			})),
		[skin, map, layout, trail],
	);
	return (
		// The provider takes the drawing too, so a server render has it before any effect runs.
		<ReactFlowProvider initialNodes={nodes} initialEdges={edges}>
			<ArcOpenContext.Provider value={arcOpen}>
				<Flow skin={skin} map={map} layout={layout} nodes={nodes} edges={edges} titleOf={titleOf} margin={margin} highlight={highlight} marked={marked} zoom={zoom} whole={whole} framed={framed ?? arcFramed} trail={trail} onTravelled={endTravel} onOpensWhole={onOpensWhole} opensOn={opensOn === undefined ? map.current : opensOn} onOpenArc={onOpenArc} />
			</ArcOpenContext.Provider>
		</ReactFlowProvider>
	);
}

function Flow({
	skin,
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
	trail,
	onTravelled,
	onOpensWhole,
	opensOn,
	onOpenArc,
}: {
	skin: MapSkin;
	map: CourseMap;
	layout: TopicMapLayout;
	/** The arc the camera glides away from, drawn beside this one (`travel`); null at rest. */
	trail: Trail | null;
	onTravelled: (from: ArcHandle) => void;
	nodes: Node[];
	edges: Edge[];
	titleOf: (handle: TopicHandle) => string;
	margin: { x: number; y: number };
	highlight: ReadonlySet<TopicHandle> | null;
	marked: TopicHandle | null;
	zoom: number | undefined;
	whole: boolean;
	framed: ReadonlySet<TopicHandle> | null;
	onOpensWhole: ((fits: boolean) => void) | undefined;
	opensOn: TopicHandle | null;
	onOpenArc: ((arc: ArcHandle) => void) | undefined;
}) {
	const captionId = useId();
	const TAG_ROOM = skin.tagRoom;
	const margin = useMemo(() => ({ x: frameMargin.x, y: frameMargin.y + TAG_ROOM }), [frameMargin.x, frameMargin.y, TAG_ROOM]);
	const flow = useReactFlow();
	const store = useStoreApi();
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
	// While the camera glides between arcs it may look anywhere and at any scale the two views need.
	const minZoom = trail ? Math.min(fitted, 0.1) : fixedZoom === undefined ? fitted : Math.min(fitted, fixedZoom);
	// As far as the camera may look: the room (in the frame's pixels) at the smallest scale the map shows, and one
	// topic past it for a pan or a follow (`slackOf`).
	const reach = useMemo(() => {
		const slack = slackOf(layout.node);
		const smallest = Math.min(READABLE_ZOOM, minZoom);
		return { x: margin.x / smallest + slack.x, y: margin.y / smallest + slack.y };
	}, [layout.node, margin.x, margin.y, minZoom]);
	const extent = useMemo<CoordinateExtent>(() => {
		// A style held still while the map fits looks no further than the view that shows it whole, so zooming
		// back out to that view lands on it, centred.
		if (trail) return ANYWHERE;
		if (skin.fixedWhenFits && frameWidth > 0 && frameHeight > 0) return wholeExtent(layout, { width: frameWidth, height: frameHeight }, fitted);
		return [
			[-reach.x, -reach.y],
			[layout.width + reach.x, layout.height + reach.y],
		];
	}, [trail, skin.fixedWhenFits, frameWidth, frameHeight, fitted, layout, reach]);
	// All of it on screen: nothing to pan to, so only a pinch moves the map (`fixedWhenFits`).
	const zoomNow = useStore((s) => s.transform[2]);
	const still = skin.fixedWhenFits === true && frame !== null && showsWhole(zoomNow, fitted);
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
	const now = useRef({ layout, frame, frameMargin, reach, minZoom, current: map.current, tag: TAG_ROOM });
	now.current = { layout, frame, frameMargin, reach, minZoom, current: map.current, tag: TAG_ROOM };
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
		const middle: [number, number] = [layout.width / 2, layout.height / 2];
		const camera = whole
			? cameraAt(layout, middle, minZoom, size, margin)
			: fixedZoom === undefined
				? framedCamera(layout, opensOn, size, frameMargin, TAG_ROOM)
				: cameraAt(layout, middle, fixedZoom, size, margin);
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
	}, [flow, store, follower, layout, opensOn, frameWidth, frameHeight, margin, frameMargin, fixedZoom, whole, minZoom, TAG_ROOM, trail, onTravelled]);

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
				const next = skin.neighbour(layout, map.edges, handle, event.key);
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
		}),
		[lit, marked, tabStop, layout, map.edges, follow, skin, onOpenArc],
	);

	const current = map.current ? titleOf(map.current) : null;
	return (
		<figure data-slot="course-map-graph" aria-labelledby={captionId} className="relative min-h-0 flex-1">
			<figcaption id={captionId} className="sr-only">
				{`${map.title}: ${map.topics.length} topics, prerequisites above the topics that need them.`}
				{current ? ` You are at ${current}.` : ""}
			</figcaption>
			<SkinFrame skin={skin} map={map} layout={layout} nodes={nodes} margin={frameMargin} ownCamera={fixedZoom === undefined}>
				<TopicMapContext.Provider value={state}>
					<ReactFlow
						nodes={nodes}
						edges={edges}
						nodeTypes={skin.nodeTypes}
						edgeTypes={skin.edgeTypes}
						// No `colorMode="dark"`: its `dark` class on the wrapper would restate the old theme's tokens inside the map.
						// Hidden only until the frame is measured and the opening view set, in the same frame.
						className={cn(!placed && "invisible")}
						minZoom={minZoom}
						maxZoom={skin.maxZoom ?? 1}
						translateExtent={extent}
						panOnScroll={skin.panOnScroll && !still}
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
						{skin.Chrome && <skin.Chrome map={map} layout={layout} margin={frameMargin} ownCamera={fixedZoom === undefined} />}
					</ReactFlow>
				</TopicMapContext.Provider>
			</SkinFrame>
		</figure>
	);
}

/** The style's own frame around the drawing, or the drawing as it is. */
function SkinFrame({ skin, children, ...props }: Omit<FrameProps, "children"> & { skin: MapSkin; children: React.ReactNode }) {
	return skin.Frame ? <skin.Frame {...props}>{children}</skin.Frame> : children;
}

/** A drawing's topic nodes: each topic the layout places, with what its card says and where a click goes. A `trail`
 *  (the arc the map is leaving) draws its cards beside the shown arc, out of the map's focus and keys. */
function topicNodes(
	skin: MapSkin,
	map: CourseMap,
	view: ArcView,
	layout: TopicMapLayout,
	said: ReadonlyMap<TopicHandle, Said>,
	titleOf: (handle: TopicHandle) => string,
	trail: Trail | null = null,
): Node<TopicData>[] {
	const node = layout.node;
	return map.topics.flatMap((topic): Node<TopicData>[] => {
		const placed = layout.topics.get(topic.handle);
		if (!placed) return [];
		const line = cardLine(said.get(topic.handle));
		const needs = map.edges.flatMap((e) => (e.kind === "needs" && e.topic === topic.handle ? [titleOf(e.prerequisite)] : []));
		return [
			{
				id: trail ? `trail:${topic.handle}` : topic.handle,
				type: trail ? "trailTopic" : skin.topicType,
				position: { x: placed.x + (trail?.dx ?? 0), y: placed.y + (trail?.dy ?? 0) },
				width: node.width,
				height: node.height,
				// A server render has no measured handles; these let it draw the needs.
				handles: [
					{ type: "target" as const, position: skin.handles.target, ...handleAt(skin.handles.target, node) },
					{ type: "source" as const, position: skin.handles.source, ...handleAt(skin.handles.source, node) },
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
			},
		];
	});
}
