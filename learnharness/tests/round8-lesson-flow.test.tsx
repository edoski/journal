/**
 * Round 8 (lesson reading m3, m9): the goal question took a pick, then a
 * second send under "Anything to add?"; Show me gave the question up at
 * once, with no confirm and no undo.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

class MemoryStorage {
	private map = new Map<string, string>();
	get length() { return this.map.size; }
	key(i: number) { return [...this.map.keys()][i] ?? null; }
	getItem(k: string) { return this.map.get(k) ?? null; }
	setItem(k: string, v: string) { this.map.set(k, v); }
	removeItem(k: string) { this.map.delete(k); }
	clear() { this.map.clear(); }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
Object.assign(dom.document, { oninput: null });
Object.defineProperty(dom.window.HTMLTextAreaElement.prototype, "defaultValue", {
	get(this: HTMLTextAreaElement) { return this.textContent; },
	set(this: HTMLTextAreaElement, value: string) { this.textContent = value; },
});

const { createRoot } = await import("react-dom/client");
const { ProseComposer } = await import("../components/lesson/prose/prose-composer.tsx");
const { StickToBottom } = await import("use-stick-to-bottom");
const { emptyDockSelection, kbdEventForAction } = await import("../src/core/index.ts");
type Answer = import("../src/core/index.ts").QuestionAnswerData;

const noop = () => {};
const goal = { question: "What do you need from invertible matrices?", options: [{ label: "Decide when a matrix is invertible" }, { label: "Compute inverses" }] };
const check = { type: "check", nodeId: "n", question: "What is $\\det B$?", correctAnswer: "1" };

async function mount(open: { tool: string; input: unknown }, picks: { count: number; selected: number[] }, sent: Answer[], typed = "") {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const render = (count: number, selected: number[]) =>
		root.render(
			<StickToBottom>
				<ProseComposer
					open={{ kind: "question", key: "k1", tool: open.tool, toolCallId: "q1", input: open.input }}
					answer={{ openKey: "k1", selection: { ...emptyDockSelection(), selected: new Set(selected) }, confidence: "neutral", mode: "answer", picks: count, toggle: noop, setConfidence: noop, setMode: noop }}
					message={{ busy: false, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
					onAskInstead={noop}
					toggleRef={{ current: null }}
					busy={false}
					chatId="c1"
					onSaveDraft={noop}
					onSubmitAnswer={(a) => sent.push(a)}
					onSubmitThinking={async () => true}
					onRequest={noop}
					onDraftChange={noop}
				/>
			</StickToBottom>,
		);
	await act(async () => render(picks.count, picks.selected));
	if (typed) {
		const field = host.querySelector<HTMLTextAreaElement>("textarea")!;
		await act(async () => {
			Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, typed);
			field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
	}
	return {
		host,
		pick: (index: number) => act(async () => render(picks.count + 1, [index])),
		done: async () => {
			await act(async () => root.unmount());
			host.remove();
		},
	};
}

test("a single choice picked with nothing typed sends at once", async () => {
	const sent: Answer[] = [];
	const view = await mount({ tool: "ask_user_question", input: goal }, { count: 0, selected: [] }, sent);
	try {
		assert.equal(sent.length, 0, "nothing goes before a pick");
		await view.pick(1);
		assert.equal(sent.length, 1, "the pick is the answer: no second send");
		assert.deepEqual(sent[0]!.answers.map((a) => a.label), ["Compute inverses"]);
	} finally {
		await view.done();
	}
});

test("a pick after typed words waits for Send, so his words go with it", async () => {
	const sent: Answer[] = [];
	const view = await mount({ tool: "ask_user_question", input: goal }, { count: 0, selected: [] }, sent, "mostly for the exam");
	try {
		await view.pick(0);
		assert.equal(sent.length, 0);
	} finally {
		await view.done();
	}
});

test("Show me asks before it gives the check up, and Cancel leaves the question open", async () => {
	const sent: Answer[] = [];
	const view = await mount({ tool: "explain", input: check }, { count: 0, selected: [] }, sent);
	try {
		await act(async () => window.dispatchEvent(new dom.window.Event(kbdEventForAction("practice-show"))));
		assert.equal(sent.length, 0, "nothing is given up on the press alone");
		const dialog = () => document.querySelector('[data-testid="show-me-dialog"]');
		assert.ok(dialog(), "the confirm opens");
		assert.match(dialog()!.textContent ?? "", /Show the answer\?/);
		await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="show-me-cancel"]')!.click());
		assert.equal(sent.length, 0, "Cancel gives nothing up");
		await act(async () => window.dispatchEvent(new dom.window.Event(kbdEventForAction("practice-show"))));
		await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="show-me-confirm"]')!.click());
		assert.equal(sent.length, 1);
		assert.equal(sent[0]!.showMe, true);
	} finally {
		await view.done();
	}
});
