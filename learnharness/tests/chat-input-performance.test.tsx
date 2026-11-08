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
// As in browsers, a textarea's default value is its text content; React
// mounts a seeded textarea through it.
Object.defineProperty(window.HTMLTextAreaElement.prototype, "defaultValue", {
	get(this: HTMLTextAreaElement) { return this.textContent; },
	set(this: HTMLTextAreaElement, value: string) { this.textContent = value; },
});
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

	it("composer retains local edits across owner renders and reads the latest text for send", async () => {
		let parentRenders = 0;
		let refresh!: () => void;
		let replace!: (value: string) => void;
		let remount!: (visible: boolean) => void;
		const sent: string[] = [];
		function Parent() {
			parentRenders++;
			const draft = useRef("");
			const [revision, setRevision] = useState(0);
			const [, setTick] = useState(0);
			const [visible, setVisible] = useState(true);
			refresh = () => setTick((tick) => tick + 1);
			remount = setVisible;
			replace = (value) => {
				draft.current = value;
				setRevision((previous) => previous + 1);
			};
			return visible ? <ChatSessionComposer
				busy={false} value={draft.current} revision={revision}
				onChange={(value) => { draft.current = value; }}
				onSend={() => { sent.push(draft.current); replace(""); }}
				onStop={() => {}} sendAllowed
			/> : null;
		}
		const host = await mount(<Parent />);
		let field = fieldIn(host);
		await typeText(field, "typed");
		assert.equal(parentRenders, 1);
		await act(async () => { refresh(); });
		assert.equal(field.value, "typed", "an unrelated owner render must not restore an old seed");
		await typeText(field, "typed and more");
		await submit(host);
		assert.deepEqual(sent, ["typed and more"]);
		assert.equal(field.value, "");
		assert.equal(host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!.disabled, true);

		// The seed is already empty; a new explicit reset must still clear local edits.
		await typeText(field, "unsent");
		await act(async () => { replace(""); });
		assert.equal(field.value, "");
		await act(async () => { replace("refused send restored"); });
		await typeText(field, "new edit");
		await act(async () => { replace("refused send restored"); });
		assert.equal(field.value, "refused send restored");
		await act(async () => { remount(false); });
		await act(async () => { remount(true); });
		field = fieldIn(host);
		assert.equal(field.value, "refused send restored", "a remounted composer takes the current owner ref");
	});

	it("composer keeps busy steering/stop, compaction gating, and Next affordances", async () => {
		let update!: (patch: Partial<typeof flags>) => void;
		let flags = { busy: false, sendAllowed: true, nextProblem: true };
		let sends = 0;
		let stops = 0;
		let nexts = 0;
		function Parent() {
			const [state, setState] = useState(flags);
			update = (patch) => { flags = { ...flags, ...patch }; setState(flags); };
			return <ChatSessionComposer {...state} value="" revision={0} onChange={() => {}}
				onSend={() => { sends++; }} onStop={() => { stops++; }} onNext={() => { nexts++; }} />;
		}
		const host = await mount(<Parent />);
		assert.ok(host.querySelector('[aria-label="Next problem"]'));
		await submit(host);
		assert.equal(nexts, 1);
		await act(async () => { update({ busy: true, nextProblem: false }); });
		assert.ok(host.querySelector('[aria-label="Stop"]'));
		await submit(host);
		assert.equal(stops, 1);
		await typeText(fieldIn(host), "steer now");
		assert.ok(host.querySelector('[aria-label="Send"]'));
		await submit(host);
		assert.equal(sends, 1);
		await act(async () => { update({ busy: false, sendAllowed: false }); });
		assert.equal(host.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.disabled, true);
		await submit(host);
		assert.equal(sends, 1, "a closed send gate must win over local text");
	});

	it("reading thoughts survive unrelated renders and explicit same-value restoration", async () => {
		let refresh!: () => void;
		let replace!: (value: string) => void;
		let latest = "";
		function Parent() {
			const [seed, setSeed] = useState({ value: "", revision: 0 });
			const [, setTick] = useState(0);
			refresh = () => setTick((tick) => tick + 1);
			replace = (value) => { latest = value; setSeed((previous) => ({ value, revision: previous.revision + 1 })); };
			return <ReadingThinkingField {...seed} onChange={(value) => { latest = value; }} />;
		}
		const host = await mount(<Parent />);
		const field = fieldIn(host);
		await typeText(field, "reading draft");
		await act(async () => { refresh(); });
		assert.equal(field.value, "reading draft");
		assert.equal(latest, "reading draft");
		await act(async () => { replace(""); });
		assert.equal(field.value, "");
		await act(async () => { replace("saved question thoughts"); });
		await typeText(field, "edited after restoration");
		await act(async () => { replace("saved question thoughts"); });
		assert.equal(field.value, "saved question thoughts");
		assert.equal(latest, "saved question thoughts");
	});

	it("reading appends reach the owner synchronously, before React commits", async () => {
		let latest = "";
		let forwardedEdits = 0;
		const host = await mount(<ReadingThinkingField value="" revision={0}
			onChange={(value) => { latest = value; forwardedEdits++; }} />);
		const field = fieldIn(host);
		await typeText(field, "typed thoughts");
		await act(async () => {
			inputEvent(field, "typed thoughts appended tail");
			assert.equal(latest, "typed thoughts appended tail", "a submit right after the append sees the tail");
			inputEvent(field, "typed thoughts appended tail and a second burst");
			assert.equal(latest, "typed thoughts appended tail and a second burst");
		});
		assert.equal(field.value, "typed thoughts appended tail and a second burst");
		assert.equal(forwardedEdits, 3, "each edit forwards its synchronous snapshot exactly once");
	});
});
