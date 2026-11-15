"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant } from "@/components/dev/polish-variant.js";

/** The course map's candidates, the switch registry's `mapstyle` group
 *  (design-variant.ts). Current is the map as it is. Every candidate reads
 *  the same course record, says the same words and opens the same pages:
 *  - `tree`: Canvas tree, the canvas drawing only the needs no longer path
 *    implies (canvas/canvas.md; Edo's pick, 16 Nov 2026);
 *  - `regions`: Canvas tree with each arc a numbered, tinted region holding
 *    its topics, one line between arcs (regions/regions.md);
 *  - `bands`: the arcs as chapters top to bottom in study order, each
 *    numbered in the margin, a hairline between (bands/bands.md). */
export const MAP_STYLE_OPTIONS = ["tree", "regions", "bands"] as const;
export type MapStyle = "current" | (typeof MAP_STYLE_OPTIONS)[number];

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
const readCurrent = (): MapStyle => "current";
function readStyle(): MapStyle {
	const value = polishVariant("mapstyle");
	return MAP_STYLE_OPTIONS.find((option) => option === value) ?? "current";
}

/** Which candidate every course map draws. Production builds draw Current
 *  until one ships. */
export function useMapStyle(): MapStyle {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readStyle : readCurrent, readCurrent);
}
