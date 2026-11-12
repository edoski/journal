"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

export type DesignVariant = "current" | "proposed";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home and Sidebar are each Current
 *  or Proposed, and their Proposed wears Design's Proposed. Read only
 *  through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", requires: { design: "proposed" } },
];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readHome = (): DesignVariant => (polishVariant("home") === "proposed" ? "proposed" : "current");
const readSidebar = (): DesignVariant => (polishVariant("sidebar") === "proposed" ? "proposed" : "current");

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

/** Whether the Proposed design's sidebar lists course topics ("proposed",
 *  spec: components/unit-inbox/unit-inbox.md) or stays as it is
 *  ("current"). Production builds get "current". */
export function useSidebarVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSidebar : readCurrent, readCurrent);
}
