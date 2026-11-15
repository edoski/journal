import type { ComponentType, ReactNode } from "react";
import { Position, type Edge, type EdgeTypes, type Node, type NodeTypes } from "@xyflow/react";
import { currentArc, type ArcHandle, type CourseMap, type CourseMapArc, type CourseMapEdge, type CourseMapTopic, type TopicHandle } from "@/src/core";
import { arcView, type ArcView } from "./arc-view";
import { layoutTopicMap, neighbourOf, TOPIC_NODE_SIZE, type TopicMapLayout, type WalkKey } from "./topic-map-layout";
import type { TopicFlowNode } from "./topic-node";
import { TopicNode } from "./topic-node";
import { NeedEdge } from "./need-edge";

/** What every topic node carries, whatever draws it: the topic, what its
 *  card says and where a click goes (`TopicMap` builds it once). */
export type TopicData = TopicFlowNode["data"];

/** What a style that marks a course's arcs lays out with its topics: the
 *  arcs in study order, the ones drawn open (`grouped` styles that fold an
 *  arc to one card), and the arc of "You are here". */
export interface ArcsShown {
	arcs: readonly CourseMapArc[];
	open: ReadonlySet<ArcHandle>;
	current: ArcHandle | null;
}

/** What a map style draws inside React Flow, beside its topics. */
export interface ChromeProps {
	map: CourseMap;
	layout: TopicMapLayout;
	/** The map moves its own camera; false when a page scrolls it (the course page). */
	ownCamera: boolean;
	/** How far the page's fade reaches in, so nothing a style sets sits in the fade. */
	margin: { x: number; y: number };
}

/** What a style's frame gets: the course, its topic nodes, and the drawing to place. */
export interface FrameProps extends ChromeProps {
	nodes: readonly Node[];
	children: ReactNode;
}

/**
 * One way to draw a course map (map-style.ts): its geometry, its node and
 * edge components, and anything it adds around them. The map's camera,
 * framing, follow, highlight and keyboard focus are shared, so every style
 * opens on "You are here" with its next topics whole, on every page.
 */
export interface MapSkin {
	/** The drawing of a course's needs, `top` held in the first layer (an arc's entry topics); a `grouped` style
	 *  gets the course's arcs. */
	layout: (topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], top?: ReadonlySet<TopicHandle>, arcs?: ArcsShown) => TopicMapLayout;
	/** It draws the whole course with its arcs marked off, never one arc alone: the arc a page shows is framed (and
	 *  opened, where the style folds arcs), and the arc strip gives way to the map. */
	grouped?: boolean;
	nodeTypes: NodeTypes;
	edgeTypes: EdgeTypes;
	/** The node type each topic is drawn with, and the edge type each route. */
	topicType: string;
	edgeType: string;
	/** Where a route leaves its first topic and reaches its second. */
	handles: { source: Position; target: Position };
	/** Room the "You are here" tag takes above its node. */
	tagRoom: number;
	/** The edges it draws, when not one per need along the layout's routes
	 *  (`routes` stay the needs: the camera frames a topic's next topics by them). */
	edges?: (map: CourseMap, layout: TopicMapLayout) => Edge[];
	/** Nodes that are not topics (arc regions, headers), placed in the drawing. */
	decorations?: (map: CourseMap, layout: TopicMapLayout) => Node[];
	/** Where an arrow key goes from a topic; null at the drawing's edge. */
	neighbour: (layout: TopicMapLayout, edges: readonly CourseMapEdge[], handle: TopicHandle, key: WalkKey) => TopicHandle | null;
	/** Wraps the drawing in the map's frame, for a style that holds state its nodes share (a focus). */
	Frame?: ComponentType<FrameProps>;
	/** Drawn inside React Flow over the topics (a background). */
	Chrome?: ComponentType<ChromeProps>;
	/** Whether a scroll pans (a canvas) and a pinch zooms. */
	panOnScroll: boolean;
}

/** Where a handle sits on a node of a given size. */
export function handleAt(position: Position, size: { width: number; height: number }): { x: number; y: number } {
	if (position === Position.Top) return { x: size.width / 2, y: 0 };
	if (position === Position.Bottom) return { x: size.width / 2, y: size.height };
	if (position === Position.Left) return { x: 0, y: size.height / 2 };
	return { x: size.width, y: size.height / 2 };
}

/** The map as it is (topic-map.md): layered cards, top to bottom. */
export const CURRENT_SKIN: MapSkin = {
	layout: (topics, edges, top) => layoutTopicMap(topics, edges, TOPIC_NODE_SIZE, top),
	nodeTypes: { topic: TopicNode },
	edgeTypes: { need: NeedEdge },
	topicType: "topic",
	edgeType: "need",
	handles: { source: Position.Bottom, target: Position.Top },
	tagRoom: 20,
	neighbour: neighbourOf,
	panOnScroll: true,
};

/** What a map draws for a page: one arc of the course (`arcView`), or, for
 *  a `grouped` style in a course with arcs, the whole course with the arc
 *  of "You are here" and the arc the page shows (or `opened` on the map)
 *  open; `framedArc` is that arc when it is not where he is, which the
 *  camera brings into view. Pure. */
export function drawingOf(skin: MapSkin, course: CourseMap, arc: ArcHandle | undefined, opened: ArcHandle | null = null): { view: ArcView; layout: TopicMapLayout; framedArc: ArcHandle | null } {
	if (!skin.grouped || !course.arcs || course.arcs.length < 2) {
		const view = arcView(course, arc);
		return { view, layout: skin.layout(view.map.topics, view.map.edges, new Set(view.entry.keys())), framedArc: null };
	}
	const current = currentArc(course);
	const shown = opened ?? (arc && course.arcs.some((a) => a.handle === arc) ? arc : null);
	const open = new Set([current, shown].filter((a): a is ArcHandle => a !== null));
	return {
		view: { map: course, entry: new Map() },
		layout: skin.layout(course.topics, course.edges, new Set(), { arcs: course.arcs, open, current }),
		framedArc: shown !== current ? shown : null,
	};
}
