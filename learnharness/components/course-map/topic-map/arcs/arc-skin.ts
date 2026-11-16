import { Position, type Node } from "@xyflow/react";
import type { MapSkin } from "../map-skin";
import type { TopicMapLayout } from "../topic-map-layout";
import { layoutCanvas } from "../canvas/canvas-layout";
import { TREE_SKIN, canvasEdges } from "../canvas/canvas-skin";
import { layoutArcRegions, arcRing, type ArcDrawing } from "./arc-layout";
import { ArcRegionNode, type ArcRegionFlowNode } from "./arc-region";
import type { CanvasLine } from "../canvas/canvas-lines";

/** Each drawing's arcs, kept beside the layout it was laid out with. */
const drawings = new WeakMap<TopicMapLayout, ArcDrawing>();

/** The id of an arc's node, apart from every topic's. */
const arcNode = (arc: string) => `arc:${arc}`;

/**
 * Canvas tree with the course's arcs as regions (arcs.md): every arc open
 * (`fold: false`, the `regions` option), or every arc but the one he is in
 * and the one a page shows or he opens folded to one card (`fold: true`,
 * the `overview` option). A course without arcs draws as Canvas tree.
 */
export function arcRegionsSkin(fold: boolean): MapSkin {
	return {
		...TREE_SKIN,
		grouped: true,
		nodeTypes: { ...TREE_SKIN.nodeTypes, arcRegion: ArcRegionNode },
		layout: (topics, edges, top, arcs) => {
			if (!arcs) return layoutCanvas(topics, edges, top);
			const { layout, drawing } = layoutArcRegions(topics, edges, fold ? arcs : { ...arcs, open: new Set(arcs.arcs.map((a) => a.handle)) });
			drawings.set(layout, drawing);
			return layout;
		},
		decorations: (map, layout) =>
			(drawings.get(layout)?.regions ?? []).map(
				(region): ArcRegionFlowNode & Node => ({
					id: arcNode(region.arc.handle),
					type: "arcRegion",
					position: { x: region.x, y: region.y },
					width: region.width,
					height: region.height,
					// Under the lines and cards it holds.
					zIndex: -1,
					handles: [
						{ type: "target", position: Position.Top, x: region.width / 2, y: 0 },
						{ type: "source", position: Position.Bottom, x: region.width / 2, y: region.height },
					],
					draggable: false,
					selectable: false,
					focusable: false,
					ariaRole: "none",
					data: { region, share: arcRing(map, region.arc.handle) },
				}),
			),
		edges: (_map, layout) => {
			const links = drawings.get(layout)?.links ?? [];
			const first = links[0];
			return canvasEdges(
				layout,
				links.map((link): CanvasLine => ({ key: `arc:${link.from}>${link.to}`, points: link.points, needs: link.needs })),
				first ? { source: arcNode(first.from), target: arcNode(first.to) } : null,
			);
		},
		handles: { source: Position.Bottom, target: Position.Top },
	};
}
