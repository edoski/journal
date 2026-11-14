import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { LessonDetails, LessonTopBar } from "../components/lesson/lesson-top-bar.tsx";
import { CLAUDE_MODEL } from "../src/core/index.ts";
import { roomWords } from "../components/study-words.ts";

// The lesson's top bar under the Proposed design on the real Radix layers:
// the details popover and the plan popover. Fetch is stubbed read-only;
// nothing is saved.
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
		if (path === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
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
	const details = <LessonDetails turns={[]} contextTokens={1000} />;

	it("stays mounted while closed, so Esc stays the turn's", async () => {
		await mount(details);
		assert.equal(panelOpen(), false);
		assert.equal(await escapeReachesWindow(), true, "a closed panel leaves Esc to the turn");
	});

	it("names the one tutor with no picker, and says the room left in words, never a token count", async () => {
		await mount(details);
		await click(element('[data-testid="session-details"]'));
		assert.equal(panelOpen(), true);
		assert.equal(element('[data-testid="stats-model"]').textContent, CLAUDE_MODEL.name);
		assert.equal(document.querySelector('[data-testid="stats-model"] button'), null, "no model or thinking control");
		assert.equal(element('[data-testid="stats-context"]').textContent, "Plenty");
		assert.doesNotMatch(document.querySelector('[data-testid="session-details-panel"]')!.textContent!, /Context|\d+k|tokens/);
		assert.equal(await escapeReachesWindow(), false);
		assert.equal(panelOpen(), false, "one Esc closes the panel, and the turn never hears it");
	});

	it("⌘K opens the panel", async () => {
		await mount(details);
		await act(async () => { window.dispatchEvent(new dom.window.CustomEvent("lh:kbd-open-model-picker")); });
		assert.equal(panelOpen(), true);
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

describe("the room a lesson has left", () => {
	it("says it in words, plenty until half is used", () => {
		assert.equal(roomWords(null, 150_000), "Not measured yet");
		assert.equal(roomWords(9_200, 150_000), "Plenty");
		assert.equal(roomWords(80_000, 150_000), "Over half used. When it fills, the tutor sums up the lesson so far");
	});
});
