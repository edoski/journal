/**
 * Round 8 (4 #3): how sure he said he was stays with his words. A reload
 * brought his words and photo back but the meter read Neutral (a question
 * and a practice problem alike), and a send refused while offline gave his
 * words back with the meter reset.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";

class MemoryStorage {
	private map = new Map<string, string>();
	get length() { return this.map.size; }
	key(i: number) { return [...this.map.keys()][i] ?? null; }
	getItem(k: string) { return this.map.get(k) ?? null; }
	setItem(k: string, v: string) { this.map.set(k, v); }
	removeItem(k: string) { this.map.delete(k); }
	clear() { this.map.clear(); }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
const dom = parseHTML("<html><body></body></html>");
// React mounts a seeded textarea through its default value.
Object.defineProperty(dom.window.HTMLTextAreaElement.prototype, "defaultValue", {
	get(this: HTMLTextAreaElement) { return this.textContent; },
	set(this: HTMLTextAreaElement, value: string) { this.textContent = value; },
});
Object.assign(globalThis, { window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

const { formToKept, keepWords, keptWords, setKeptWindow } = await import("../components/lesson/kept-drafts.ts");
const { ProseComposer, proseBox, proseOpenKey } = await import("../components/lesson/prose/prose-composer.tsx");
const { useProseAnswer } = await import("../components/lesson/prose/prose-answer.tsx");
const { StickToBottom } = await import("use-stick-to-bottom");

type Open = Parameters<typeof proseBox>[1] & object;

beforeEach(() => {
	storage.clear();
	setKeptWindow("w-one", { live: ["w-one"] });
});

const noop = () => {};

function Lesson({ open, submit }: { open: Open; submit: (text: string, confidence: string) => Promise<boolean> }) {
	const answer = useProseAnswer({ openKey: proseOpenKey(open), box: proseBox("c1", open) });
	return (
		<StickToBottom>
			<ProseComposer
				open={open}
				answer={answer}
				message={{ busy: false, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
				messageText={{ read: () => "", write: noop }}
				onAskInstead={noop}
				toggleRef={{ current: null }}
				busy={false}
				chatId="c1"
				onSaveDraft={noop}
				onSubmitAnswer={noop}
				onSubmitThinking={(text, confidence) => submit(text, confidence)}
				onRequest={noop}
				onDraftChange={noop}
			/>
		</StickToBottom>
	);
}

async function mount(open: Open, submit: (text: string, confidence: string) => Promise<boolean> = async () => true) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(<Lesson open={open} submit={submit} />));
	await act(async () => {});
	const meter = () => host.querySelector<HTMLElement>('[data-testid="confidence-choice"]')!.getAttribute("data-confidence");
	const field = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
	return { host, meter, field, done: async () => { await act(async () => root.unmount()); host.remove(); } };
}

const question: Open = { kind: "question", key: "k1", tool: "explain", toolCallId: "q1", input: { type: "check", question: "Eigenvalues of C?", correctAnswer: "3, 4" } };
const problem: Open = { kind: "problem", toolCallId: "p1", statement: "Find an eigenvector of A = [[1,2],[3,2]]." };

test("a reload brings back the confidence he set on a question", async () => {
	keepWords("c1:q:k1", { form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "tr C = 7", confidence: "guessing" }) });
	const view = await mount(question);
	try {
		assert.equal(view.field().value, "tr C = 7");
		assert.equal(view.meter(), "guessing");
		assert.equal(keptWords("c1:q:k1")?.form?.confidence, "guessing", "and keeps it");
	} finally {
		await view.done();
	}
});

test("a practice problem keeps its confidence with its words, and a reload brings both back", async () => {
	keepWords("c1:p:p1", { text: "−3x + 2y = 0" });
	const first = await mount(problem);
	try {
		await act(async () => first.host.querySelector<HTMLElement>('[data-testid="confidence-choice"]')!.click());
		assert.equal(first.meter(), "confident");
	} finally {
		await first.done();
	}
	const again = await mount(problem);
	try {
		assert.equal(again.field().value, "−3x + 2y = 0");
		assert.equal(again.meter(), "confident");
	} finally {
		await again.done();
	}
});

test("a refused send gives back his confidence with his words", async () => {
	keepWords("c1:p:p1", { text: "v = (2, 3)", confidence: "confident" });
	const sent: string[] = [];
	const view = await mount(problem, async (_text, confidence) => {
		sent.push(confidence);
		return false;
	});
	try {
		assert.equal(view.meter(), "confident");
		await act(async () => {
			view.host.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
		});
		await act(async () => {});
		assert.deepEqual(sent, ["confident"]);
		assert.equal(view.field().value, "v = (2, 3)");
		assert.equal(view.meter(), "confident");
	} finally {
		await view.done();
	}
});
