"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** The topic map's node candidates, three card interiors (spec:
 *  components/course-map/topic-map/topic-map.md, "Node switch"): where
 *  he stands on top of the title, a ring beside it, or the card's edge
 *  filling as he learns. */
export const NODE_OPTIONS = ["header", "ring", "edge"] as const;
/** "current" keeps the node as the topic map drew it first. */
export type NodeVariant = "current" | (typeof NODE_OPTIONS)[number];

/** How the hybrid topic page ties its list to the lesson map (spec: components/unit-inbox/topic-page/link/link.md). */
export const LINK_OPTIONS = ["split", "connected"] as const;
/** "current" keeps the two panes side by side with nothing between them. */
export type LinkVariant = "current" | (typeof LINK_OPTIONS)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Node is the topic map's node as it was or one of its candidates,
 *  wherever the topic map draws; Link is the topic page's panes as they are
 *  or one of its options. Every other surface has one version. Read only
 *  through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "node", label: "Node", options: NODE_OPTIONS },
	{ id: "link", label: "Link", options: LINK_OPTIONS },
];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
/** A switch moved, or the guide registered the groups: before it does, a
 *  group's options read as Current, so a page drawn before then reads
 *  again once they are known. */
function subscribeSwitch(onChange: () => void): () => void {
	const off = onPolishChange(onChange);
	window.addEventListener("polish:host", onChange);
	return () => {
		off();
		window.removeEventListener("polish:host", onChange);
	};
}
const readLinkCurrent = (): LinkVariant => "current";
const readLink = (): LinkVariant => LINK_OPTIONS.find((option) => option === polishVariant("link")) ?? "current";
const readNodeCurrent = (): NodeVariant => "current";
const readNode = (): NodeVariant => NODE_OPTIONS.find((option) => option === polishVariant("node")) ?? "current";

/** Which node the topic map draws, or "current" for the node as it was.
 *  Production builds get "current". */
export function useNodeVariant(): NodeVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readNode : readNodeCurrent, readNodeCurrent);
}

/** How the hybrid topic page ties its list to the lesson map, or "current"
 *  for nothing between them. Production builds get "current". */
export function useLinkVariant(): LinkVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readLink : readLinkCurrent, readLinkCurrent);
}
