import type { Node } from "@xyflow/react";
import type { MapSkin } from "../map-skin";
import type { TopicMapLayout } from "../topic-map-layout";
import { TREE_SKIN, canvasEdges } from "../canvas/canvas-skin";
import { CANVAS_NODE } from "../canvas/canvas-layout";
import type { CanvasLine } from "../canvas/canvas-lines";
import { layoutNeighbours, PEEK, type NeighbourDrawing } from "./neighbours-layout";
import { NeighbourBandNode, NeighbourCardNode, type NeighbourBandFlowNode, type NeighbourCardFlowNode } from "./neighbour-nodes";
import { NeighboursFrame } from "./neighbours-frame";

/** Each drawing's neighbours, kept beside the layout they were laid out with. */
const drawings = new WeakMap<TopicMapLayout, NeighbourDrawing>();

/** The neighbours laid out with a drawing, if it has any. */
export function drawingOfLayout(layout: TopicMapLayout): NeighbourDrawing | undefined {
	return drawings.get(layout);
}

/** A neighbour's card, apart from every topic's node. */
const cardNode = (handle: string) => `near:${handle}`;

/** The `neighbours` option (neighbours.md): Canvas tree's one arc between faded bands for the arcs before and after. */
export const NEIGHBOURS_SKIN: MapSkin = {
	...TREE_SKIN,
	nodeTypes: { ...TREE_SKIN.nodeTypes, neighbourBand: NeighbourBandNode, neighbourCard: NeighbourCardNode },
	around: (course, view, arc, base) => {
		const laid = layoutNeighbours(course, view, arc, base);
		if (!laid) return base;
		drawings.set(laid.layout, laid.drawing);
		return laid.layout;
	},
	decorations: (_map, layout) => {
		const drawing = drawings.get(layout);
		if (!drawing) return [];
		return drawing.bands.flatMap((band): Node[] => {
			const pad = 16;
			const left = Math.min(0, ...band.cards.map((c) => c.x)) - pad;
			const right = Math.max(layout.width, ...band.cards.map((c) => c.x + CANVAS_NODE.width)) + pad;
			const bandNode: NeighbourBandFlowNode & Node = {
				id: `band:${band.arc.handle}`,
				type: "neighbourBand",
				position: { x: left, y: band.top - (band.side === "before" ? 0 : 8) },
				width: right - left,
				height: band.bottom - band.top + 8,
				zIndex: -1,
				draggable: false,
				selectable: false,
				focusable: false,
				ariaRole: "none",
				data: { band },
			};
			const cards = band.cards.map(
				(card): NeighbourCardFlowNode & Node => ({
					id: cardNode(card.topic.handle),
					type: "neighbourCard",
					// The band shows `PEEK` of each card: the arc before's bottom, the arc after's top.
					position: { x: card.x, y: band.side === "before" ? card.y + CANVAS_NODE.height - PEEK.before : card.y },
					width: CANVAS_NODE.width,
					height: PEEK[band.side],
					draggable: false,
					selectable: false,
					focusable: false,
					ariaRole: "none",
					data: { topic: card.topic, arc: band.arc.handle, arcTitle: band.arc.title, side: band.side },
				}),
			);
			return [bandNode, ...cards];
		});
	},
	edges: (_map, layout) => {
		const drawing = drawings.get(layout);
		const faded = (drawing?.lines ?? []).map((l): CanvasLine => ({ key: `near:${l.prerequisite}>${l.topic}`, points: l.points, prerequisite: l.prerequisite, topic: l.topic, faded: true }));
		const first = drawing?.bands[0]?.cards[0];
		return canvasEdges(layout, faded, first ? { source: cardNode(first.topic.handle), target: cardNode(first.topic.handle) } : null);
	},
	Frame: NeighboursFrame,
};
