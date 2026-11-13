"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

export type DesignVariant = "current" | "proposed";

/** Home's overview candidates (spec:
 *  components/study-home/home-map.md, "Overview switch"). */
export const OVERVIEW_OPTIONS = ["follow"] as const;
/** "current" keeps Home's map behind course tabs; "follow" shows the
 *  course of the Today row he points at. */
export type OverviewVariant = "current" | (typeof OVERVIEW_OPTIONS)[number];

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
 *  only): Design is Current or Proposed; Home is the composer or the study
 *  home, Sidebar Current or Proposed, and anything but Current wears
 *  Design's Proposed; Node is the topic map's node as it was or
 *  one of its candidates, wherever the topic map draws; Overview is Home's
 *  map behind tabs or following the pointed row; Link is the topic page's
 *  panes as they are or one of its options. Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", requires: { design: "proposed" } },
	{ id: "node", label: "Node", options: NODE_OPTIONS, requires: { design: "proposed" } },
	{ id: "overview", label: "Overview", options: OVERVIEW_OPTIONS, requires: { design: "proposed", home: "proposed" } },
	{ id: "link", label: "Link", options: LINK_OPTIONS, requires: { design: "proposed" } },
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
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readHome = (): DesignVariant => (polishVariant("home") === "proposed" ? "proposed" : "current");
const readLinkCurrent = (): LinkVariant => "current";
const readLink = (): LinkVariant => LINK_OPTIONS.find((option) => option === polishVariant("link")) ?? "current";
const readSidebar = (): DesignVariant => (polishVariant("sidebar") === "proposed" ? "proposed" : "current");
const readOverviewCurrent = (): OverviewVariant => "current";
const readOverview = (): OverviewVariant => OVERVIEW_OPTIONS.find((option) => option === polishVariant("overview")) ?? "current";
const readNodeCurrent = (): NodeVariant => "current";
const readNode = (): NodeVariant => NODE_OPTIONS.find((option) => option === polishVariant("node")) ?? "current";

/** The one reader of the design switch: "proposed" only in development with the guide on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}

/** Whether `/` is the study home ("proposed", spec:
 *  components/study-home/study-home.md) or the composer ("current").
 *  Production builds get "current". */
export function useHomeVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readHome : readCurrent, readCurrent);
}

/** Whether the Proposed design's sidebar lists course topics ("proposed",
 *  spec: components/unit-inbox/unit-inbox.md) or stays as it is
 *  ("current"). Production builds get "current". */
export function useSidebarVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readSidebar : readCurrent, readCurrent);
}

/** Which node the topic map draws, or "current" for the node as it was.
 *  Production builds get "current". */
export function useNodeVariant(): NodeVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readNode : readNodeCurrent, readNodeCurrent);
}

/** How Home's map picks its course: behind tabs ("current") or following
 *  the Today row he points at ("follow"). Production builds get "current". */
export function useOverviewVariant(): OverviewVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readOverview : readOverviewCurrent, readOverviewCurrent);
}

/** How the hybrid topic page ties its list to the lesson map, or "current"
 *  for nothing between them. Production builds get "current". */
export function useLinkVariant(): LinkVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readLink : readLinkCurrent, readLinkCurrent);
}
