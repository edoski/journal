import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { SettingsDesignContext } from "../components/settings/settings-design.ts";
import { Toggle } from "../components/settings/controls.tsx";
import { AgentSection } from "../components/settings/agent-section.tsx";
import type { ModelsSettings } from "../src/core/index.ts";
import type { ModelCatalogEntry } from "../src/core/contracts/models.ts";

// The Proposed settings kit on the real Radix layers: the switch and the
// Agent section's model and thinking pickers. Fetch is stubbed read-only.
const MODELS: ModelCatalogEntry[] = ["alpha-large", "beta-small"].map((id) => ({
	id,
	name: id,
	provider: "anthropic",
	reasoning: true,
	input: ["text"],
	supportedLevels: ["low", "high"],
	cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200000,
	maxTokens: 8192,
}));
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
		assert.equal(init?.method ?? "GET", "GET", "the kit itself never writes; its host does");
		const path = new URL(String(input), "http://localhost").pathname;
		if (path === "/api/models") return Response.json({ providers: [], models: MODELS, slots: {} });
		return Response.json({});
	};
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(<SettingsDesignContext.Provider value="proposed">{node}</SettingsDesignContext.Provider>); });
	await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

function element(selector: string): HTMLElement {
	const node = document.querySelector<HTMLElement>(selector);
	assert.ok(node, `expected ${selector}`);
	return node;
}

async function press(target: Element, type: string, init: Record<string, unknown> = {}) {
	await act(async () => {
		const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1, ...init });
		target.dispatchEvent(event);
	});
}

describe("Proposed settings switch", () => {
	it("is the shadcn switch, named and pinned as before, and flips its value", async () => {
		const flips: boolean[] = [];
		await mount(<Toggle checked={false} label="graph tools" onChange={(v) => flips.push(v)} />);
		const control = element('[data-testid="toggle-graph-tools"]');
		assert.equal(control.getAttribute("data-slot"), "switch");
		assert.equal(control.getAttribute("role"), "switch");
		assert.equal(control.getAttribute("aria-label"), "graph tools");
		assert.equal(control.getAttribute("aria-checked"), "false");
		await press(control, "click");
		assert.deepEqual(flips, [true]);
	});
});

describe("Proposed Agent pickers", () => {
	it("the model picker lists the catalog and a pick writes the slot with a populated level", async () => {
		const writes: ModelsSettings[] = [];
		await mount(
			<AgentSection agent={undefined} models={undefined} graph={undefined} compaction={undefined} onSectionChange={() => {}} onModelsChange={(m) => writes.push(m)} onCompactionChange={() => {}} />,
		);
		await press(element('[data-testid="slot-model-strong"]'), "click");
		const options = [...document.querySelectorAll('[data-testid^="model-option-"]')];
		assert.deepEqual(options.map((o) => o.getAttribute("data-testid")), ["model-option-alpha-large", "model-option-beta-small"]);
		await press(options[1]!, "click");
		assert.equal(writes.length, 1);
		assert.deepEqual(writes[0]!.strong?.model, { provider: "anthropic", id: "beta-small" });
		assert.equal(document.querySelector('[data-testid="slot-model-menu-strong"]'), null, "a pick closes the picker");
	});

	it("the thinking menu offers the levels the slot's model supports", async () => {
		const models: ModelsSettings = { cheap: { model: { provider: "anthropic", id: "alpha-large" }, thinkingLevel: "low" } };
		await mount(
			<AgentSection agent={undefined} models={models} graph={undefined} compaction={undefined} onSectionChange={() => {}} onModelsChange={() => {}} onCompactionChange={() => {}} />,
		);
		await press(element('[data-testid="slot-thinking-cheap"]'), "keydown", { key: "Enter" });
		const options = [...document.querySelectorAll('[data-testid^="thinking-option-"]')];
		assert.deepEqual(options.map((o) => [o.textContent, o.getAttribute("aria-checked")]), [["low", "true"], ["high", "false"]]);
	});
});
