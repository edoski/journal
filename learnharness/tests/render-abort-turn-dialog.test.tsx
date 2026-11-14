/**
 * abort-turn-dialog (ESC-abort guard, owner 2026-10-02): the confirm popup
 * EVERYWHERE ruling. AbortTurnBody is the alert dialog itself, mounted here
 * on the real Radix layers.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { AbortTurnBody, type AbortMode } from "@/components/abort-turn-dialog";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

async function mount(mode: AbortMode, onClose = () => {}, onConfirm = () => {}) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(<AbortTurnBody mode={mode} onClose={onClose} onConfirm={onConfirm} />); });
}

const text = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)?.textContent ?? "";

describe("AbortTurnBody", () => {
	it("turn mode: names the turn, the partial-stays promise, Abort", async () => {
		await mount("turn");
		assert.ok(document.querySelector('[data-testid="abort-turn-dialog"]'));
		assert.equal(text("abort-turn-title"), "Abort this turn?");
		assert.equal(text("abort-turn-line"), "The partial answer stays in the transcript.");
		assert.equal(text("abort-turn-cancel"), "Cancel");
		assert.equal(text("abort-turn-confirm"), "Abort");
	});

	it("question mode: names the dismissal, the skip, Dismiss", async () => {
		await mount("question");
		assert.equal(text("abort-turn-title"), "Dismiss this question?");
		assert.equal(text("abort-turn-line"), "Skipped — the teacher moves on without it.");
		assert.equal(text("abort-turn-confirm"), "Dismiss");
		// the abort copy must not leak into the dismissal mode
		assert.ok(!(document.body.textContent ?? "").includes("Abort this turn"));
	});

	it("the confirm action is the destructive one, never the cancel; each runs its own handler", async () => {
		let closes = 0;
		let confirms = 0;
		await mount("turn", () => { closes++; }, () => { confirms++; });
		const confirm = document.querySelector<HTMLElement>('[data-testid="abort-turn-confirm"]')!;
		const cancel = document.querySelector<HTMLElement>('[data-testid="abort-turn-cancel"]')!;
		assert.equal(confirm.getAttribute("data-variant"), "destructive");
		assert.notEqual(cancel.getAttribute("data-variant"), "destructive");
		await act(async () => { confirm.click(); });
		assert.equal(confirms, 1);
		assert.equal(closes, 0);
		await act(async () => { cancel.click(); });
		assert.equal(closes, 1);
	});
});
