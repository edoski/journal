/**
 * Tab is dead (Edo, 17 Sep 2026), so the question's arrows reach his
 * thinking: ↓ past the last choice moves into it, ↑ at its start comes
 * back to the last choice (round 4: the cheat sheet still listed ⇥).
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";
import { KEYBOARD_ACTIONS } from "../src/core/keyboard.ts";
import type { AskToolInput } from "../src/core/question-core.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true });

const input = {
	question: "How do you want to approach the computation?",
	options: [{ label: "A worked example", value: "example" }, { label: "Straight to the computation", value: "compute" }],
} as AskToolInput;

function press(target: EventTarget, key: string) {
	const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
	Object.assign(event, { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false });
	target.dispatchEvent(event);
}

/** A key the document hears from `from`, as the dock's listener does. */
function pressFrom(from: EventTarget, key: string) {
	const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
	Object.assign(event, { key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false });
	Object.defineProperty(event, "target", { get: () => from, set: () => {}, configurable: true });
	document.dispatchEvent(event);
}

test("↓ past the last choice reaches his thinking, and ↑ at its start comes back", async () => {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<QuestionDock toolName="ask_user_question" toolCallId="q1" input={input} expanded onExpand={() => {}} onSubmit={() => {}} />));
		const rows = [...host.querySelectorAll<HTMLElement>("[data-kbdrow]")];
		const last = rows.at(-1)!;
		const thinking = host.querySelector("textarea")!;
		let focused: Element | null = null;
		const origFocus = dom.window.HTMLElement.prototype.focus;
		dom.window.HTMLElement.prototype.focus = function (this: HTMLElement) {
			focused = this;
			origFocus?.call(this);
		};
		dom.window.HTMLElement.prototype.scrollIntoView = () => {};
		try {
			for (let i = 0; i < rows.length; i++) await act(async () => press(document.body, "ArrowDown"));
			assert.notEqual(focused, thinking, "the walk stops on the last choice first");
			await act(async () => press(document.body, "ArrowDown"));
			assert.equal(focused, thinking, "↓ past the last choice lands in his thinking");
			Object.assign(thinking, { selectionStart: 0, selectionEnd: 0 });
			await act(async () => pressFrom(thinking, "ArrowUp"));
			assert.ok(focused && last.contains(focused as Node), "↑ at the start of his thinking goes back to the last choice");
		} finally {
			dom.window.HTMLElement.prototype.focus = origFocus;
		}
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
});

test("the shortcuts list Tab nowhere and say Done for today", () => {
	assert.ok(!KEYBOARD_ACTIONS.some((a) => a.binding === "tab"));
	assert.equal(KEYBOARD_ACTIONS.find((a) => a.id === "done-tonight")?.label, "Done for today");
	assert.ok(!KEYBOARD_ACTIONS.some((a) => /tonight/i.test(a.label)));
});
