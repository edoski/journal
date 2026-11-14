"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** How a lesson reads (research: the lesson in the chat body, 14 Nov 2026).
 *  Current is today's lesson screen. Both candidates share the reading
 *  base (the T3-style composer, the narrower column, figures in the flow)
 *  and differ in how a question lives in it:
 *  - `prose`: the tutor asks in its own words and the composer answers;
 *  - `slot`: each question owns an answer field in the flow. */
export const LESSON_OPTIONS = ["prose", "slot"] as const;
export type LessonVariant = "current" | (typeof LESSON_OPTIONS)[number];

/** The switch registry the Logbook's in-app guide switches (dev only). Read
 *  only through the hook below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [{ id: "lesson", label: "Lesson", options: LESSON_OPTIONS }];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
/** A switch moved, or the guide registered the groups: before it does, a
 *  group's options read as Current, so a page drawn before then reads again
 *  once they are known. */
function subscribeSwitch(onChange: () => void): () => void {
	const off = onPolishChange(onChange);
	window.addEventListener("polish:host", onChange);
	return () => {
		off();
		window.removeEventListener("polish:host", onChange);
	};
}
const readCurrent = (): LessonVariant => "current";
const readUnknown = (): LessonVariant | null => null;
function readLesson(): LessonVariant | null {
	// Until the guide registers the groups the switch can't be read, and a
	// lesson drawn as Current for that frame runs Current's effects (its
	// question box once cleared a Prose draft kept for a reload).
	if (!(window as { polishHost?: unknown }).polishHost) return null;
	const value = polishVariant("lesson");
	return LESSON_OPTIONS.find((option) => option === value) ?? "current";
}

/** Which lesson to draw; null in development until the switch can be read.
 *  Production builds draw Current until one ships. */
export function useLessonVariant(): LessonVariant | null {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readLesson : readCurrent, DEV ? readUnknown : readCurrent);
}
