"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

export type DesignVariant = "current" | "proposed";

/** The study homes `/` can be, one per candidate (spec:
 *  components/study-home/study-home.md). */
export const HOME_OPTIONS = ["agenda"] as const;
/** "current" keeps `/` the composer; an option makes it that study home. */
export type HomeVariant = "current" | (typeof HOME_OPTIONS)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home is Current or one of its
 *  options, Sidebar Current or Proposed, and anything but Current wears
 *  Design's Proposed. Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", options: HOME_OPTIONS, requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", requires: { design: "proposed" } },
];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readHomeCurrent = (): HomeVariant => "current";
const readHome = (): HomeVariant => HOME_OPTIONS.find((option) => option === polishVariant("home")) ?? "current";
const readSidebar = (): DesignVariant => (polishVariant("sidebar") === "proposed" ? "proposed" : "current");

/** The one reader of the design switch: "proposed" only in development with the guide on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}

/** Which study home `/` is, or "current" while it stays the composer.
 *  Production builds get "current". */
export function useHomeVariant(): HomeVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readHome : readHomeCurrent, readHomeCurrent);
}

/** Whether the Proposed design's sidebar lists course topics ("proposed",
 *  spec: components/unit-inbox/unit-inbox.md) or stays as it is
 *  ("current"). Production builds get "current". */
export function useSidebarVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSidebar : readCurrent, readCurrent);
}
