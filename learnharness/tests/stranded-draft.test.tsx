import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { parseHTML } from "linkedom";
import type { Root } from "./helpers/app-render.tsx";
import { StickToBottom } from "use-stick-to-bottom";
import { ProseComposer } from "../components/lesson/prose/prose-composer.tsx";
import { forgetRescue, holdsRescue, keepRescue, overtakenDraft } from "../components/lesson/stranded-draft.ts";
import { keptWords, setKeptWindow } from "../components/lesson/kept-drafts.ts";
import { emptyDockSelection } from "../src/core/index.ts";

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
setKeptWindow("w-one", { live: ["w-one"] });

const { window, document } = parseHTML("<html><body></body></html>");
Object.assign(document, { oninput: null });
Object.assign(globalThis, { window, document, Element: window.Element, HTMLElement: window.HTMLElement, Event: window.Event });

const roots: Root[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await act(async () => root.unmount());
	document.body.innerHTML = "";
});

test("words typed in a question another window answered go to the message box", () => {
	// Round 2: tab 0's typed draft was wiped with no word when tab 1 answered.
	assert.deepEqual(overtakenDraft("q:1", null, { key: "q:1", text: "(1,1) and (1,-1)" }, null), { to: "box", words: "(1,1) and (1,-1)" });
	// Round 7: answered and replaced by the next question at once, the
	// words are still kept, not dropped with the old question.
	assert.deepEqual(overtakenDraft("q:1", "q:2", { key: "q:1", text: "trace is 7, det is" }, null), { to: "box", words: "trace is 7, det is" });
	assert.deepEqual(overtakenDraft("q:1", "p:3", { key: "q:1", text: "trace is 7, det is" }, null), { to: "box", words: "trace is 7, det is" });
});

test("words typed in a question another window took a hint on wait for it to be asked again", () => {
	// Round 7 (robustness major 1): window one's Hint wiped window two's draft.
	assert.deepEqual(overtakenDraft("q:1", null, { key: "q:1", text: "lambda is 3 and 1" }, "hint"), { to: "carry", words: "lambda is 3 and 1", why: "hint" });
	assert.deepEqual(overtakenDraft("q:1", "q:2", { key: "q:1", text: "lambda is 3 and 1" }, "asked"), { to: "carry", words: "lambda is 3 and 1", why: "asked" });
});

test("the box remembers which words were rescued until he makes them his", () => {
	keepRescue("c1", "trace is 7, det is");
	assert.equal(holdsRescue("c1", "trace is 7, det is"), true);
	assert.equal(holdsRescue("c1", "a note of my own\n\ntrace is 7, det is"), true);
	assert.equal(holdsRescue("c1", "trace is 7, det is 10, so 5 and 2"), false, "words he typed on are his message");
	forgetRescue("c1");
	assert.equal(holdsRescue("c1", "trace is 7, det is"), false);
});

test("nothing is overtaken when the dock stays, nothing was typed, or the words belong to another dock", () => {
	assert.equal(overtakenDraft("q:1", "q:1", { key: "q:1", text: "x" }, null), null);
	assert.equal(overtakenDraft("q:1", null, { key: "q:1", text: "  " }, null), null);
	assert.equal(overtakenDraft("q:1", null, { key: "q:2", text: "x" }, null), null);
	assert.equal(overtakenDraft("q:1", null, null, "hint"), null);
});

test("Esc back to the answer never moves rescued words into the next question's answer", async () => {
	// Round 6: the rescued words, carried by Esc into the next question's
	// answer, would have been sent by Enter. Round 7 keeps them in the box.
	keepRescue("c2", "trace is 7, det is");
	let box = "trace is 7, det is";
	let mode: "answer" | "ask" = "ask";
	const toggleRef: { current: (() => void) | null } = { current: null };
	const noop = () => {};
	const host = document.createElement("div") as unknown as HTMLElement;
	document.body.append(host);
	const { createRoot } = await import("./helpers/app-render.tsx");
	const root = createRoot(host);
	roots.push(root);
	await act(async () => {
		root.render(
			<StickToBottom>
				<ProseComposer
					open={{ kind: "question", key: "k2", tool: "explain", toolCallId: "q2", input: { question: "What is det A?", correctAnswer: "3", type: "check" } }}
					answer={{ openKey: "k2", selection: emptyDockSelection(), confidence: "neutral", mode, toggle: noop, setConfidence: noop, setMode: (m: "answer" | "ask") => { mode = m; } }}
					message={{ busy: false, value: box, revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
					onAskInstead={noop}
					toggleRef={toggleRef}
					busy={false}
					chatId="c2"
					onSaveDraft={noop}
					onSubmitAnswer={noop}
					onSubmitThinking={async () => true}
					onRequest={noop}
					onDraftChange={noop}
				/>
			</StickToBottom>,
		);
	});
	await act(async () => toggleRef.current?.());
	assert.equal(mode, "answer");
	assert.equal(box, "trace is 7, det is", "the rescued words stay in the message box");
	assert.equal(keptWords("c2:q:k2"), undefined, "and never become the answer");
});

test("the composer answering a question reports what he types as he types it", async () => {
	const seen: [string, string][] = [];
	const noop = () => {};
	const host = document.createElement("div") as unknown as HTMLElement;
	document.body.append(host);
	const { createRoot } = await import("./helpers/app-render.tsx");
	const root = createRoot(host);
	roots.push(root);
	await act(async () => {
		root.render(
			<StickToBottom>
				<ProseComposer
					open={{ kind: "question", key: "k1", tool: "explain", toolCallId: "q1", input: { question: "Which directions stay on their line?", correctAnswer: "(1,1) and (1,-1)", type: "check" } }}
					answer={{ openKey: "k1", selection: emptyDockSelection(), confidence: "neutral", mode: "answer", toggle: noop, setConfidence: noop, setMode: noop }}
					message={{ busy: false, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
					onAskInstead={noop}
					toggleRef={{ current: null }}
					busy={false}
					chatId="c1"
					onSaveDraft={noop}
					onSubmitAnswer={noop}
					onSubmitThinking={async () => true}
					onRequest={noop}
					onDraftChange={(key: string, text: string) => seen.push([key, text])}
				/>
			</StickToBottom>,
		);
	});
	const field = host.querySelector<HTMLTextAreaElement>("textarea")!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, "(1,1) by 3");
		field.dispatchEvent(new window.Event("input", { bubbles: true }));
	});
	assert.deepEqual(seen.at(-1), ["q:k1", "(1,1) by 3"]);
});

// Round 8 (4 #5): a rescued draft dies with its own question. After a
// restart the draft rescued for one question stayed in the message box, came
// back during a later hint with a live Send, and merged ahead of the next
// rescue ("w2 draft: so 2x + y = 0… ⏎⏎ W2 DRAFT: char poly of C…").
test("a new rescue replaces an untouched older one instead of merging with it", async () => {
	const { rescuedBox } = await import("../components/lesson/stranded-draft.ts");
	keepRescue("c9", "w2 draft: so 2x + y = 0", "q:k1");
	assert.equal(rescuedBox("c9", "w2 draft: so 2x + y = 0", "W2 DRAFT: char poly of C"), "W2 DRAFT: char poly of C");
	assert.equal(rescuedBox("c9", "my own note", "W2 DRAFT: char poly of C"), "my own note\n\nW2 DRAFT: char poly of C", "words of his own stay");
});

test("the rescue leaves the box once the question after it closes, unless he made it his", async () => {
	const { boxAfterClose } = await import("../components/lesson/stranded-draft.ts");
	keepRescue("c8", "so 2x + y = 0", "q:k1");
	assert.equal(boxAfterClose("c8", "so 2x + y = 0", "q:k1"), null, "its own question leaving is the rescue itself");
	assert.equal(boxAfterClose("c8", "so 2x + y = 0", "q:k2"), "", "the next question closing takes it away");
	assert.equal(keptWords("c8:rescued"), undefined, "and forgets it");
	keepRescue("c8", "so 2x + y = 0", "q:k1");
	assert.equal(boxAfterClose("c8", "so 2x + y = 0, so v = (1, −2)", "q:k2"), null, "words he typed on are his message");
});
