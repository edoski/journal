"use client";

import { useContext, useEffect } from "react";
import { Background, BackgroundVariant } from "@xyflow/react";
import { TopicMapContext } from "../topic-node";
import { useCanvas } from "./canvas-context";

/**
 * What the canvas draws around its cards (canvas.md, Chrome): a quiet dot
 * grid, and the topic a page marks brought into focus (canvas.md, Focus).
 * No minimap and no zoom bar (Edo, 16 Nov 2026: "get rid of this"):
 * scroll pans and a pinch zooms, as on every map.
 */
export function CanvasChrome() {
	const marked = useContext(TopicMapContext)?.marked ?? null;
	const mark = useCanvas()?.mark;
	// The topic a page marks (a Today row he rests on) comes into focus, as one he points at does.
	useEffect(() => mark?.(marked), [mark, marked]);
	return <Background variant={BackgroundVariant.Dots} gap={24} size={1.25} color="rgb(255 255 255 / 0.1)" />;
}
