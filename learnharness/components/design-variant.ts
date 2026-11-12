"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

export type DesignVariant = "current" | "proposed";

/** The study home's Explore candidates, the options of one group:
 *  A course cards, B an agenda, C one table. */
export const HOME_CANDIDATES = ["a", "b", "c"] as const;
export type HomeCandidate = (typeof HOME_CANDIDATES)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home is Current or one of its
 *  candidates, and any candidate wears Design's Proposed. Read only through
 *  the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", options: HOME_CANDIDATES, requires: { design: "proposed" } },
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
