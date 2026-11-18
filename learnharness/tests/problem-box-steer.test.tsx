/**
 * Round 11 (4 major 1): words sent from a practice problem's box while the
 * tutor was still replying were ignored, then erased when the problem
 * closed. The problem box now sends them as the lesson box does, a message
 * to the running turn, and a refused one comes back as he typed it.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { parseHTML } from "linkedom";
import type { Root } from "./helpers/app-render.tsx";

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
const dom = parseHTML("<html><body></body></html>");
Object.assign(dom.document, { oninput: null });
Object.assign(globalThis, { window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("./helpers/app-render.tsx");
const { ProseComposer } = await import("../components/lesson/prose/prose-composer.tsx");
const { StickToBottom } = await import("use-stick-to-bottom");
const { emptyDockSelection } = await import("../src/core/index.ts");

const noop = () => {};
const roots: Root[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await act(async () => root.unmount());
	document.body.innerHTML = "";
});

async function problemBox(props: { busy: boolean; onSteer: (text: string) => Promise<boolean>; onSubmitThinking?: () => Promise<boolean> }) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	roots.push(root);
	const answer = { openKey: "p1", selection: emptyDockSelection(), confidence: "neutral" as const, mode: "answer" as const, toggle: noop, setConfidence: noop, setMode: noop };
	await act(async () => root.render(
		<StickToBottom>
			<ProseComposer
				open={{ kind: "problem", toolCallId: "p1", statement: "Does the sum of 1 − cos(1/n) converge?" }}
				answer={answer}
				message={{ busy: props.busy, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
				onAskInstead={noop}
				toggleRef={{ current: null }}
				busy={props.busy}
				chatId="c1"
				onSaveDraft={noop}
				onSubmitAnswer={noop}
				onSubmitThinking={props.onSubmitThinking ?? (async () => true)}
				onSteer={props.onSteer}
				onRequest={noop}
				onDraftChange={noop}
			/>
		</StickToBottom>,
	));
	const field = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
	const type = (words: string) => act(async () => {
		Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field(), words);
		field().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
	const enter = () => act(async () => {
		const keydown = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(keydown, { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false });
		field().dispatchEvent(keydown);
	});
	const send = () => host.querySelector<HTMLButtonElement>('[data-slot="composer-send"]')!;
	return { field, type, enter, send };
}

test("Enter in the problem box while the tutor replies sends his words to the tutor, as the lesson box does", async () => {
	const steered: string[] = [];
	let thought = 0;
	const box = await problemBox({ busy: true, onSteer: async (text) => (steered.push(text), true), onSubmitThinking: async () => (thought++, true) });
	assert.equal(box.send().getAttribute("aria-label"), "Stop", "an empty box keeps the stop square");
	await box.type("also, does the same trick work for sum sin(1/n)? ");
	assert.equal(box.send().getAttribute("aria-label"), "Send", "words he typed can go, so the button sends them");
	await box.enter();
	assert.deepEqual(steered, ["also, does the same trick work for sum sin(1/n)?"], "his words go to the running turn");
	assert.equal(thought, 0, "never as his work on the problem, which waits for the turn to end");
	assert.equal(box.field().value, "", "the box empties once they are on their way");
});

test("words sent to the running turn and refused come back into the problem box as he typed them", async () => {
	let settle: (accepted: boolean) => void = noop;
	const box = await problemBox({ busy: true, onSteer: () => new Promise<boolean>((resolve) => { settle = resolve; }) });
	await box.type("wait, why is it 1/e and not e? ");
	await box.enter();
	assert.equal(box.field().value, "");
	await act(async () => settle(false));
	assert.equal(box.field().value, "wait, why is it 1/e and not e? ", "the trailing space too");
});

test("with no turn running, Enter in the problem box still submits his work", async () => {
	const steered: string[] = [];
	let thought = 0;
	const box = await problemBox({ busy: false, onSteer: async (text) => (steered.push(text), true), onSubmitThinking: async () => (thought++, true) });
	await box.type("by the limit comparison with 1/n^2, it converges");
	await box.enter();
	assert.equal(thought, 1);
	assert.deepEqual(steered, []);
});
