import type { PolishGroup } from "@/components/dev/polish-variant.js";
import { MAP_STYLE_OPTIONS } from "@/components/course-map/topic-map/map-style";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): one entry per surface with a Proposed under review. The Visual
 *  system shipped on 17 Nov 2026 (docs/visual-system.md). */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	// Every course map's candidates (topic-map/map-style.ts).
	{ id: "mapstyle", label: "Course map", options: MAP_STYLE_OPTIONS },
];
