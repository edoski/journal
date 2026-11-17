import React from "react";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import type { CourseMapTopic } from "../../src/core/contracts/course-map.ts";
import { CanvasNode, type CanvasFlowNode } from "../../components/course-map/topic-map/canvas/canvas-node.tsx";
import type { CardFact, Standing } from "../../components/course-map/topic-map/topic-standing.ts";

/** One card of the course map as the map draws it, outside a map: its topic, where he stands and its line. */
export function MapCard({ topic, standing, line }: { topic: CourseMapTopic; standing: Standing; line: CardFact | null }) {
	const props = { data: { topic, current: false, standing, line, label: topic.title, needs: null, href: "/", from: null } } as unknown as NodeProps<CanvasFlowNode>;
	return (
		<ReactFlowProvider>
			<CanvasNode {...props} />
		</ReactFlowProvider>
	);
}
