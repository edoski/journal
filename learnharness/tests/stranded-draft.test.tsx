import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { parseHTML } from "linkedom";
import type { Root } from "react-dom/client";
import { StickToBottom } from "use-stick-to-bottom";
import { ProseComposer } from "../components/lesson/prose/prose-composer.tsx";
import { strandedDraft } from "../components/lesson/stranded-draft.ts";
import { emptyDockSelection } from "../src/core/index.ts";

const { window, document } = parseHTML("<html><body></body></html>");
Object.assign(document, { oninput: null });
Object.assign(globalThis, { window, document, Element: window.Element, HTMLElement: window.HTMLElement, Event: window.Event });

const roots: Root[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await act(async () => root.unmount());
	document.body.innerHTML = "";
});

test("words typed in a question another window answered are rescued", () => {
	// Round 2: tab 0's typed draft was wiped with no word when tab 1 answered.
	assert.equal(strandedDraft("q:1", null, { key: "q:1", text: "(1,1) and (1,-1)" }), "(1,1) and (1,-1)");
});

test("nothing is rescued when the dock stays, nothing was typed, or the words belong to another dock", () => {
	assert.equal(strandedDraft("q:1", "q:1", { key: "q:1", text: "x" }), null);
	assert.equal(strandedDraft("q:1", null, { key: "q:1", text: "  " }), null);
	assert.equal(strandedDraft("q:1", null, { key: "q:2", text: "x" }), null);
	assert.equal(strandedDraft("q:1", null, null), null);
});

test("the composer answering a question reports what he types as he types it", async () => {
	const seen: [string, string][] = [];
	const noop = () => {};
	const host = document.createElement("div") as unknown as HTMLElement;
	document.body.append(host);
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(host);
	roots.push(root);
	await act(async () => {
		root.render(
			<StickToBottom>
				<ProseComposer
					open={{ kind: "question", key: "k1", tool: "explain", toolCallId: "q1", input: { question: "Which directions stay on their line?", correctAnswer: "(1,1) and (1,-1)", type: "check" } }}
					answer={{ openKey: "k1", selection: emptyDockSelection(), confidence: "neutral", mode: "answer", toggle: noop, setConfidence: noop, setMode: noop }}
					message={{ busy: false, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
					messageText={{ read: () => "", write: noop }}
					onAskInstead={noop}
					toggleRef={{ current: null }}
					busy={false}
					compacting={false}
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
