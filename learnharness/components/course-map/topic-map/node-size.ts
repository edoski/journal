import { useNodeVariant, type NodeVariant } from "@/components/design-variant";
import { NODE_SIZE, type NodeSize } from "./topic-map-layout";

/** Each node candidate's box (spec: topic-map.md, "Node switch"): the
 *  header and the ring are two lines, the header wide enough for the
 *  longest standing and a status on one line; the edge is one line, wide
 *  enough for a title and a status. */
export const NODE_SIZES: Record<NodeVariant, NodeSize> = {
	current: NODE_SIZE,
	header: { width: 256, height: 56 },
	ring: { width: 248, height: 56 },
	edge: { width: 272, height: 44 },
};

/** The box the Node switch draws topics in, for every page that lays the
 *  topic map out itself. */
export function useNodeSize(): NodeSize {
	return NODE_SIZES[useNodeVariant()];
}
