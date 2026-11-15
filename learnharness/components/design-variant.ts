"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** Home's Proposed (Edo's notes, 15 Nov 2026, N1; spec:
 *  components/study-home/study-home.md, "Width"): Home as wide as the
 *  course page's frame, each Today row on one topic saying where he stands
 *  on it. He picked it over the exam day the same day. */
export type HomeVariant = "current" | "proposed";
/** What production builds draw until Edo ships Proposed. */
const HOME_SHIPPED: HomeVariant = "current";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only). Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [{ id: "home", label: "Home" }];

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
const readShipped = (): HomeVariant => HOME_SHIPPED;
function readHome(): HomeVariant {
	return polishVariant("home") === "proposed" ? "proposed" : "current";
}

/** Which Home draws. Production builds draw the shipped one. */
export function useHomeVariant(): HomeVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readHome : readShipped, readShipped);
}
