"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

export type DesignVariant = "current" | "proposed";

/** The study home's Explore candidates, the options of one group:
 *  A course cards, B an agenda, C one table. */
export const HOME_CANDIDATES = ["a", "b", "c"] as const;
export type HomeCandidate = (typeof HOME_CANDIDATES)[number];

/** The sidebar's Explore candidates, each a study inbox of course topics
 *  holding their sessions: Outline expands a topic in place, Page opens
 *  the topic's page. */
export const SIDEBAR_CANDIDATES = ["outline", "page"] as const;
export type SidebarCandidate = (typeof SIDEBAR_CANDIDATES)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home is Current or one of its
 *  candidates, and any candidate wears Design's Proposed. Read only through
 *  the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", options: HOME_CANDIDATES, requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", options: SIDEBAR_CANDIDATES, requires: { design: "proposed" } },
];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readNoCandidate = (): HomeCandidate | null => null;
const readCandidate = (): HomeCandidate | null => HOME_CANDIDATES.find((c) => polishVariant("home") === c) ?? null;

/** The one reader of the design switch: "proposed" only in development with the guide on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}

/** Which study home candidate `/` shows: the Home group's choice, else
 *  none, and `/` stays the composer. Production builds get none. */
export function useHomeCandidate(): HomeCandidate | null {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readCandidate : readNoCandidate, readNoCandidate);
}

const readNoSidebar = (): SidebarCandidate | null => null;
const readSidebar = (): SidebarCandidate | null => SIDEBAR_CANDIDATES.find((c) => polishVariant("sidebar") === c) ?? null;

/** Which sidebar candidate the Proposed design mounts, else none and the
 *  Proposed sidebar stays as it is. Production builds get none. */
export function useSidebarCandidate(): SidebarCandidate | null {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSidebar : readNoSidebar, readNoSidebar);
}
