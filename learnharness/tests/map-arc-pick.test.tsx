/**
 * The arc list beside Home's map takes a press (Edo, 16 Nov 2026: "arcs
 * selectors (which btw are not working clickable here)"). Home always
 * follows a Today row, the top one at rest, so when that row's course is
 * the one on the map its arc outranked the arc he pressed and the press
 * did nothing. The arc he presses now shows until he points at another
 * row.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ArcHandle } from "../src/core/index.ts";
import { HomeMap } from "../components/study-home/home-map.tsx";
import { LINALG_ARCS, PROB } from "./fixtures/now-demo.ts";

const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} };
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => root?.unmount());
	host?.remove();
	root = host = null;
});

async function mount(arc: ArcHandle | null) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const draw = (followed: ArcHandle | null) =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<HomeMap courses={[LINALG_ARCS, PROB]} chats={[]} workspace={LINALG_ARCS.map.workspace} onSelect={() => {}} arc={followed} enlarged={false} onEnlarge={() => {}} />
			</AppRouterContext.Provider>,
		);
	await act(async () => draw(arc));
	return (followed: ArcHandle | null) => act(async () => draw(followed));
}

const shown = () => document.querySelector('[data-slot="arc-index-row"][data-shown]')?.getAttribute("data-arc");
const drawn = () => [...document.querySelectorAll('[data-slot="home-map-course"][data-shown] [data-slot="course-map-node"]')].map((n) => n.getAttribute("data-testid")).sort();

async function press(handle: string) {
	const item = document.querySelector(`[data-slot="arc-index-row"][data-arc="${handle}"]`);
	assert.ok(item, `the list names ${handle}`);
	await act(async () => {
		item.dispatchEvent(new dom.window.Event("click", { bubbles: true }) as unknown as Event);
	});
}

describe("the arc list beside Home's map", () => {
	it("shows the arc he presses while Home follows a row in the same course", async () => {
		await mount("systems" as ArcHandle);
		assert.equal(shown(), "systems");
		await press("eigenvalues");
		assert.equal(shown(), "eigenvalues", "the press wins over the followed row's arc");
		assert.ok(drawn().includes("map-node-diag"), "the map draws the pressed arc");
	});

	it("follows the next row he points at once more, dropping the press", async () => {
		const follow = await mount("systems" as ArcHandle);
		await press("spaces");
		assert.equal(shown(), "spaces");
		await follow("eigenvalues" as ArcHandle);
		assert.equal(shown(), "eigenvalues");
	});
});
