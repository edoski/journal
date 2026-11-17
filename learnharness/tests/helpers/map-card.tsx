import React from "react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import type { CourseMapTopic } from "../../src/core/contracts/course-map.ts";
import { CanvasNode, type CanvasFlowNode } from "../../components/course-map/topic-map/canvas/canvas-node.tsx";
import type { CardFact, Standing } from "../../components/course-map/topic-map/topic-standing.ts";
import type { TopicData } from "../../components/course-map/topic-map/topic-node.tsx";

/** One card of the course map as the map draws it, outside a map: its topic, where he stands and its line. */
export function MapCard({ topic, standing, line }: { topic: CourseMapTopic; standing: Standing; line: CardFact | null }) {
	const data: TopicData = { kind: "topic", handle: topic.handle, title: topic.title, topic, current: false, tag: null, standing, line, label: topic.title, needs: null, href: "/", from: null };
	const props = { data } as unknown as NodeProps<CanvasFlowNode>;
	return (
		<ReactFlowProvider>
			<CanvasNode {...props} />
		</ReactFlowProvider>
	);
}
