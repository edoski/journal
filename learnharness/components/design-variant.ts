"use client";

import { useSyncExternalStore } from "react";
import { definePolishGroups, onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-switcher.js";

export type DesignVariant = "current" | "proposed";

/** The switch registry: one group per surface. Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
];
definePolishGroups(POLISH_GROUPS);

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");

/** The one reader of the design switch: "proposed" only in development with the overlay on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}

