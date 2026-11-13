/**
 * Tooltip-wave mechanism pins (owner, 2026-09-25): the composition rule —
 * icon/pill controls ride the styled Radix tooltip via Hint, the shortcut
 * shown as key glyphs off the LIVE registry (a rebind changes them);
 * truncation-reveals keep native title=; the copy carries no
 * internal vocabulary. Node 26 exposes the host platform through navigator,
 * so expectations cover Mac glyphs AND Ctrl+/Shift+ elsewhere. Composition
 * is the pin; running on a Mac must not be a test prerequisite.
 */

import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Hint, hintBinding } from "../components/ui/hint.tsx";
import { TOOLTIP_DELAY_MS } from "../components/ui/tooltip.tsx";
import { IS_MAC } from "../src/core/keyboard.ts";

describe("hintBinding — the shortcut glyphs beside the label", () => {
	it("a registry action shows the LIVE binding (override-aware source)", () => {
		assert.equal(hintBinding("open-model-picker"), IS_MAC ? "⌘K" : "Ctrl+K");
		assert.equal(hintBinding("open-settings"), IS_MAC ? "⌘," : "Ctrl+,");
		assert.equal(hintBinding("sessions-search"), IS_MAC ? "⌘⇧F" : "Ctrl+Shift+F");
	});

	it("surface-owned keys ride the binding prop (no registry entry)", () => {
		assert.equal(hintBinding(undefined, "escape"), "Esc");
		assert.equal(hintBinding(undefined, "enter"), "↵");
	});

	it("no shortcut = no glyphs", () => {
		assert.equal(hintBinding(), "");
	});
});

describe("subtlety round pins (owner 2026-09-25)", () => {
	it("the rest delay is 500ms — tooltips appear on pause, never in passing", () => {
		assert.equal(TOOLTIP_DELAY_MS, 500);
	});
});

describe("Hint — the mechanism (SSR: the tooltip itself stays closed)", () => {
	it("asChild: no wrapper DOM — the control keeps its own testid and classes", () => {
		const html = renderToStaticMarkup(
			createElement(Hint, {
				label: "Model selector",
				action: "open-model-picker",
				children: createElement("button", { "data-testid": "model-trigger", className: "the-quiet-chrome" }, "Model"),
			}),
		);
		assert.match(html, /^<button/, "the trigger IS the button — nothing wraps it");
		assert.ok(html.includes('data-testid="model-trigger"'));
		assert.ok(html.includes("the-quiet-chrome"));
		assert.ok(!html.includes("<span"), "no portal content renders while closed");
	});
});