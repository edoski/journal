/**
 * The settings, dialogs, menus and overlays (polish pass phase 4): what a
 * learner can see and use. Settings rows that would do nothing are absent, keys read as glyphs, dialogs keep
 * their actions, the chain table and the background agents read in plain
 * words. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppearanceSection } from "../components/settings/appearance-section.tsx";
import { KeyboardSection } from "../components/settings/keyboard-section.tsx";
import { Toggle } from "../components/settings/controls.tsx";
import { ActivitySection, type ActivityFeed } from "../components/activity-dock.tsx";
import { hintBinding } from "../components/ui/hint.tsx";
import { bindingForAction, formatBinding, KEYBOARD_ACTIONS } from "../src/core/index.ts";

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

const testids = (doc: ReturnType<typeof documentFor>) =>
	[...doc.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid"));

describe("Settings › Appearance", () => {
	it("offers only what still applies: text size and the emphasis colours, no mode, background, font, serif or heading weight", () => {
		const doc = documentFor(<AppearanceSection appearance={undefined} onSectionChange={() => {}} />);
		const ids = testids(doc);
		for (const kept of ["row-prose-size", "row-bold-color", "row-italic-color"]) assert.ok(ids.includes(kept), `keeps ${kept}`);
		for (const gone of ["row-mode", "row-background", "row-font", "font-trigger", "row-session-serif", "row-heading-weight"])
			assert.ok(!ids.includes(gone), `leaves out ${gone}`);
		assert.equal(doc.querySelector('[data-testid="row-prose-size"]')?.textContent?.includes("Text size"), true);
		const text = doc.body.textContent ?? "";
		assert.ok(!/px|Empty =/.test(text), "no pixel counts or equals-sign notes");
	});

});

describe("Settings › Keyboard", () => {
	it("lists every shortcut, the changeable ones with Change, in the app's words", () => {
		const doc = documentFor(<KeyboardSection />);
		for (const def of KEYBOARD_ACTIONS) {
			const row = doc.querySelector(`[data-testid="kbd-row-${def.id}"]`);
			assert.ok(row, `${def.id} listed`);
			assert.equal(row.querySelector('[data-slot="kbd"]')?.textContent, formatBinding(bindingForAction(def.id)));
			assert.equal(Boolean(row.querySelector(`[data-testid="kbd-rebind-${def.id}"]`)), !def.displayOnly, `${def.id} ${def.displayOnly ? "fixed" : "changeable"}`);
		}
		const text = doc.body.textContent ?? "";
		for (const retired of ["Graph", "Model selector", "Cycle thinking", "session", "Global", "Chat"]) assert.ok(!text.includes(retired), retired);
		for (const word of ["New lesson", "Go home", "Find in this lesson", "Anywhere", "In a lesson"]) assert.ok(text.includes(word), word);
		assert.ok(doc.querySelector('[data-testid="kbd-reset-all"]'));
	});
});

describe("the settings switch", () => {
	it("reports its state to assistive tech", () => {
		const on = documentFor(<Toggle checked label="graph tools" onChange={() => {}} />).querySelector('[role="switch"]');
		const off = documentFor(<Toggle checked={false} label="graph tools" onChange={() => {}} />).querySelector('[role="switch"]');
		assert.equal(on?.getAttribute("aria-checked"), "true");
		assert.equal(off?.getAttribute("aria-checked"), "false");
		assert.equal(on?.getAttribute("aria-label"), "graph tools");
	});
});

describe("tooltips", () => {
	it("carry the shortcut as glyphs of their own", () => {
		const glyphs = hintBinding("open-settings");
		assert.ok(glyphs.length > 0);
		assert.equal(hintBinding(undefined, "escape"), "Esc");
		assert.equal(hintBinding(), "");
	});
});

const NOW = Date.parse("2026-11-08T10:00:00");

describe("background agents", () => {
	const feed: ActivityFeed = {
		jobs: [
			{
				id: "job-1",
				kind: "research",
				chatId: "c1",
				toolCallId: "t1",
				status: "running",
				activity: 'web_search: "spectral theorem"',
				createdAt: new Date(NOW - 200_000).toISOString(),
				updatedAt: new Date(NOW).toISOString(),
				title: "Eigenvalues and eigenvectors",
				contextLimit: null,
			},
		],
		runs: [],
	};

	it("one row per process under a quiet header: what it is doing and for which session, in full, and a named stop button; no timer, no cost", () => {
		const doc = documentFor(<ActivitySection feed={feed} />);
		const section = doc.querySelector('[data-testid="activity-section"]');
		assert.equal(section?.querySelector('[data-slot="nav-section-header"]')?.textContent, "Background work");
		const row = section?.querySelector('[data-testid="activity-blob-job"] [data-slot="nav-row"]');
		assert.equal(row?.querySelector('[data-slot="nav-row-label"]')?.textContent, "Looking things up for Eigenvalues and eigenvectors");
		assert.doesNotMatch(row?.textContent ?? "", /\d/, "no timer");
		assert.equal(row?.getAttribute("aria-expanded"), "false");
		assert.equal(doc.querySelector('[data-testid="activity-abort"]')?.getAttribute("aria-label"), "Stop: Looking things up for Eigenvalues and eigenvectors");
		assert.ok(doc.querySelector('[data-testid="activity-blob-cost"]') === null, "no cost on the row's face");
		assert.ok(doc.querySelector('[data-testid="activity-total-cost"]') === null, "no running total in the header");
	});
});
