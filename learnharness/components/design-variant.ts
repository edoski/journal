"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

export type DesignVariant = "current" | "proposed";

/** The sidebar's Explore candidates, each a study inbox of course topics
 *  holding their sessions: Outline expands a topic in place, Page opens
 *  the topic's page, Resume opens its latest session. */
export const SIDEBAR_CANDIDATES = ["outline", "page", "resume"] as const;
export type SidebarCandidate = (typeof SIDEBAR_CANDIDATES)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home is Current or Proposed, and
 *  its Proposed wears Design's Proposed. Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", options: SIDEBAR_CANDIDATES, requires: { design: "proposed" } },
];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readHome = (): DesignVariant => (polishVariant("home") === "proposed" ? "proposed" : "current");

/** The one reader of the design switch: "proposed" only in development with the guide on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}

/** Whether `/` is the study home ("proposed") or stays the composer
 *  ("current"). Production builds get "current". */
export function useHomeVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readHome : readCurrent, readCurrent);
}

const readNoSidebar = (): SidebarCandidate | null => null;
const readSidebar = (): SidebarCandidate | null => SIDEBAR_CANDIDATES.find((c) => polishVariant("sidebar") === c) ?? null;

/** Which sidebar candidate the Proposed design mounts, else none and the
 *  Proposed sidebar stays as it is. Production builds get none. */
export function useSidebarCandidate(): SidebarCandidate | null {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSidebar : readNoSidebar, readNoSidebar);
}
