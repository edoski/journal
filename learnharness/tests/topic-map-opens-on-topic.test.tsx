/**
 * A topic page's map opens with its own topic in view (round 10, 3 m9):
 * the map of a topic not started is the course cut to what it builds on
 * (`buildsMapOf`), which drops the course's current topic when the chain
 * does not hold it, so the camera, framing "where he is", fell back to the
 * top of the map and Invertible matrices' page showed no Invertible
 * matrices. BuildsOnMap opens the map on the topic (`opensOn`).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/index.ts";
import { buildsMapOf } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { framedCamera } from "../components/course-map/topic-map/topic-map-layout.ts";
import { CANVAS_NODE, layoutCanvas } from "../components/course-map/topic-map/canvas/canvas-layout.ts";
import { BuildsOnMap } from "../components/unit-inbox/topic-page/hybrid/builds-on-map.tsx";
import { NO_LIGHTS } from "../components/course-map/use-map-tie.ts";

const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const h = (handle: string) => handle as TopicHandle;
const topic = (handle: string): CourseMapTopic => ({ handle: h(handle), title: handle, level: "independent", introduced: "2026-10-01", review: null, weak: false, signals: QUIET, tasks: [] });
const CHAIN = ["vectors", "span", "independence", "basis", "rank", "matmul", "determinant", "invertibility"];
const MAP = {
	workspace: "/study/linalg",
	title: "Linear Algebra",
	today: "2026-11-08",
	topics: [...CHAIN, "eigen"].map(topic),
	edges: [...CHAIN.slice(1).map((t, i) => ({ kind: "needs" as const, topic: h(t), prerequisite: h(CHAIN[i]!) })), { kind: "needs" as const, topic: h("eigen"), prerequisite: h("determinant") }],
	current: h("eigen"),
	tasks: [],
	focus: null,
} as unknown as CourseMap;

const FRAME = { width: 900, height: 700 };
const FADE = { x: 24, y: 40 };

function inView(map: CourseMap, focus: TopicHandle | null, handle: TopicHandle): boolean {
	const layout = layoutCanvas(map.topics, map.edges);
	const camera = framedCamera(layout, focus, FRAME, FADE, 24);
	const at = layout.topics.get(handle)!;
	const top = at.y * camera.zoom + camera.y;
	return top >= 0 && top + layout.node.height * camera.zoom <= FRAME.height;
}

describe("a topic page's map", () => {
	it("frames the topic when it opens on it, though the cut map holds no current topic", () => {
		const cut = buildsMapOf(MAP.topics.find((t) => t.handle === "invertibility")!, MAP)!;
		assert.ok(cut.current === null, "the chain does not hold the course's current topic");
		assert.ok(!inView(cut, cut.current, h("invertibility")), "framed on where he is, the topic is out of view");
		assert.ok(inView(cut, h("invertibility"), h("invertibility")), "opened on the topic, it is in view");
	});

	it("is opened on its topic by the topic page", () => {
		const element = BuildsOnMap({ map: MAP, said: new Map(), topic: h("invertibility"), lights: NO_LIGHTS }) as React.ReactElement<{ children: React.ReactElement<{ opensOn?: TopicHandle }> }>;
		assert.equal(element.props.children.props.opensOn, "invertibility");
	});
});
