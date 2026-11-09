"use client";

import { useEffect } from "react";
import { POLISH_GROUPS } from "@/components/design-variant";
import { installPolishSwitcher } from "@/components/dev/polish-switcher.js";

/** The dev-only Current/Proposed overlay (polish skill), with Today's candidates under Proposed. The root layout mounts it only in development. */
export function PolishSwitcherMount() {
	useEffect(
		() =>
			installPolishSwitcher({
				groups: POLISH_GROUPS,
				// The app is dark only (owner, 9 Nov 2026): there is no light theme to switch to.
				appearance: { read: () => "dark", set: () => {}, subscribe: () => () => {} },
			}),
		[],
	);
	return null;
}
