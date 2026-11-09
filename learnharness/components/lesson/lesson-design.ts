"use client";

import { createContext, useContext } from "react";
import type { DesignVariant } from "@/components/design-variant";

/** What the lesson's registry-rendered parts (artifact cards, practice
 *  cards) need from the session: the design, read once at the top of the
 *  session by Chat from useDesignVariant(), and the problem the practice
 *  dock currently shows (its transcript card stays out of the column, so
 *  the problem reads once). Parts Chat renders directly take a `variant`
 *  prop instead. */
export interface LessonDesign {
	variant: DesignVariant;
	activeProblemCallId: string | null;
}

export const LessonDesignContext = createContext<LessonDesign>({ variant: "current", activeProblemCallId: null });

export function useLessonDesign(): LessonDesign {
	return useContext(LessonDesignContext);
}
