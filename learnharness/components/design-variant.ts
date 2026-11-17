import type { PolishGroup } from "@/components/dev/polish-variant.js";
import { COURSE_PAGE_OPTIONS } from "@/components/course-page/course-page-variant";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): one entry per surface with a Proposed under review. The Visual
 *  system shipped on 17 Nov 2026 (docs/visual-system.md), and Stacked arcs
 *  as the only course map on 17 Nov 2026. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	// The course page's head and left column, and the topic page's head beside it (course-page/candidates/candidates.md).
	{ id: "coursepage", label: "Course page", options: COURSE_PAGE_OPTIONS },
];
