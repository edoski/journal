"use client";

import { createContext, useContext } from "react";
import type { TopicHandle } from "@/src/core";
import type { Focus } from "./canvas-focus";

/** What the canvas's cards and lines share (`CanvasFrame` holds it). */
export interface CanvasState {
	/** The topic in focus: the one he points at or has focused, else the one a page marks; null at rest. */
	focus: Focus | null;
	/** He points at or focuses a topic, or leaves it. */
	point: (handle: TopicHandle | null) => void;
	/** A page marks a topic from elsewhere (a Today row), or stops. */
	mark: (handle: TopicHandle | null) => void;
}

export const CanvasContext = createContext<CanvasState | null>(null);

export function useCanvas(): CanvasState | null {
	return useContext(CanvasContext);
}
