"use client";

import { useEffect } from "react";
import { installPolishSwitcher } from "@/components/dev/polish-switcher.js";

/** The dev-only Current/Proposed overlay (polish skill). The root layout mounts it only in development. */
export function PolishSwitcherMount() {
	useEffect(
		() =>
			installPolishSwitcher({
				groups: [{ id: "design", label: "Design" }],
				// The app is dark only (owner, 9 Nov 2026): there is no light theme to switch to.
				appearance: { read: () => "dark", set: () => {}, subscribe: () => () => {} },
			}),
		[],
	);
	return null;
}
