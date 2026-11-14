"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** Where the course page says how ready he is for the exam and which
 *  mistakes are still open (Edo, 14 Nov 2026). Current is the page as it
 *  is. Both candidates read the engine's `standing`:
 *  - `head`: the head's standing line answers "am I ready?", naming the
 *    arcs not ready as their bubbles, and a Mistakes press in the head
 *    opens the list;
 *  - `arcs`: the head says only whether he is ready, each arc's line says
 *    where it stands for the exam, and the mistakes are one quiet section
 *    under the list. */
export const STANDING_OPTIONS = ["head", "arcs"] as const;
export type StandingVariant = "current" | (typeof STANDING_OPTIONS)[number];

/** The course page's group for the Logbook's in-app guide (dev only). */
export const STANDING_GROUPS: readonly PolishGroup[] = [{ id: "standing", label: "Exam & mistakes", options: STANDING_OPTIONS }];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
function subscribeSwitch(onChange: () => void): () => void {
	const off = onPolishChange(onChange);
	window.addEventListener("polish:host", onChange);
	return () => {
		off();
		window.removeEventListener("polish:host", onChange);
	};
}
const readCurrent = (): StandingVariant => "current";
function readStanding(): StandingVariant {
	if (!(window as { polishHost?: unknown }).polishHost) return "current";
	const value = polishVariant("standing");
	return STANDING_OPTIONS.find((option) => option === value) ?? "current";
}

/** Which candidate the course page draws. Production builds draw Current
 *  until one ships. */
export function useStandingVariant(): StandingVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readStanding : readCurrent, readCurrent);
}
