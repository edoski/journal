import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { Dialog } from "../components/ui/dialog.tsx";
import { AlertDialog } from "../components/ui/alert-dialog.tsx";
import { NewCourseBody } from "../components/course-picker.tsx";
import { AbortTurnBody } from "../components/abort-turn-dialog.tsx";
import { DeleteNodeBody } from "../components/delete-node-dialog.tsx";
import { DeleteSessionBody } from "../components/delete-session-dialog.tsx";

// The Proposed dialogs on Radix Dialog and AlertDialog: what each says and
// offers, and that Esc closes the dialog without reaching the turn.
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

async function mount(node: React.ReactElement) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(node); });
}

const $ = (selector: string) => document.querySelector<HTMLElement>(selector);

async function escapeReachesWindow(): Promise<boolean> {
	let reached = false;
	const onWindow = (e: Event) => { if ((e as KeyboardEvent).key === "Escape") reached = true; };
	window.addEventListener("keydown", onWindow);
	await act(async () => {
		const key = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(key, { key: "Escape" });
		(document.activeElement ?? document.body).dispatchEvent(key);
	});
	window.removeEventListener("keydown", onWindow);
	return reached;
}

describe("Proposed dialogs keep their actions", () => {
	it("New course: a dialog with a title field, a study root select, Cancel, and Create disabled until there is a title", async () => {
		const closes: boolean[] = [];
		await mount(
			<Dialog open onOpenChange={(open) => closes.push(open)}>
				<NewCourseBody variant="proposed" roots={["/study/courses"]} onClose={() => {}} onCreated={() => {}} />
			</Dialog>,
		);
		const dialog = $('[data-testid="new-course-dialog"]');
		assert.equal(dialog?.getAttribute("role"), "dialog");
		assert.equal(dialog?.querySelector('[data-slot="dialog-title"]')?.textContent, "New course");
		assert.ok($('[data-testid="new-course-title"]'));
		assert.equal($('[data-testid="new-course-root"]')?.getAttribute("role"), "combobox");
		assert.equal($('[data-testid="new-course-create"]')?.hasAttribute("disabled"), true);
		assert.ok([...document.querySelectorAll("button")].some((b) => b.textContent === "Cancel"));
		assert.equal(await escapeReachesWindow(), false, "Esc closes the dialog and stops there");
		assert.deepEqual(closes, [false]);
	});

	it("abort: an alert dialog with the question's own words and action, Cancel first", async () => {
		await mount(
			<AlertDialog open>
				<AbortTurnBody variant="proposed" mode="problem" busy onClose={() => {}} onConfirm={() => {}} />
			</AlertDialog>,
		);
		assert.equal($('[data-testid="abort-turn-dialog"]')?.getAttribute("role"), "alertdialog");
		assert.equal($('[data-testid="abort-turn-title"]')?.textContent, "Discard this problem?");
		assert.match($('[data-testid="abort-turn-line"]')?.textContent ?? "", /The working turn stops too\./);
		const footer = [...document.querySelectorAll('[data-slot="alert-dialog-footer"] button')].map((b) => b.textContent);
		assert.deepEqual(footer, ["Cancel", "Discard"]);
	});

	it("delete notes: counts in the title, names listed, the delete button named for what it does", async () => {
		const nodes = ["A", "B", "C"].map((name) => ({ id: name.toLowerCase(), name }));
		await mount(
			<AlertDialog open>
				<DeleteNodeBody variant="proposed" nodes={nodes} busy={false} failure={null} onClose={() => {}} onRun={() => {}} />
			</AlertDialog>,
		);
		assert.equal($('[data-slot="alert-dialog-title"]')?.textContent, "Delete 3 nodes?");
		assert.equal($('[data-testid="node-names-code"]')?.textContent, "A, B, C");
		assert.equal($('[data-testid="node-delete-confirm"]')?.textContent, "Delete");
	});

	it("delete session: the session named in the system font, the traces checkbox and its retry on failure", async () => {
		const traces: boolean[] = [];
		await mount(
			<AlertDialog open>
				<DeleteSessionBody
					variant="proposed"
					chat={{ id: "c1", title: "Rank practice" }}
					traces={false}
					busy={false}
					failure={{ code: "network", error: "Delete failed — network error. Try again." }}
					onTraces={(next) => traces.push(next)}
					onClose={() => {}}
					onRun={() => {}}
				/>
			</AlertDialog>,
		);
		const name = $('[data-testid="session-name-code"]');
		assert.equal(name?.tagName, "P", "not a code element");
		assert.equal(name?.textContent, "Rank practice");
		const checkbox = $('[data-testid="delete-traces-checkbox"]');
		assert.equal(checkbox?.getAttribute("role"), "checkbox");
		await act(async () => { checkbox!.dispatchEvent(new dom.window.Event("click", { bubbles: true, cancelable: true })); });
		assert.deepEqual(traces, [true]);
		assert.match($('[data-testid="delete-failure"]')?.textContent ?? "", /Try again/);
	});
});
