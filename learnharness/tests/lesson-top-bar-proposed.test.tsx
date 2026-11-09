import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { LessonDetails, LessonTopBar } from "../components/lesson/lesson-top-bar.tsx";
import type { ModelCatalogEntry } from "../src/core/contracts/models.ts";

// The lesson's top bar under the Proposed design on the real Radix layers:
// the details popover, its model and thinking pickers, and the plan popover.
// Fetch is stubbed read-only; nothing is saved.
const MODEL: ModelCatalogEntry = {
	id: "fixture-strong",
	name: "Fixture strong",
	provider: "anthropic",
	reasoning: true,
	input: ["text"],
	supportedLevels: ["low", "high"],
	cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200000,
	maxTokens: 8192,
};
const originalFetch = globalThis.fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
});

async function mount(node: React.ReactElement) {
	globalThis.fetch = async (input, init) => {
		assert.equal(init?.method ?? "GET", "GET", "opening the top bar's layers must not write");
		const path = new URL(String(input), "http://localhost").pathname;
		if (path === "/api/models") return Response.json({ providers: [], models: [MODEL], slots: {} });
		if (path === "/api/chats/chat_1") return Response.json({ settings: { model: { provider: "anthropic", id: MODEL.id }, thinkingLevel: "high" } });
		if (path === "/api/settings") return Response.json({ settings: null });
		throw new Error(`unexpected fetch ${path}`);
	};
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(node); });
	await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

function element(selector: string): HTMLElement {
	const node = document.querySelector<HTMLElement>(selector);
	assert.ok(node, `expected ${selector}`);
	return node;
}

async function press(target: Element | Window, type: string, init: Record<string, unknown> = {}) {
	await act(async () => {
		const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1, ...init });
		target.dispatchEvent(event);
	});
}

/** A click without its pointerdown: linkedom has no capture phase, so a
 *  pointerdown inside an open Radix layer would read as outside it. */
const click = (target: Element) => press(target, "click");

async function escapeReachesWindow(): Promise<boolean> {
	let reached = false;
	const onWindow = (e: Event) => { if ((e as KeyboardEvent).key === "Escape") reached = true; };
	window.addEventListener("keydown", onWindow);
	await press(document.activeElement ?? document.body, "keydown", { key: "Escape" });
	window.removeEventListener("keydown", onWindow);
	return reached;
}

const panelOpen = () => !element('[data-testid="session-details-panel"]').hidden;

describe("Proposed lesson details", () => {
	const details = <LessonDetails chatId="chat_1" turns={[]} contextTokens={null} onModelChange={() => {}} />;

	it("stays mounted while closed and reports the session's model", async () => {
		const reported: Array<string | undefined> = [];
		await mount(<LessonDetails chatId="chat_1" turns={[]} contextTokens={null} onModelChange={(m) => reported.push(m)} />);
		assert.equal(panelOpen(), false);
		assert.equal(reported.at(-1), `anthropic:${MODEL.id}`);
		assert.equal(await escapeReachesWindow(), true, "a closed panel leaves Esc to the turn");
	});

	it("opens on its button; the model picker inside closes first on Esc, then the panel, and the turn never hears either", async () => {
		await mount(details);
		await click(element('[data-testid="session-details"]'));
		assert.equal(panelOpen(), true);
		await click(element('[data-testid="stats-model"]'));
		assert.ok(element('[data-testid="model-option-fixture-strong"]'), "the model picker lists the catalog");
		assert.equal(await escapeReachesWindow(), false);
		assert.equal(document.querySelector('[data-testid="model-menu"]'), null);
		assert.equal(panelOpen(), true, "one Esc closes one layer");
		assert.equal(await escapeReachesWindow(), false);
		assert.equal(panelOpen(), false);
	});

	it("⌘K opens the panel with the model picker", async () => {
		await mount(details);
		await act(async () => { window.dispatchEvent(new dom.window.CustomEvent("lh:kbd-open-model-picker")); });
		assert.equal(panelOpen(), true);
		assert.ok(document.querySelector('[data-testid="model-search"]'));
	});

	it("the thinking menu lists the model's levels with the session's checked", async () => {
		await mount(details);
		await click(element('[data-testid="session-details"]'));
		await press(element('[data-testid="stats-thinking"]'), "keydown", { key: "Enter" });
		const options = [...document.querySelectorAll('[data-testid^="thinking-option-"]')];
		assert.deepEqual(options.map((o) => [o.textContent, o.getAttribute("aria-checked")]), [["low", "false"], ["high", "true"]]);
	});
});

describe("Proposed plan popover", () => {
	it("the plan toggle opens the plan, and Esc closes it without reaching the turn", async () => {
		function Harness() {
			const [open, setOpen] = React.useState(false);
			return <LessonTopBar title="Eigenvalues" phase="Teaching" details={null} plan={{ open, onOpenChange: setOpen, body: <p>Steps</p> }} />;
		}
		await mount(<Harness />);
		await click(element('[data-testid="plan-chip"]'));
		assert.equal(element('[data-testid="plan-panel"]').textContent, "Steps");
		assert.equal(await escapeReachesWindow(), false);
		assert.equal(document.querySelector('[data-testid="plan-panel"]'), null);
	});
});
