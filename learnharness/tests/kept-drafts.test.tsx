/**
 * Kept drafts (round 3, 14 Nov 2026): what he types in a box survives a
 * reload, Hint carries his work into the check it asks again, and Done
 * for today leaves it for the same question next time.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { beforeEach, describe, it, test } from "node:test";
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
Object.assign(globalThis, { window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

const { carriedForm, forgetClosedBoxes, formToKept, keepWords, keptWords } = await import("../components/lesson/kept-drafts.ts");
const { QuestionDock } = await import("../components/question-dock.tsx");

beforeEach(() => storage.clear());

describe("keepWords", () => {
	it("keeps a box's words and forgets an empty box", () => {
		keepWords("c1:composer", { text: "half a thought" });
		assert.equal(keptWords("c1:composer")?.text, "half a thought");
		keepWords("c1:composer", { text: "  " });
		assert.equal(keptWords("c1:composer"), undefined);
	});

	it("a question form round-trips with its choice", () => {
		keepWords("c1:q:k", { form: formToKept({ selection: { selected: new Set([1]), otherSelected: false }, thinking: "", other: "", text: "", confidence: "confident" }) });
		assert.deepEqual(keptWords("c1:q:k")?.form?.selected, [1]);
	});

	it("closed questions' boxes are forgotten, the open one and other lessons' stay", () => {
		keepWords("c1:q:old", { text: "a" });
		keepWords("c1:q:open", { text: "b" });
		keepWords("c2:q:other", { text: "c" });
		keepWords("c1:composer", { text: "d" });
		forgetClosedBoxes("c1", ["c1:q:open"]);
		assert.equal(keptWords("c1:q:old"), undefined);
		assert.equal(keptWords("c1:q:open")?.text, "b");
		assert.equal(keptWords("c2:q:other")?.text, "c");
		assert.equal(keptWords("c1:composer")?.text, "d");
	});
});

describe("carriedForm", () => {
	it("a typed answer fills the next answer box, or Your thinking beside choices", () => {
		const carry = { form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "v is in the kernel", confidence: "neutral" }) };
		assert.equal(carriedForm(carry, true)?.text, "v is in the kernel");
		assert.equal(carriedForm(carry, false)?.thinking, "v is in the kernel");
		assert.equal(carriedForm({ text: " " }, true), undefined);
	});
});

const check = (question: string) => ({ question, correctAnswer: "hidden", type: "check" }) as never;

async function mount(props: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(<QuestionDock toolName="explain" toolCallId="q2" input={check("Why?")} expanded onExpand={() => {}} onSubmit={() => {}} {...props} />));
	return { host, done: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test("a check asked again after Hint opens with the work he had typed, and takes it once", async () => {
	keepWords("carry:la", { form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "Av = λv gives (A − λI)v = 0", confidence: "neutral" }) });
	const { host, done } = await mount({ keepAs: "c1:q:new", carryAs: "carry:la" });
	try {
		assert.equal(host.querySelector<HTMLTextAreaElement>('[data-testid="answer-field"]')!.value, "Av = λv gives (A − λI)v = 0");
		assert.equal(keptWords("carry:la"), undefined, "the carry is taken once");
		assert.equal(keptWords("c1:q:new")?.form?.text, "Av = λv gives (A − λI)v = 0", "and now kept in its own box");
	} finally {
		await done();
	}
});

test("after a reload a check opens with what he typed in it", async () => {
	keepWords("c1:q:k", { form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "the trace check", confidence: "guessing" }) });
	const { host, done } = await mount({ keepAs: "c1:q:k" });
	try {
		assert.equal(host.querySelector<HTMLTextAreaElement>('[data-testid="answer-field"]')!.value, "the trace check");
	} finally {
		await done();
	}
});
