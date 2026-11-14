"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** The course page's head candidates (spec:
 *  components/course-page/course-head/course-head.md): Pace leads with
 *  whether every topic fits before the exam, Brief with the course's own
 *  description and linked material. */
export const COURSE_HEAD_OPTIONS = ["pace", "brief"] as const;
export type CourseHeadVariant = "current" | (typeof COURSE_HEAD_OPTIONS)[number];
/** What production builds draw until Edo picks a candidate. */
const COURSE_HEAD_SHIPPED: CourseHeadVariant = "current";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only). Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [{ id: "course-head", label: "Course head", options: COURSE_HEAD_OPTIONS }];

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
const readShipped = (): CourseHeadVariant => COURSE_HEAD_SHIPPED;
function readCourseHead(): CourseHeadVariant {
	const value = polishVariant("course-head");
	return COURSE_HEAD_OPTIONS.find((option) => option === value) ?? "current";
}

/** Which course page head draws. Production builds draw the shipped one. */
export function useCourseHeadVariant(): CourseHeadVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readCourseHead : readShipped, readShipped);
}
