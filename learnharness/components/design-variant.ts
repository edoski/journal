"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** Home's candidates (Edo's notes, 15 Nov 2026, N1; spec:
 *  components/study-home/study-home.md, "Width"): both widen Home to the
 *  course page's frame; `exam` gives each course's first Today row its
 *  exam day, `standing` gives a row on one topic where he stands on it. */
export const HOME_OPTIONS = ["exam", "standing"] as const;
export type HomeVariant = "current" | (typeof HOME_OPTIONS)[number];
/** What production builds draw until Edo picks a candidate. */
const HOME_SHIPPED: HomeVariant = "current";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only). Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [{ id: "home", label: "Home", options: HOME_OPTIONS }];

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
	const value = polishVariant("home");
	return HOME_OPTIONS.find((option) => option === value) ?? "current";
}

/** Which Home draws. Production builds draw the shipped one. */
export function useHomeVariant(): HomeVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readHome : readShipped, readShipped);
}
