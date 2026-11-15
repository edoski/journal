import type { ComponentType, ReactNode } from "react";
import { Position, type Edge, type EdgeTypes, type Node, type NodeTypes } from "@xyflow/react";
import type { CourseMap, CourseMapEdge, CourseMapTopic, TopicHandle } from "@/src/core";
import { layoutTopicMap, neighbourOf, TOPIC_NODE_SIZE, type TopicMapLayout, type WalkKey } from "./topic-map-layout";
import type { TopicFlowNode } from "./topic-node";
import { TopicNode } from "./topic-node";
import { NeedEdge } from "./need-edge";

/** What every topic node carries, whatever draws it: the topic, what its
 *  card says and where a click goes (`TopicMap` builds it once). */
export type TopicData = TopicFlowNode["data"];

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
	/** The drawing of a course's needs, `top` held in the first layer (an arc's entry topics). */
	layout: (topics: readonly CourseMapTopic[], edges: readonly CourseMapEdge[], top?: ReadonlySet<TopicHandle>) => TopicMapLayout;
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
