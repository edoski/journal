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
import { KEYBOARD_ACTIONS, keyActionsFor } from "../src/core/index.ts";
import { SettingsMenuTrigger } from "../components/settings/controls.tsx";

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

describe("the shared settings dropdown trigger", () => {
	it("preserves native disabling separately from callers' existing click-gated unavailable state", () => {
		const disabled = tagOf(renderToStaticMarkup(<SettingsMenuTrigger value="English" disabled data-testid="disabled-trigger" />), "disabled-trigger");
		const unavailable = tagOf(renderToStaticMarkup(<SettingsMenuTrigger value="Automatic" unavailable data-testid="unavailable-trigger" />), "unavailable-trigger");
		assert.ok(disabled.includes('disabled=""'));
		assert.ok(!unavailable.includes('disabled=""'));
		assert.ok(unavailable.includes("cursor-not-allowed"));
		assert.ok(!unavailable.includes("hover:bg-fill-hover"));
	});
});

describe("AgentSection (thin SSR)", () => {
	it("renders the three model SLOT rows (slots-only, fix wave: unpicked reads —, no Default option)", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		for (const slot of ["strong", "cheap", "vision"]) {
			assert.ok(html.includes(`data-testid="slot-row-${slot}"`), slot);
			// The shared model-picker dropdown as the opened menu (owner,
			// 2026-09-20), the thin trigger as the collapsed look.
			assert.ok(html.includes(`data-testid="slot-model-${slot}"`), `${slot} model trigger`);
			assert.ok(html.includes(`data-testid="slot-thinking-${slot}"`), `${slot} thinking trigger`);
			// the roster hint rides every row
			assert.ok(html.includes("Teaches and quizzes you") || slot !== "strong", "strong roster");
		}
		// Fix wave: no Default anywhere — an unpicked slot reads "—"
		// (the owner's no-factory-fallback language), and no menu
		// carries a Default row (menu-default testid is retired).
		assert.equal((html.match(/>Default<\/span>/g) ?? []).length, 0, "no Default trigger");
		assert.ok(!html.includes('data-testid="menu-default"'), "no Default row");
		assert.equal((html.match(/>—<\/span>/g) ?? []).length, 6, "three slots × two — triggers");
		// the per-role rows are GONE (slots-only)
		for (const role of ["researcher", "demoBuilder", "visualMaker"]) {
			assert.ok(!html.includes(`data-testid="role-row-${role}"`), `${role} retired`);
		}
		assert.ok(html.includes('data-testid="group-models"'), "Models sub-group");
		assert.ok(html.includes('data-testid="group-tools"'), "Tools sub-group");
		assert.ok(!html.includes("group-prompts") && !html.includes("System prompts"), "no system prompt viewers");
	});

	it("has no search-engine row", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		assert.ok(!html.includes('data-testid="search-engine-row"'));
	});

	it("the prober graph-tools row: FIRST in the Tools group, default ON, its own key (wave 7)", () => {
		// Default state: graph on, graphTools absent → ON, the describing
		// hint rides.
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		const toolsGroup = html.split('data-testid="group-tools"')[1] ?? "";
		const rows = [...toolsGroup.matchAll(/data-testid="(graph-tools-row|tool-row-\w+)"/g)].map((m) => m[1]);
		assert.equal(rows[0], "graph-tools-row", "graph tools is the FIRST row of the Tools group");
		assert.ok(html.includes("Lets the tutor look back at earlier lessons"), "the describing hint");
		assert.ok((html.split('data-testid="graph-tools-row"')[1] ?? "").includes('aria-checked="true"'), "absent = on");
		assert.ok(!tagOf(html, "graph-tools-row").includes("opacity-50"), "never dimmed");
	});

	it("an explicit graphTools off shows stored-off (the record never lies)", () => {
		const html = renderToStaticMarkup(
			<AgentSection agent={{ graphTools: { enabled: false } }} models={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />,
		);
		const row = html.split('data-testid="graph-tools-row"')[1] ?? "";
		assert.ok(row.includes('aria-checked="false"'), "stored-off renders off");
	});

	it("renders the owner's FINAL tool list — research, demo, visual, pdf", () => {
		assert.deepEqual([...TOGGLE_TOOLS], ["research", "demo", "visual", "pdf"]);
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		for (const id of TOGGLE_TOOLS) assert.ok(html.includes(`data-testid="tool-row-${id}"`), id);
	});

	it("tools default ON (absent key = enabled)", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		for (const id of TOGGLE_TOOLS) {
			assert.ok(tagOf(html, `toggle-tool-${id}`).includes('aria-checked="true"'), `${id} defaults on`);
		}
	});

	it("an overridden SLOT shows its model in the trigger, tools carry the delta", () => {
		const html = renderToStaticMarkup(
			<AgentSection
				agent={{ tools: { demo: false } }}
				models={{ strong: { model: { provider: "zai", id: "glm-4.7-flash" } } }}
				onSectionChange={() => {}}
				onModelsChange={() => {}}
			/>,
		);
		// The trigger shows the stored id even with no catalog loaded (a
		// trigger reading "Default" over a live override would lie).
		assert.ok(html.includes("glm-4.7-flash"), "the override id is visible (prettyModel form, no auto-caps)");
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
		for (const def of keyActionsFor("proposed").filter((a) => !a.displayOnly)) {
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