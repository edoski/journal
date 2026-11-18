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
import { STOP_WORDS } from "@/components/study-words";

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
	await act(async () => { root!.render(<AbortTurnBody open mode={mode} onClose={onClose} onConfirm={onConfirm} />); });
}

const text = (testid: string) => document.querySelector(`[data-testid="${testid}"]`)?.textContent ?? "";

describe("AbortTurnBody", () => {
	it("turn mode: asks to stop the tutor's reply in plain words, what it wrote stays, Stop", async () => {
		await mount("turn");
		assert.ok(document.querySelector('[data-testid="abort-turn-dialog"]'));
		assert.equal(text("abort-turn-title"), "Stop the tutor's reply?");
		assert.equal(text("abort-turn-line"), "What it has written so far stays.");
		assert.equal(text("abort-turn-cancel"), "Cancel");
		assert.equal(text("abort-turn-confirm"), "Stop");
	});

	it("question mode: asks to skip the question, the tutor goes on without it, Skip", async () => {
		await mount("question");
		assert.equal(text("abort-turn-title"), "Skip this question?");
		assert.equal(text("abort-turn-line"), "The tutor goes on without your answer.");
		assert.equal(text("abort-turn-confirm"), "Skip");
		// the stop copy must not leak into the skip mode
		assert.ok(!(document.body.textContent ?? "").includes("Stop the tutor"));
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

describe("Esc's words", () => {
	it("asks to skip or stop in his words, with no abort, turn or teacher", () => {
		const all = [...[STOP_WORDS.turn, STOP_WORDS.question, STOP_WORDS.problem].flatMap((mode): string[] => Object.values(mode)), STOP_WORDS.alsoStops].join(" ");
		assert.doesNotMatch(all, /abort|turn|teacher|dismiss|discard/i);
		assert.deepEqual([STOP_WORDS.turn.action, STOP_WORDS.question.action, STOP_WORDS.problem.action], ["Stop", "Skip", "Skip"]);
	});
});
