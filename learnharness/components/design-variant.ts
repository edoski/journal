import type { PolishGroup } from "@/components/dev/polish-variant.js";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): one entry per surface with a Proposed under review. Empty while
 *  none is; the Visual system shipped on 17 Nov 2026 (docs/visual-system.md),
 *  Stacked arcs as the only course map on 17 Nov 2026, and Road as the only
 *  course page on 17 Nov 2026. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	// The setup conversation's three directions (22 Nov 2026): ask first,
	// look first (Current), or set it up first. One is kept, the switch deleted.
	{ id: "setup", label: "Setup", options: ["ask", "build"] },
];
