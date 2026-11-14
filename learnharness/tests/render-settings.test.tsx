/**
 * Settings-surface render tests (thin settings wave): SSR of the section
 * components pins the markup — the dialog frame and the appearance rows
 * that still apply. Fetches don't run under renderToStaticMarkup (effects never
 * fire), so the SSR state IS the loading state — asserted as such.
 * Same tsx classic-JSX shim as render-sidebar.test.tsx.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
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
		for (const id of ["general", "keys", "appearance", "keyboard"]) {
			assert.ok(html.includes(`data-testid="settings-nav-${id}"`), id);
		}
		assert.ok(!html.includes("settings-nav-graph"), "no Graph tab");
		assert.ok(!html.includes("settings-nav-agent"), "no Tutor tab: every tutor tool is always on");
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

describe("AppearanceSection (thin SSR)", () => {
	it("every row is a control: a size menu and two colour pickers, each with Default", () => {
		const html = renderToStaticMarkup(<AppearanceSection appearance={undefined} onSectionChange={() => {}} />);
		const size = tagOf(html, "input-prose-size");
		assert.match(size, /^<button/, "Text size is a menu, not a field");
		for (const ink of ["input-bold-color", "input-italic-color"]) {
			assert.match(tagOf(html, ink), /type="color"/, `${ink} opens the system colour picker`);
			assert.match(tagOf(html, `${ink}-default`), /disabled=""/, `${ink}'s Default is off while the default is in use`);
		}
		assert.equal(html.match(/Same as the text/g)?.length, 2, "an unset ink says it follows the text");
		assert.doesNotMatch(html, /type="(text|number)"/, "nothing is typed");
	});

	it("a set ink shows in the picker and its Default clears it to null", () => {
		const changes: unknown[] = [];
		const html = renderToStaticMarkup(
			<AppearanceSection appearance={{ mdRendering: { boldColor: "#abc" }, proseFontSize: 18 }} onSectionChange={(next) => changes.push(next)} />,
		);
		assert.ok(tagOf(html, "input-bold-color").includes(`value="#aabbcc"`), "a short hex grows to the picker's form");
		assert.doesNotMatch(tagOf(html, "input-bold-color-default"), /disabled=""/);
		assert.equal(html.match(/Same as the text/g)?.length, 1, "only the unset ink follows the text");
	});

	it("the size menu names the size in use, the factory one as the default", async () => {
		for (const [appearance, words] of [[undefined, "16 px, default"], [{ proseFontSize: 18 }, "18 px"]] as const) {
			const host = dom.document.createElement("div");
			dom.document.body.appendChild(host);
			const root = createRoot(host);
			await act(async () => {
				root.render(<AppearanceSection appearance={appearance} onSectionChange={() => {}} />);
			});
			assert.equal(host.querySelector('[data-testid="input-prose-size"]')?.textContent?.trim(), words);
			await act(async () => root.unmount());
			host.remove();
		}
	});

	it("Default stores null, the record's unset ink", async () => {
		const changes: { mdRendering?: { boldColor?: string | null } }[] = [];
		const host = dom.document.createElement("div");
		dom.document.body.appendChild(host);
		const root = createRoot(host);
		await act(async () => {
			root.render(<AppearanceSection appearance={{ mdRendering: { boldColor: "#1a1a2e" } }} onSectionChange={(next) => changes.push(next)} />);
		});
		const reset = host.querySelector<HTMLButtonElement>('[data-testid="input-bold-color-default"]');
		await act(async () => reset?.click());
		assert.equal(changes.at(-1)?.mdRendering?.boldColor, null);
		await act(async () => root.unmount());
		host.remove();
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