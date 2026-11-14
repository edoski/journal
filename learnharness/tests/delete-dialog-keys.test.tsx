/**
 * The delete confirmations answer the keyboard as the stop confirm does
 * (round 3, 14 Nov 2026): they open on Cancel, ← → move between the
 * buttons, and ⌘↵ presses Delete. Before, focus stayed behind the modal.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { AlertDialog } from "../components/ui/alert-dialog.tsx";
import { DeleteSessionBody } from "../components/delete-session-dialog.tsx";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

async function open(onRun: () => void) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => {
		root!.render(
			<AlertDialog open>
				<DeleteSessionBody chat={{ id: "c1", title: "Rank practice" }} busy={false} failure={null} onClose={() => {}} onRun={onRun} />
			</AlertDialog>,
		);
	});
	await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

async function key(init: Record<string, unknown>) {
	await act(async () => {
		const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(event, { metaKey: false, ctrlKey: false, ...init });
		(document.activeElement ?? document.body).dispatchEvent(event);
	});
}

const focused = () => document.activeElement?.getAttribute("data-testid");

test("Delete lesson opens with Cancel focused, and the arrows walk the buttons", async () => {
	await open(() => {});
	assert.equal(focused(), "delete-cancel", "round 3: focus stayed on the sidebar row behind the modal");
	await key({ key: "ArrowRight" });
	assert.equal(focused(), "delete-confirm");
	await key({ key: "ArrowLeft" });
	assert.equal(focused(), "delete-cancel");
});

test("⌘↵ presses Delete from anywhere in the box", async () => {
	let ran = 0;
	await open(() => ran++);
	await key({ key: "Enter", metaKey: true });
	assert.equal(ran, 1);
});
