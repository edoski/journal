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
import { INK_SWATCHES } from "../components/settings/controls.tsx";
import { KeyboardSection } from "../components/settings/keyboard-section.tsx";
import { Dialog } from "../components/ui/dialog.tsx";
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
		const html = renderToStaticMarkup(<Dialog open><SettingsDialogBody onClose={() => {}} /></Dialog>);
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
		// Round 5: the swatches were native colour inputs, the system picker's look.
		assert.doesNotMatch(html, /type="color"/, "no native colour input");
		for (const ink of ["input-bold-color", "input-italic-color"]) {
			assert.match(tagOf(html, ink), /^<button[^>]*aria-haspopup="dialog"/, `${ink} opens the app's swatch panel`);
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
		assert.match(html, /data-slot="color-swatch"[^>]*style="background:#aabbcc"/, "the swatch shows the stored ink, a short hex grown to its long form");
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

describe("the colour field's swatch panel", () => {
	const keyOn = async (el: Element, key: string) => {
		await act(async () => {
			const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
			Object.assign(event, { key });
			el.dispatchEvent(event);
			// Radix's roving focus moves on the next task.
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	};

	it("opens a grid of the app's inks, which the arrows walk, a row at a time on up and down, and Enter picks", async () => {
		const changes: { mdRendering?: { boldColor?: string | null } }[] = [];
		const host = dom.document.createElement("div");
		dom.document.body.appendChild(host);
		const root = createRoot(host);
		await act(async () => {
			root.render(<AppearanceSection appearance={undefined} onSectionChange={(next) => changes.push(next)} />);
		});
		const trigger = host.querySelector<HTMLButtonElement>('[data-testid="input-bold-color"]')!;
		await act(async () => {
			trigger.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true, cancelable: true }));
			trigger.click();
		});
		const grid = dom.document.querySelector('[data-slot="swatch-grid"]');
		assert.ok(grid, "the swatch panel opens");
		assert.equal(grid.getAttribute("aria-label"), "Bold color");
		const swatches = [...grid.querySelectorAll<HTMLButtonElement>('[data-slot="swatch"]')];
		assert.deepEqual(swatches.map((s) => s.getAttribute("aria-label")), INK_SWATCHES.map((s) => s.name), "each swatch is named");
		assert.ok(dom.document.querySelector('input[type="text"], input[type="color"]') === null, "nothing is typed");
		const columns = Number(grid.getAttribute("data-columns"));
		swatches[0]!.focus();
		await keyOn(swatches[0]!, "ArrowRight");
		assert.ok(dom.document.activeElement === swatches[1], "→ moves along the row");
		await keyOn(swatches[1]!, "ArrowDown");
		assert.ok(dom.document.activeElement === swatches[1 + columns], "↓ moves down a row");
		await keyOn(swatches[1 + columns]!, "ArrowUp");
		assert.ok(dom.document.activeElement === swatches[1], "↑ moves back up");
		assert.equal(changes.length, 0, "moving never picks");
		await act(async () => swatches[1]!.click());
		assert.equal(changes.at(-1)?.mdRendering?.boldColor, INK_SWATCHES[1]!.color, "Enter or a click picks the swatch's ink");
		assert.ok(dom.document.querySelector('[data-slot="swatch-grid"]') === null, "picking closes the panel");
		await act(async () => root.unmount());
		host.remove();
	});

	it("offers only inks that read on the app's dark background", () => {
		const luminance = (hex: string) => {
			const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
			return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
		};
		const background = luminance("#121212");
		for (const { name, color } of INK_SWATCHES) {
			const ratio = (luminance(color) + 0.05) / (background + 0.05);
			assert.ok(ratio >= 4.5, `${name} ${color} reads at ${ratio.toFixed(2)}:1, under WCAG's 4.5:1 for text`);
		}
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