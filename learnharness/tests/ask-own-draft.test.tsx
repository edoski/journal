/**
 * Round 8 (4 #4, 3 m4): Answer and Ask each keep their own draft. Esc moved
 * his half answer into the Ask box, and typing the side question over it
 * then sending destroyed it: back in answer mode the box was empty, in
 * storage too. Switching now only switches: the half answer stays in the
 * answer box, the side question in the message box.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
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

const { createRoot } = await import("react-dom/client");
const { formToKept, keepWords, keptWords, setKeptWindow } = await import("../components/lesson/kept-drafts.ts");
const { ProseComposer } = await import("../components/lesson/prose/prose-composer.tsx");
const { StickToBottom } = await import("use-stick-to-bottom");
const { emptyDockSelection } = await import("../src/core/index.ts");

beforeEach(() => {
	storage.clear();
	setKeptWindow("w-one", { live: ["w-one"] });
});

const noop = () => {};
const half = "tr C = 7, det C = 10 + 2 = 12, so";

async function mount(start: { box: string; mode: "answer" | "ask" }) {
	const state = { ...start };
	const toggleRef: { current: (() => void) | null } = { current: null };
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const render = () =>
		root.render(
			<StickToBottom>
				<ProseComposer
					open={{ kind: "question", key: "k1", tool: "explain", toolCallId: "q1", input: { question: "Eigenvalues of C?", correctAnswer: "3, 4", type: "check" } }}
					answer={{ openKey: "k1", selection: emptyDockSelection(), confidence: "neutral", mode: state.mode, toggle: noop, setConfidence: noop, setMode: (m: "answer" | "ask") => { state.mode = m; } }}
					message={{ busy: false, value: state.box, revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
					onAskInstead={noop}
					toggleRef={toggleRef}
					busy={false}
					chatId="c1"
					onSaveDraft={noop}
					onSubmitAnswer={noop}
					onSubmitThinking={async () => true}
					onRequest={noop}
					onDraftChange={noop}
				/>
			</StickToBottom>,
		);
	await act(async () => render());
	return {
		state,
		toggle: async () => {
			await act(async () => toggleRef.current?.());
			await act(async () => render());
		},
		done: async () => { await act(async () => root.unmount()); host.remove(); },
	};
}

test("Esc to Ask leaves the half answer in the answer box and the message box as it was", async () => {
	keepWords("c1:q:k1", { form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: half, confidence: "neutral" }) });
	const view = await mount({ box: "", mode: "answer" });
	try {
		await view.toggle();
		assert.equal(view.state.mode, "ask");
		assert.equal(view.state.box, "", "the Ask box takes nothing from the answer");
		assert.equal(keptWords("c1:q:k1")?.form?.text, half, "the half answer stays where he wrote it");
	} finally {
		await view.done();
	}
});

test("Esc back to the answer leaves the side question in the message box and the answer untouched", async () => {
	const view = await mount({ box: "is $3 the same as $3.00 here?", mode: "ask" });
	try {
		await view.toggle();
		assert.equal(view.state.mode, "answer");
		assert.equal(view.state.box, "is $3 the same as $3.00 here?");
		assert.equal(keptWords("c1:q:k1"), undefined, "his side question never becomes the answer");
	} finally {
		await view.done();
	}
});
