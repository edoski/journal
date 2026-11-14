/**
 * Enter on a picked choice sends it once (round 3, 14 Nov 2026): a
 * clicked option kept focus and Enter only re-pressed it, despite the
 * "↵ to submit" under the choices.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";
import type { AskToolInput, QuestionAnswerData } from "../src/core/question-core.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

const input: AskToolInput = {
	question: "How do you want to approach the computation?",
	options: [{ label: "A worked example", value: "example" }, { label: "Straight to the computation", value: "compute" }],
} as AskToolInput;

test("Enter on a clicked option sends the answer, once", async () => {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const sent: QuestionAnswerData[] = [];
	try {
		await act(async () => root.render(<QuestionDock toolName="ask_user_question" toolCallId="q1" input={input} expanded onExpand={() => {}} onSubmit={(a) => sent.push(a)} />));
		const option = host.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]!;
		// Chromium marks the clicked option :focus-visible, so the window's
		// Enter law leaves it native Enter (enter-submits.ts).
		const matches = option.matches.bind(option);
		option.matches = (selector: string) => selector === ":focus-visible" || matches(selector);
		await act(async () => { option.click(); option.focus(); });
		await act(async () => {
			const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
			Object.assign(event, { key: "Enter", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false });
			option.dispatchEvent(event);
		});
		assert.equal(sent.length, 1);
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
});
