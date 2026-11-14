/**
 * Settings-surface render tests (thin settings wave): SSR of the section
 * components pins the markup — toggle rows, the slot rows and tool rows,
 * the appearance rows that still apply. Fetches don't run under renderToStaticMarkup (effects never
 * fire), so the SSR state IS the loading state — asserted as such.
 * Same tsx classic-JSX shim as render-sidebar.test.tsx.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TOGGLE_TOOLS, AgentSection } from "../components/settings/agent-section.tsx";
import { AppearanceSection } from "../components/settings/appearance-section.tsx";
import { KeyboardSection } from "../components/settings/keyboard-section.tsx";
import { SettingsDialogBody, SettingsDialogProvider } from "../components/settings/settings-dialog.tsx";
import { KEYBOARD_ACTIONS } from "../src/core/index.ts";

/** The full opening tag of the element carrying a testid — attribute
 *  order in React output is not contractual, so assertions run on the
 *  whole tag instead of ordered regex chains. */
function tagOf(html: string, testid: string): string {
	const i = html.indexOf(`data-testid="${testid}"`);
	assert.ok(i >= 0, `missing ${testid}`);
	return html.slice(html.lastIndexOf("<", i), html.indexOf(">", i) + 1);
}

describe("SettingsDialog (the designed surface, SSR)", () => {
	it("provider CLOSED: children only — no dialog, no portal content", () => {
		const html = renderToStaticMarkup(
			<SettingsDialogProvider>
				<p>the app</p>
			</SettingsDialogProvider>,
		);
		assert.ok(html.includes("the app"));
		assert.ok(!html.includes("settings-backdrop"));
		assert.ok(!html.includes("settings-dialog"));
	});

	it("the dialog frame: the ✕ + the section nav, Providers first and General last", () => {
		const html = renderToStaticMarkup(<SettingsDialogBody onClose={() => {}} />);
		assert.ok(html.includes('aria-label="Close settings"'));
		for (const id of ["general", "keys", "agent", "appearance", "keyboard"]) {
			assert.ok(!html.includes("settings-nav-graph"), "no Graph tab");
			assert.ok(html.includes(`data-testid="settings-nav-${id}"`), id);
		}
		// Providers is the first landing section; internal keys deep links survive.
		assert.ok(tagOf(html, "settings-nav-keys").includes('aria-selected="true"'));
		assert.ok(html.indexOf('data-testid="settings-nav-keys"') < html.indexOf('data-testid="settings-nav-general"'));
		assert.ok(tagOf(html, "settings-nav-keyboard").includes('aria-selected="false"'));
		// Fetches don't run under SSR — the loading state IS the SSR state.
		assert.ok(html.includes("Loading settings…"));
		// Modal-only doctrine: no link back to /settings anywhere in it.
		assert.ok(!html.includes('href="/settings"'));
	});
});

describe("AgentSection (thin SSR)", () => {
	it("has no model or thinking choice: only the Tools group", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} onSectionChange={() => {}} />);
		for (const slot of ["strong", "cheap", "vision"]) assert.ok(!html.includes(`slot-row-${slot}`), `${slot} retired`);
		assert.ok(!html.includes('data-testid="group-models"'), "no Models group");
		assert.ok(html.includes('data-testid="group-tools"'), "Tools group");
		assert.ok(!html.includes("group-prompts") && !html.includes("System prompts"), "no system prompt viewers");
	});

	it("has no search-engine row", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} onSectionChange={() => {}} />);
		assert.ok(!html.includes('data-testid="search-engine-row"'));
	});

	it("has no Knowledge map row (the knowledge-graph tools are gone)", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} onSectionChange={() => {}} />);
		assert.ok(!html.includes("graph-tools-row") && !html.includes("Knowledge map"));
	});

	it("renders the owner's FINAL tool list — research, demo, visual, pdf", () => {
		assert.deepEqual([...TOGGLE_TOOLS], ["research", "demo", "visual", "pdf"]);
		const html = renderToStaticMarkup(<AgentSection agent={undefined} onSectionChange={() => {}} />);
		for (const id of TOGGLE_TOOLS) assert.ok(html.includes(`data-testid="tool-row-${id}"`), id);
	});

	it("tools default ON (absent key = enabled)", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} onSectionChange={() => {}} />);
		for (const id of TOGGLE_TOOLS) {
			assert.ok(tagOf(html, `toggle-tool-${id}`).includes('aria-checked="true"'), `${id} defaults on`);
		}
	});

	it("tools carry the delta", () => {
		const html = renderToStaticMarkup(<AgentSection agent={{ tools: { demo: false } }} onSectionChange={() => {}} />);
		assert.ok(tagOf(html, "toggle-tool-demo").includes('aria-checked="false"'), "demo off");
		assert.ok(tagOf(html, "toggle-tool-visual").includes('aria-checked="true"'), "visual still on");
	});
});


describe("AppearanceSection (thin SSR)", () => {
	it("the inputs carry the factory placeholders: 16 for the text size, same as text for the inks", () => {
		const html = renderToStaticMarkup(<AppearanceSection appearance={undefined} onSectionChange={() => {}} />);
		assert.ok(tagOf(html, "input-prose-size").includes('placeholder="16"'));
		assert.ok(tagOf(html, "input-bold-color").includes('placeholder="same as text"'));
		assert.ok(tagOf(html, "input-italic-color").includes('placeholder="same as text"'));
	});

	it("a set ink shows in the input, not the placeholder", () => {
		const html = renderToStaticMarkup(
			<AppearanceSection appearance={{ mdRendering: { boldColor: "#1a1a2e" } }} onSectionChange={() => {}} />,
		);
		assert.ok(tagOf(html, "input-bold-color").includes(`value="#1a1a2e"`));
	});
});

describe("KeyboardSection (thin SSR)", () => {
	it("renders every changeable registry action in its scope group", () => {
		const html = renderToStaticMarkup(<KeyboardSection />);
		for (const def of KEYBOARD_ACTIONS.filter((a) => !a.displayOnly)) {
			assert.ok(html.includes(`data-testid="kbd-row-${def.id}"`), def.id);
		}
		assert.ok(html.includes("kbd-scope-global"));
		assert.ok(html.includes("kbd-scope-lesson"));
	});

	it("open-settings is in the registry with the settings chord", () => {
		const def = KEYBOARD_ACTIONS.find((a) => a.id === "open-settings");
		assert.ok(def, "the action exists");
		assert.equal(def?.scope, "global");
		assert.equal(def?.binding, "mod+,");
	});

	it("displayOnly actions are left to the cheat sheet and never offer Rebind", () => {
		const html = renderToStaticMarkup(<KeyboardSection />);
		assert.ok(!html.includes(`data-testid="kbd-row-question-next-row"`), "a screen's own keys are not listed");
		assert.ok(!html.includes(`data-testid="kbd-rebind-question-next-row"`), "surface keys stay put");
		// The model-menu entries are GONE entirely (owner, 2026-10-10):
		// obvious in-field navigation, not settings material.
		assert.ok(!html.includes("Model menu"), "model-menu rows removed");
		assert.ok(!KEYBOARD_ACTIONS.some((a) => a.id as string === "model-menu-walk"));
		assert.ok(!KEYBOARD_ACTIONS.some((a) => a.id as string === "model-menu-pick"));
	});
});