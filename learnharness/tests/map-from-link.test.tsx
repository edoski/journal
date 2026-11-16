/**
 * A top card's "From <arc>" line opens that arc on the map (Edo, 16 Nov
 * 2026: "make perhaps the From... header in cards clickable"). It was the
 * card's link, so a press opened the topic's page; it is now a press of
 * its own beside the card's link, which still opens the topic's page.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import type { ArcHandle } from "../src/core/index.ts";
import { CanvasNode, type CanvasFlowNode } from "../components/course-map/topic-map/canvas/canvas-node.tsx";
import { TopicMapContext, type TopicMapState } from "../components/course-map/topic-map/topic-node.tsx";
import { standingOf } from "../components/course-map/topic-map/topic-standing.ts";
import { LINALG_ARCS } from "./fixtures/now-demo.ts";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	host?.remove();
	root = host = null;
});

const independence = LINALG_ARCS.map.topics.find((t) => t.handle === "independence")!;
const props = (from: string | null) =>
	({
		data: { topic: independence, current: false, standing: standingOf(independence), line: null, label: independence.title, needs: null, href: "/unit/x/independence", from },
	}) as unknown as NodeProps<CanvasFlowNode>;

async function mount(from: string | null, openArc?: (arc: ArcHandle) => void) {
	const state: TopicMapState = { lit: null, marked: null, tabStop: null, onActive: () => {}, onFocus: () => {}, onKeyDown: () => {}, register: () => {}, openArc };
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<ReactFlowProvider>
				<TopicMapContext.Provider value={state}>
					<CanvasNode {...props(from)} />
				</TopicMapContext.Provider>
			</ReactFlowProvider>,
		),
	);
}

describe("an entry card's From line", () => {
	it("opens the arc its topic comes from, apart from the card's link", async () => {
		const opened: string[] = [];
		await mount("Vector spaces", (arc) => opened.push(arc));
		const from = document.querySelector('[data-slot="topic-from"]')!;
		assert.equal(from.tagName, "BUTTON");
		assert.ok(from.closest("a") === null, "never inside the card's link");
		assert.equal(from.textContent, "From Vector spaces");
		await act(async () => {
			from.dispatchEvent(new dom.window.Event("click", { bubbles: true }) as unknown as Event);
		});
		assert.deepEqual(opened, ["spaces"]);
		assert.equal(document.querySelector('[data-slot="course-map-node"]')!.getAttribute("href"), "/unit/x/independence", "the card still opens its topic's page");
	});

	it("stays words inside the card's link where the page has no arc to show", async () => {
		await mount("Vector spaces");
		const from = document.querySelector('[data-slot="topic-from"]')!;
		assert.equal(from.tagName, "SPAN");
		assert.ok(from.closest("a") !== null);
	});
});
