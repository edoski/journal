"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant } from "@/components/dev/polish-switcher.js";

export type DesignVariant = "current" | "proposed";

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");

/** The one reader of the design switch: "proposed" only in development with the overlay on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}
