import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { AbortTurnBody } from "../components/abort-turn-dialog.tsx";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

async function open(onConfirm: () => void) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(<AbortTurnBody open mode="turn" onClose={() => {}} onConfirm={onConfirm} />); });
	document.querySelector<HTMLElement>('[data-testid="abort-turn-cancel"]')!.focus();
}

async function key(init: Record<string, unknown>) {
	await act(async () => {
		const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(event, { metaKey: false, ctrlKey: false, ...init });
		(document.activeElement ?? document.body).dispatchEvent(event);
	});
}

const focused = () => document.activeElement?.getAttribute("data-testid");

test("the right arrow reaches Abort and the left arrow returns to Cancel", async () => {
	await open(() => {});
	assert.equal(focused(), "abort-turn-cancel");
	await key({ key: "ArrowRight" });
	assert.equal(focused(), "abort-turn-confirm", "round 2: → did nothing and Abort was mouse-only");
	await key({ key: "ArrowLeft" });
	assert.equal(focused(), "abort-turn-cancel");
});

test("⌘↵ confirms from anywhere in the box", async () => {
	let confirmed = 0;
	await open(() => confirmed++);
	await key({ key: "Enter", metaKey: true });
	assert.equal(confirmed, 1);
});
