import { Position, type Node } from "@xyflow/react";
import type { MapSkin } from "../map-skin";
import type { TopicMapLayout } from "../topic-map-layout";
import { TREE_SKIN } from "../canvas/canvas-skin";
import { arcRing } from "../arcs/arc-layout";
import { layoutBandsOrTree, type Band } from "./bands-layout";
import { BandNode, type BandFlowNode } from "./band-node";

/** Each drawing's chapters, kept beside the layout it was laid out with. */
const drawings = new WeakMap<TopicMapLayout, { bands: Band[]; margin: number }>();

/** The `bands` option (bands.md): the arcs as chapters top to bottom, the tree within and across them. */
export const BANDS_SKIN: MapSkin = {
	...TREE_SKIN,
	grouped: true,
	nodeTypes: { ...TREE_SKIN.nodeTypes, arcBand: BandNode },
	layout: (topics, edges, top, arcs) => {
		const { layout, bands, margin } = layoutBandsOrTree(topics, edges, top, arcs);
		drawings.set(layout, { bands, margin });
		return layout;
	},
	decorations: (map, layout) => {
		const drawn = drawings.get(layout);
		if (!drawn) return [];
		return drawn.bands.map(
			(band): BandFlowNode & Node => ({
				id: `band:${band.arc.handle}`,
				type: "arcBand",
				position: { x: 0, y: band.top },
				width: layout.width,
				height: band.bottom - band.top,
				zIndex: -1,
				handles: [{ type: "source", position: Position.Bottom, x: 0, y: 0 }],
				draggable: false,
				selectable: false,
				focusable: false,
				ariaRole: "none",
				data: { band, share: arcRing(map, band.arc.handle), margin: drawn.margin },
			}),
		);
	},
};
