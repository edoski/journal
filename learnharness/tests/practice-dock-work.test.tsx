import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { parseHTML } from "linkedom";
import type { Root } from "react-dom/client";
import { PracticeDock } from "../components/practice-dock.tsx";
import type { PracticeRequest } from "../src/core";

const { window, document } = parseHTML("<html><body></body></html>");
Object.assign(document, { oninput: null });
Object.assign(globalThis, { window, document, Element: window.Element, HTMLElement: window.HTMLElement, Event: window.Event });

const roots: Root[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await act(async () => root.unmount());
	document.body.innerHTML = "";
});

async function dock(props: { busy?: boolean; onRequest?: (request: PracticeRequest, text: string) => void }) {
	const host = document.createElement("div") as unknown as HTMLElement;
	document.body.append(host);
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(host);
	roots.push(root);
	await act(async () => {
		root.render(
			<PracticeDock problemCallId="call_p1" input={{ statement: "Find rank A." }} expanded onExpand={() => {}} onSubmit={() => {}}
				onRequest={props.onRequest ?? (() => {})} busy={props.busy} />,
		);
	});
	return host;
}

const field = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>('[data-testid="practice-thinking-field"]')!;

async function type(host: HTMLElement, value: string) {
	await act(async () => {
		Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(field(host), value);
		field(host).dispatchEvent(new window.Event("input", { bubbles: true }));
	});
}

for (const kind of ["hint", "show", "explain"] as const) {
	test(`${kind} sends the work so far and keeps it in the field`, async () => {
		const sent: [PracticeRequest, string][] = [];
		const host = await dock({ onRequest: (request, text) => sent.push([request, text]) });
		await type(host, "R2 - 2R1 gives");
		await act(async () => host.querySelector<HTMLButtonElement>(`[data-testid="practice-request-${kind}"]`)!.click());
		assert.deepEqual(sent, [[kind, "R2 - 2R1 gives"]]);
		assert.equal(field(host).value, "R2 - 2R1 gives", "his work is still there");
	});
}

test("while the tutor answers, Submit and the requests wait", async () => {
	const host = await dock({ busy: true });
	await type(host, "rank 2");
	for (const id of ["practice-send", "practice-request-hint", "practice-request-show", "practice-request-explain"]) {
		assert.equal(host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.disabled, true, id);
	}
});
