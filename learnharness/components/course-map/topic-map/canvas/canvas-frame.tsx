"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { CourseMapEdge, TopicHandle } from "@/src/core";
import type { TopicMapLayout } from "../topic-map-layout";
import { CanvasContext, type CanvasState } from "./canvas-context";
import { focusOf } from "./canvas-focus";

/**
 * The canvas's frame (canvas.md, Focus): it holds the topic in focus, the
 * one he points at or focuses, else the one a page marks (a Today row),
 * which the cards and lines light (`CanvasContext`).
 */
export function CanvasFrame({ edges, layout, children }: { edges: readonly CourseMapEdge[]; layout: TopicMapLayout; children: ReactNode }) {
	const [pointed, point] = useState<TopicHandle | null>(null);
	const [marked, mark] = useState<TopicHandle | null>(null);
	const subject = pointed ?? marked;
	const focus = useMemo(() => (subject && layout.topics.has(subject) ? focusOf(subject, edges, layout.routes) : null), [subject, layout, edges]);
	const state = useMemo<CanvasState>(() => ({ focus, point, mark }), [focus]);
	return <CanvasContext.Provider value={state}>{children}</CanvasContext.Provider>;
}
