"use client";

import { createContext, useContext } from "react";

/** The problem the practice dock currently shows, read by the transcript's
 *  problem card (registry-rendered, so it can't take a prop): its card
 *  stays out of the column, so the problem reads once. */
export const ActiveProblemContext = createContext<string | null>(null);

export function useActiveProblemCallId(): string | null {
	return useContext(ActiveProblemContext);
}
