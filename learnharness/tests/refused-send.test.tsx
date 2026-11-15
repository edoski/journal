/**
 * A send refused at once (Claude not signed in, a provider error, no
 * connection) keeps what he wrote in the box (round 5, 14 Nov 2026).
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
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
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
const dom = parseHTML("<html><body></body></html>");
// React wires onChange to the input event only where `oninput` is supported,
// and mounts a seeded textarea through its default value.
Object.assign(dom.document, { oninput: null });
Object.defineProperty(dom.window.HTMLTextAreaElement.prototype, "defaultValue", {
	get(this: HTMLTextAreaElement) { return this.textContent; },
	set(this: HTMLTextAreaElement, value: string) { this.textContent = value; },
});
Object.assign(globalThis, { window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

const { createRoot } = await import("react-dom/client");
const { ProseComposer } = await import("../components/lesson/prose/prose-composer.tsx");
const { StickToBottom } = await import("use-stick-to-bottom");
const { emptyDockSelection } = await import("../src/core/index.ts");

const noop = () => {};

test("work on a problem refused at once comes back into the box", async () => {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let refuse: (accepted: boolean) => void = noop;
	const answer = { openKey: "p1", selection: emptyDockSelection(), confidence: "neutral" as const, mode: "answer" as const, toggle: noop, setConfidence: noop, setMode: noop };
	await act(async () => root.render(
		<StickToBottom>
			<ProseComposer
				open={{ kind: "problem", toolCallId: "p1", statement: "Find rank A." }}
				answer={answer}
				message={{ busy: false, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
				onAskInstead={noop}
				toggleRef={{ current: null }}
				busy={false}
				chatId="c1"
				onSaveDraft={noop}
				onSubmitAnswer={noop}
				onSubmitThinking={() => new Promise<boolean>((resolve) => { refuse = resolve; })}
				onRequest={noop}
				onDraftChange={noop}
			/>
		</StickToBottom>,
	));
	const field = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
	try {
		await act(async () => {
			Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field(), "rank 2, so nullity 3");
			field().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
		await act(async () => {
			host.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
		});
		assert.equal(field().value, "", "the box empties while the work is on its way");
		await act(async () => refuse(false));
		assert.equal(field().value, "rank 2, so nullity 3", "a refused send puts his work back");
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
});
