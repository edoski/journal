"use client";

import type { ComponentProps } from "react";
import { Chat } from "@/components/chat";
import { useLessonVariant, useLessonVariantKnown } from "@/components/lesson-variant";

/** The lesson page's one branch on the Lesson switch (lesson-variant.ts):
 *  Current draws today's lesson; each candidate draws the reading base. */
export function LessonView(props: Omit<ComponentProps<typeof Chat>, "lesson">) {
	const lesson = useLessonVariant();
	const known = useLessonVariantKnown();
	// Development draws nothing for the moment before the switch is known,
	// so only the picked lesson ever mounts; production knows at once.
	if (!known) return null;
	return lesson === "current" ? <Chat {...props} /> : <Chat {...props} lesson={lesson} />;
}
