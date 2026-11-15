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

const { carriedForm, carryWords, forgetClosedBoxes, formToKept, keepWords, keptWords, setKeptWindow } = await import("../components/lesson/kept-drafts.ts");
const { ProseComposer } = await import("../components/lesson/prose/prose-composer.tsx");
const { StickToBottom } = await import("use-stick-to-bottom");
const { emptyDockSelection } = await import("../src/core/index.ts");

beforeEach(() => {
	storage.clear();
	setKeptWindow("w-one", { live: ["w-one"] });
});

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

describe("a box belongs to its window", () => {
	it("words typed in another open window never fill this window's box", () => {
		setKeptWindow("w-two", { live: ["w-one", "w-two"] });
		keepWords("c1:composer", { text: "draft in tab two: det of A-4I is" });
		setKeptWindow("w-one", { live: ["w-one", "w-two"] });
		assert.equal(keptWords("c1:composer"), undefined, "window one's box stays empty");
		keepWords("c1:composer", { text: "my own question" });
		setKeptWindow("w-two", { live: ["w-one", "w-two"] });
		assert.equal(keptWords("c1:composer")?.text, "draft in tab two: det of A-4I is", "and window two keeps its own words");
	});

	it("a reload keeps the window, so its words come back", () => {
		keepWords("c1:q:k", { text: "half a thought" });
		setKeptWindow("w-one", { live: ["w-one"] });
		assert.equal(keptWords("c1:q:k")?.text, "half a thought");
	});

	it("after a restart the new window takes the words of a window that is gone, once", () => {
		setKeptWindow("w-old", { live: ["w-old"] });
		keepWords("c1:composer", { text: "typed before the restart" });
		setKeptWindow("w-new", { live: ["w-new"] });
		assert.equal(keptWords("c1:composer")?.text, "typed before the restart");
		setKeptWindow("w-other", { live: ["w-new", "w-other"] });
		assert.equal(keptWords("c1:composer"), undefined, "a second window does not take them too");
	});

	it("a window that wrote after this one looked is open, even if the locks missed it", () => {
		// Round 7: window two was reloading (its lock let go) when window one
		// looked, then carried its words; window one took them as a closed
		// window's and filled its own box with window two's draft.
		const looked = Date.now() - 1000;
		setKeptWindow("w-two", { live: ["w-two"] });
		keepWords("carry:la", { text: "window two's work", question: "why?" });
		setKeptWindow("w-one", { live: ["w-one"], seenAt: looked });
		assert.equal(keptWords("carry:la"), undefined, "window one does not take it");
		setKeptWindow("w-two", { live: ["w-one", "w-two"] });
		assert.equal(keptWords("carry:la")?.text, "window two's work", "window two still has it");
	});

	it("closing a question forgets only this window's box for it", () => {
		setKeptWindow("w-two", { live: ["w-one", "w-two"] });
		keepWords("c1:q:old", { text: "window two's work" });
		setKeptWindow("w-one", { live: ["w-one", "w-two"] });
		keepWords("c1:q:old", { text: "window one's work" });
		forgetClosedBoxes("c1", []);
		assert.equal(keptWords("c1:q:old"), undefined);
		setKeptWindow("w-two", { live: ["w-one", "w-two"] });
		assert.equal(keptWords("c1:q:old")?.text, "window two's work");
	});
});

describe("carriedForm", () => {
	it("a typed answer fills the next answer box, or Your thinking beside choices", () => {
		const carry = { form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "v is in the kernel", confidence: "neutral" }) };
		assert.equal(carriedForm(carry, true)?.text, "v is in the kernel");
		assert.equal(carriedForm(carry, false)?.thinking, "v is in the kernel");
		assert.equal(carriedForm({ text: " " }, true), undefined);
	});

	it("carried words come back as he typed them, so typing on after \"v = \" never gives \"v =(1, -2)\" (round 9, 4 #7)", () => {
		const form = (text: string, thinking = "") => ({ form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking, other: "", text, confidence: "neutral" }) });
		assert.equal(carriedForm(form("v = "), true)?.text, "v = ");
		assert.equal(carriedForm({ text: "  indented\n" }, true)?.text, "  indented\n");
		assert.equal(carriedForm(form("A v = 2v  ", "so v = "), true)?.text, "A v = 2v\n\nso v = ", "two parts still join at one paragraph break");
	});
});

const noop = () => {};
const check = { question: "Why?", correctAnswer: "hidden", type: "check" };

/** The Prose composer answering the question `key` (the check "Why?" unless
 *  told otherwise), kept in box `c1:q:<key>`. */
async function mount(key: string, carryScope?: string, input: unknown = check, tool = "explain", reaskOf?: string) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const answer = { openKey: key, selection: emptyDockSelection(), confidence: "neutral" as const, mode: "answer" as const, toggle: noop, setConfidence: noop, setMode: noop };
	await act(async () => root.render(
		<StickToBottom>
			<ProseComposer
				open={{ kind: "question", key, tool, toolCallId: "q2", input }}
				answer={answer}
				message={{ busy: false, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
				onAskInstead={noop}
				toggleRef={{ current: null }}
				busy={false}
				chatId="c1"
				carryScope={carryScope}
				reaskOf={reaskOf}
				onSaveDraft={noop}
				onSubmitAnswer={noop}
				onSubmitThinking={async () => true}
				onRequest={noop}
				onDraftChange={noop}
			/>
		</StickToBottom>,
	));
	const field = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
	return { field, done: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test("a check asked again after Hint opens with the work he had typed, and takes it once", async () => {
	carryWords("carry:la", { question: "Why?", from: "q1" }, { form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "Av = λv gives (A − λI)v = 0", confidence: "neutral" }) }, []);
	const { field, done } = await mount("new", "carry:la");
	try {
		assert.equal(field().value, "Av = λv gives (A − λI)v = 0");
		assert.equal(keptWords("carry:la"), undefined, "the carry is taken once");
		assert.equal(keptWords("c1:q:new")?.form?.text, "Av = λv gives (A − λI)v = 0", "and now kept in its own box");
	} finally {
		await done();
	}
});

test("after a reload a check opens with what he typed in it", async () => {
	keepWords("c1:q:k", { form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "the trace check", confidence: "guessing" }) });
	const { field, done } = await mount("k");
	try {
		assert.equal(field().value, "the trace check");
	} finally {
		await done();
	}
});

test("a carried answer waits for its own question: another question opens empty and leaves it waiting", async () => {
	// Round 6 (daily loop N5): the Done-for-today draft filled the next,
	// unrelated Yes/No question, and Enter would have sent it as its note.
	const typed = formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "(3,2) = 1·(2,3) + 1·(1,−1)", confidence: "neutral" });
	carryWords("carry:la", { question: "Why?", from: "q1" }, { form: typed }, []);
	const choice = { question: "Pick up the stack question first?", options: [{ label: "Yes" }, { label: "Not now" }] };
	const other = await mount("yes-no", "carry:la", choice, "ask_user_question");
	try {
		assert.equal(other.field().value, "", "another question never inherits it");
		assert.equal(keptWords("carry:la")?.form?.text, typed.text, "it still waits for its question");
	} finally {
		await other.done();
	}
	const same = await mount("again", "carry:la", { ...check, question: "  Why?\n" });
	try {
		assert.equal(same.field().value, typed.text, "the same question asked again opens with it");
		assert.equal(keptWords("carry:la"), undefined, "taken once");
	} finally {
		await same.done();
	}
});

test("the question asked right after a hint takes his work even in other words", async () => {
	// Round 7 (robustness): the tutor asked the check again without its
	// "Say why.", so the carry waiting for the old words was never taken.
	const typed = formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "(1,1) stays, stretched by 3", confidence: "neutral" });
	carryWords("carry:la", { question: "Which directions stay on their line? Say why.", from: "q1" }, { form: typed }, []);
	const unrelated = await mount("other", "carry:la", { ...check, question: "Which directions stay on their line?" }, "explain", "q0");
	try {
		assert.equal(unrelated.field().value, "", "a question after another call does not take it");
	} finally {
		await unrelated.done();
	}
	const again = await mount("again", "carry:la", { ...check, question: "Which directions stay on their line?" }, "explain", "q1");
	try {
		assert.equal(again.field().value, typed.text, "the re-ask opens with his work");
		assert.equal(keptWords("carry:la"), undefined, "taken once");
	} finally {
		await again.done();
	}
});
