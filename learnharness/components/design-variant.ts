"use client";

import { useSyncExternalStore } from "react";
import { definePolishGroups, onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-switcher.js";

export type DesignVariant = "current" | "proposed";

/** Today's waiting-work candidates under Proposed (polish Explore): A one
 *  next step, B one line per course, C suggestions under the composer. */
export const TODAY_VARIANTS = ["a", "b", "c"] as const;
export type TodayVariant = (typeof TODAY_VARIANTS)[number];

/** The switch registry: one group per surface. Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "today", label: "Today", variants: TODAY_VARIANTS.map((v) => `proposed-${v}`), fallback: "proposed-a" },
];
definePolishGroups(POLISH_GROUPS);

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readTodayDefault = (): TodayVariant => "a";
const readToday = (): TodayVariant => TODAY_VARIANTS.find((v) => polishVariant("today") === `proposed-${v}`) ?? "a";

/** The one reader of the design switch: "proposed" only in development with the overlay on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}

/** Which Today candidate Proposed shows: the overlay's choice in development, A otherwise. */
export function useTodayVariant(): TodayVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readToday : readTodayDefault, readTodayDefault);
}
