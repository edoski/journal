import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";
import { pendingQuestionOf, type LhMessage } from "../src/core/native-messages.ts";
import type { ExplainToolInput } from "../src/core/question-core.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement,
	IS_REACT_ACT_ENVIRONMENT: true,
});

function question(id: string, callId: string, text: string): LhMessage {
	return { id, role: "assistant", content: [{ type: "toolCall", id: callId, name: "explain", arguments: {
		question: text, correctAnswer: "Because the derivative is zero there.",
	} }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
}

const confident = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-testid="confidence-choice"] [data-state="confident"]')!;

// The same keyed-content boundary as Chat's DockOverlay. This exercises the
// actual form state under synthetic DOM, not CSS layout or a live provider.
for (const reusedId of [false, true]) {
	test(`question form resets on a newer question (${reusedId ? "reused" : "unique"} call id)`, async () => {
		const host = document.createElement("div"); document.body.append(host);
		const root = createRoot(host);
		const render = async (messages: LhMessage[]) => {
			const pending = pendingQuestionOf(messages)!;
			await act(async () => root.render(<QuestionDock key={`question:${pending.key}`}
				toolName="explain" toolCallId={pending.toolCallId} input={pending.input as ExplainToolInput}
				expanded onExpand={() => {}} onSubmit={() => {}} />));
		};
		try {
			const old = question("old", "q1", "OLD question");
			await render([old]);
			const oldForm = host.querySelector('[data-testid="question-dock"]');
			await act(async () => { confident(host).click(); });
			assert.equal(confident(host).getAttribute("aria-checked"), "true");
			await render([old, question("new", reusedId ? "q1" : "q2", "NEW question")]);
			assert.notEqual(host.querySelector('[data-testid="question-dock"]'), oldForm);
			assert.equal(confident(host).getAttribute("aria-checked"), "false");
			assert.match(host.textContent!, /NEW question/);
			assert.doesNotMatch(host.textContent!, /OLD question/);
		} finally { await act(async () => root.unmount()); host.remove(); }
	});
}

test("saving a unique live question preserves its mounted form and confidence", async () => {
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	const live = question("c_live", "unique-q", "Same question");
	const saved = { ...live, id: "saved" };
	const render = async (messages: LhMessage[]) => {
		const pending = pendingQuestionOf(messages)!;
		await act(async () => root.render(<QuestionDock key={`question:${pending.key}`}
			toolName="explain" toolCallId={pending.toolCallId} input={pending.input as ExplainToolInput}
			expanded onExpand={() => {}} onSubmit={() => {}} />));
	};
	try {
		await render([live]);
		const form = host.querySelector('[data-testid="question-dock"]');
		await act(async () => { confident(host).click(); });
		// Append-only adoption can briefly retain the live copy beside the saved one.
		await render([saved, live]);
		await render([saved]);
		assert.equal(host.querySelector('[data-testid="question-dock"]'), form);
		assert.equal(confident(host).getAttribute("aria-checked"), "true");
	} finally { await act(async () => root.unmount()); host.remove(); }
});
