"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant } from "@/components/dev/polish-variant.js";

/** The course page's candidates, the switch registry's `coursepage` group
 *  (design-variant.ts), each in its own folder under `candidates/` with its
 *  spec. Current is the page as it is. Every candidate reads the same
 *  course, draws the same map and opens the same pages. */
export const COURSE_PAGE_OPTIONS = ["overview", "agenda", "road", "roadrows"] as const;
export type CoursePageVariant = "current" | (typeof COURSE_PAGE_OPTIONS)[number];

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
const readCurrent = (): CoursePageVariant => "current";
function readVariant(): CoursePageVariant {
	const value = polishVariant("coursepage");
	return COURSE_PAGE_OPTIONS.find((option) => option === value) ?? "current";
}

/** Which candidate the course page and the topic page's head draw.
 *  Production builds draw Current until one ships. */
export function useCoursePageVariant(): CoursePageVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readVariant : readCurrent, readCurrent);
}
