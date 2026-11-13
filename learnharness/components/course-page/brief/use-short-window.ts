"use client";

import { useSyncExternalStore } from "react";

/** Below this height the answers show two topics each, so the map keeps a
 *  full layer of topics: 1100x700 is short, 1440x900 is not. */
const SHORT = "(max-height: 760px)";

function subscribe(onChange: () => void): () => void {
	const query = window.matchMedia(SHORT);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

/** Whether the window is short (spec: brief-course.md), kept as it is
 *  resized; false while the server draws. */
export function useShortWindow(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(SHORT).matches,
		() => false,
	);
}
