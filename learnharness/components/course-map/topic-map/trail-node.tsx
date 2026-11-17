"use client";

import type { NodeProps } from "@xyflow/react";
import { TopicMapContext } from "./topic-node";
import { CanvasContext } from "./canvas/canvas-context";
import { CanvasNode, type CanvasFlowNode } from "./canvas/canvas-node";

/**
 * A card of the arc the map is leaving, drawn as the map draws a card while
 * the camera glides away (topic-map.md, Arcs): out of the map's focus, keys and links,
 * so it never takes the shown arc's place in them.
 */
export function TrailNode(props: NodeProps<CanvasFlowNode>) {
	return (
		<div inert aria-hidden="true" data-slot="course-map-trail" className="size-full">
			<TopicMapContext.Provider value={null}>
				<CanvasContext.Provider value={null}>
					<CanvasNode {...props} />
				</CanvasContext.Provider>
			</TopicMapContext.Provider>
		</div>
	);
}
