import React, { act, useRef, useState } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parseHTML } from "linkedom";
import type { Root } from "react-dom/client";
import { ChatSessionComposer } from "../components/composer.tsx";
import { ReadingThinkingField } from "../components/reading-thinking.tsx";

const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
// React wires onChange to the input event only where `oninput` is supported.
Object.assign(document, { oninput: null });
Object.assign(globalThis, {
	window,
	document,
	Element: window.Element,
	HTMLElement: window.HTMLElement,
	Event: window.Event,
});

const roots: { root: Root; host: HTMLElement }[] = [];

async function mount(element: React.ReactElement) {
	const host = document.createElement("div") as unknown as HTMLElement;
	document.body.append(host);
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(host);
	roots.push({ root, host });
	await act(async () => { root.render(element); });
	return host;
}

function fieldIn(host: HTMLElement): HTMLTextAreaElement {
	const field = host.querySelector<HTMLTextAreaElement>("textarea");
	assert.ok(field);
	return field;
}

// The prototype setter writes the value the way the browser does for typed
// or pasted text, so React sees one real input event.
function inputEvent(field: HTMLTextAreaElement, value: string) {
	Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
	field.dispatchEvent(new window.Event("input", { bubbles: true }));
}

async function typeText(field: HTMLTextAreaElement, value: string) {
	await act(async () => { inputEvent(field, value); });
}

async function submit(host: HTMLElement) {
	await act(async () => {
		host.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
	});
}

afterEach(async () => {
	for (const { root, host } of roots.splice(0)) {
		await act(async () => { root.unmount(); });
		host.remove();
	}
});

describe("session text fields keep keystrokes local", () => {
	it("updates composer and send affordance without rerendering the chat owner per change", async () => {
		let parentRenders = 0;
		let latest = "";
		let reset!: (value: string) => void;
		function Parent() {
			parentRenders++;
			const [external, setExternal] = useState({ value: "", revision: 0 });
			reset = (value) => setExternal((previous) => ({ value, revision: previous.revision + 1 }));
			return (
				<ChatSessionComposer
					busy={false}
					value={external.value}
					revision={external.revision}
					onChange={(value) => { latest = value; }}
					onSend={() => {}}
					onStop={() => {}}
					sendAllowed
				/>
			);
		}

		const host = await mount(<Parent />);
		const field = fieldIn(host);
		assert.equal(host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')?.disabled, true);
		await typeText(field, "typed phrase");
		assert.equal(field.value, "typed phrase");
		assert.equal(latest, "typed phrase");
		assert.equal(parentRenders, 1, "typing only renders the local composer subtree");
		assert.equal(host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')?.disabled, false);
		await typeText(field, "   ");
		assert.equal(host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')?.disabled, true, "whitespace alone cannot send");

		await act(async () => { reset("restored draft"); });
		assert.equal(field.value, "restored draft", "explicit external resets still reach the field");
		assert.equal(parentRenders, 2);
	});

	it("updates reading thoughts locally while forwarding drafts for submit", async () => {
		let parentRenders = 0;
		let latest = "";
		let reset!: (value: string) => void;
		function Parent() {
			parentRenders++;
			const [external, setExternal] = useState({ value: "", revision: 0 });
			reset = (value) => setExternal((previous) => ({ value, revision: previous.revision + 1 }));
			return (
				<ReadingThinkingField
					value={external.value}
					revision={external.revision}
					onChange={(value) => { latest = value; }}
				/>
			);
		}

		const host = await mount(<Parent />);
		const field = fieldIn(host);
		await typeText(field, "thinking while reading");
		assert.equal(field.value, "thinking while reading");
		assert.equal(latest, "thinking while reading");
		assert.equal(parentRenders, 1, "typing doesn't rerender the chat owner");

		await act(async () => { reset("restored thought"); });
		assert.equal(field.value, "restored thought", "explicit per-question resets still reach the field");
		assert.equal(parentRenders, 2);
	});

	it("a dictated multi-paragraph paste lands whole in one input event and is what gets sent", async () => {
		const paragraph = [
			"The derivative is zero at the vertex, so the tangent there is horizontal.",
			"",
			"That is why the minimum sits where the slope changes sign, not where the function is zero.",
			"",
			"I'm not sure the second derivative test applies when it is also zero there.",
		].join("\n");
		let parentRenders = 0;
		const sent: string[] = [];
		function Parent() {
			parentRenders++;
			const draft = useRef("");
			const [revision, setRevision] = useState(0);
			return (
				<ChatSessionComposer
					busy={false} value={draft.current} revision={revision}
					onChange={(value) => { draft.current = value; }}
					onSend={() => {
						sent.push(draft.current.trim());
						draft.current = "";
						setRevision((previous) => previous + 1);
					}}
					onStop={() => {}} sendAllowed
				/>
			);
		}
		const host = await mount(<Parent />);
		const field = fieldIn(host);
		await typeText(field, paragraph);
		assert.equal(field.value, paragraph);
		assert.equal(parentRenders, 1, "the paste does not rerender the chat owner");
		await submit(host);
		assert.deepEqual(sent, [paragraph], "the whole paste is sent, paragraph breaks included");
		assert.equal(field.value, "", "a send clears the field");
	});
});
