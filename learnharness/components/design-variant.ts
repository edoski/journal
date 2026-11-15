"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** The visual system's Proposed (Edo, 15 Nov 2026; docs/visual-system.md):
 *  macOS's own text styles as the type scale, dialog titles as page titles,
 *  one icon line weight, and the course's badge on Today's rows. Type
 *  switches in CSS: every use names its macOS style and keeps Current's
 *  classes under the `system-current:` variant (app/globals.css). */
export type SystemVariant = "current" | "proposed";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only). Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "system", label: "Visual system" },
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
/** What production builds draw until Edo ships Proposed. */
const readShipped = (): "current" => "current";
const readSystem = (): SystemVariant => (polishVariant("system") === "proposed" ? "proposed" : "current");

/** Which visual system draws. Production builds draw the shipped one. */
export function useSystemVariant(): SystemVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readSystem : readShipped, readShipped);
}
