import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";
import { SessionModel } from "../components/session-core.ts";
import { findPendingToolCall } from "../src/core/pending.ts";
import { pendingQuestionOf, type LhMessage } from "../src/core/native-messages.ts";
import { emptyDockSelection, type ExplainToolInput, type QuestionAnswerData } from "../src/core/question-core.ts";

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

const answerField = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>('[data-testid="answer-field"] textarea')!;
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

test("live question validation → turn_end placeholder → canonical sync keeps the same form and its state", async () => {
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	const encoder = new TextEncoder();
	let wire!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({ start(controller) { wire = controller; } });
	const model = new SessionModel({ chatId: "fixture", initialMessages: [], fetch: async () => new Response(body) });
	let submitted: QuestionAnswerData | undefined;
	const render = () => {
		const state = model.getState();
		const pending = findPendingToolCall(state.messages, pendingQuestionOf(state.nativeMessages));
		root.render(pending ? <QuestionDock key={`question:${pending.key}`}
			toolName="explain" toolCallId={pending.toolCallId} input={pending.input as ExplainToolInput}
			initialDraft={{ selection: emptyDockSelection(), thinking: "", other: "", text: "Keep my answer", confidence: "neutral" }}
			expanded onExpand={() => {}} onSubmit={answer => { submitted = answer; }} /> : null);
	};
	model.onChange = render;
	const event = async (value: unknown) => {
		await act(async () => { wire.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); });
	};
	let consume: Promise<void> | undefined;
	try {
		await act(async () => { consume = model.resumeStream(false); });
		const saved = question("saved", "q1", "Streamed question");
		const { id: _savedId, ...message } = saved;
		await event({ type: "message_start", message });
		await event({ type: "message_end", message });
		assert.equal(host.querySelector('[data-testid="question-dock"]'), null, "validation still gates the form");
		await event({ type: "tool_execution_end", toolCallId: "q1", toolName: "explain", isError: false,
			result: { content: [{ type: "text", text: "Question posed" }], details: null } });
		const form = host.querySelector('[data-testid="question-dock"]');
		assert.ok(form);
		const occurrence = pendingQuestionOf(model.getState().nativeMessages)!;
		await act(async () => { confident(host).click(); });
		await event({ type: "turn_end", message, toolResults: [{ role: "toolResult", toolCallId: "q1", toolName: "explain",
			content: [{ type: "text", text: "Question posed" }], details: null, isError: false, timestamp: 1 }] });
		assert.ok(host.querySelector('[data-testid="question-dock"]') === form, "placeholder must never unmount the form");
		assert.deepEqual(pendingQuestionOf(model.getState().nativeMessages), occurrence, "exact native occurrence stays pending");
		await act(async () => { model.setMessages([saved]); });
		assert.ok(host.querySelector('[data-testid="question-dock"]') === form, "canonical save must not reset the form either");
		assert.equal(confident(host).getAttribute("aria-checked"), "true");
		assert.equal(answerField(host).value, "Keep my answer");
		await act(async () => { host.querySelector('form')!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
		assert.equal(submitted?.text, "Keep my answer");
		assert.equal(submitted?.confidence, "confident", "the React form state, not only DOM attributes, survived");
	} finally {
		await act(async () => {
			wire.enqueue(encoder.encode("data: [DONE]\n\n")); wire.close();
			await consume;
			root.unmount();
		});
		model.onChange = undefined;
		host.remove();
	}
});

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
