/**
 * Every app dialog fades out as it closes: its caller keeps it rendered and
 * closes it through Radix's `open`, so Radix's Presence holds the content,
 * still showing what it was about, until the exit animation ends.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { DeleteSessionDialog } from "../components/delete-session-dialog.tsx";
import { AbortTurnDialog, ShowMeConfirm } from "../components/abort-turn-dialog.tsx";
import { DisputeDialog } from "../components/answer-mark.tsx";
import { DeleteCourseDialog, RenameCourseDialog } from "../components/course-manage-dialogs.tsx";
import { SetupDialog } from "../components/setup-dialog.tsx";
import { SettingsDialogProvider, useSettingsDialog } from "../components/settings/settings-dialog.tsx";
import type { AnswerMark } from "../src/core/index.ts";

// linkedom computes no styles, so Presence would see no animation and drop
// the content at once. This reports the app's enter and exit animations by
// data-state, as tw-animate-css draws them in the browser.
const computedStyle = (node: Element) => ({
	getPropertyValue: () => "",
	display: "block",
	get animationName() { return node.getAttribute?.("data-state") === "closed" ? "exit" : "enter"; },
});
Object.assign(globalThis, { getComputedStyle: computedStyle, CSS: { escape: (value: string) => value } });
Object.assign(dom.window, { getComputedStyle: computedStyle });

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
	const path = new URL(String(input), "http://localhost").pathname;
	if (path === "/api/models") return Response.json({ account: "claude-subscription", connected: false, contextWindow: 200000 });
	if (path === "/api/subscriptions/claude") return Response.json({ accounts: [] });
	if (path === "/api/settings") return Response.json({ settings: null });
	return Response.json({});
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

process.on("exit", () => { globalThis.fetch = originalFetch; });

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function escape() {
	await act(async () => {
		const key = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(key, { key: "Escape" });
		(document.activeElement ?? document.body).dispatchEvent(key);
	});
}

async function endExit(node: Element) {
	await act(async () => {
		for (const layer of [node, ...document.querySelectorAll('[data-state="closed"]')]) {
			const end = new dom.window.Event("animationend", { bubbles: true });
			Object.assign(end, { animationName: "exit" });
			layer.dispatchEvent(end);
		}
	});
}

const MARK: AnswerMark = {
	rows: [{ id: "o1", topics: ["rank"], label: null, result: "partial", grade: "helped", helped: false, predicted: false, gaveUp: false, uncertain: false, sure: null }],
	disputed: false,
	changed: false,
};
const COURSE = { workspace: "/study/smm", title: "SMM" };

/** Each dialog as its caller renders it: always, with what it is about
 *  while open and null (or `open` false) once closed. */
const DIALOGS: { name: string; testid: string; shows: string; render: (open: boolean, close: () => void) => React.ReactElement }[] = [
	{ name: "delete lesson", testid: "delete-session-dialog", shows: "Eigenvalues", render: (open, close) => <DeleteSessionDialog chat={open ? { id: "c1", title: "Eigenvalues" } : null} onClose={close} onDeleted={() => {}} /> },
	{ name: "stop the reply", testid: "abort-turn-dialog", shows: "Stop the tutor's reply?", render: (open, close) => <AbortTurnDialog mode={open ? "turn" : null} onClose={close} onConfirm={() => {}} /> },
	{ name: "show me", testid: "show-me-dialog", shows: "Show the answer?", render: (open, close) => <ShowMeConfirm what={open ? "question" : null} onClose={close} onConfirm={() => {}} /> },
	{ name: "dispute", testid: "dispute-dialog", shows: "Dispute this mark", render: (open, close) => <DisputeDialog rows={open ? MARK.rows : null} onClose={close} onSend={() => {}} /> },
	{ name: "rename course", testid: "rename-course-dialog", shows: "Rename course", render: (open, close) => <RenameCourseDialog course={open ? COURSE : null} onClose={close} onRenamed={() => {}} /> },
	{ name: "delete course", testid: "delete-course-dialog", shows: "Delete SMM?", render: (open, close) => <DeleteCourseDialog course={open ? COURSE : null} onClose={close} onDeleted={() => {}} /> },
	{ name: "sign in", testid: "setup-dialog", shows: "Sign in to Claude", render: (open, close) => <SetupDialog open={open} onClose={close} /> },
];

async function mount(node: React.ReactElement) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(node); });
	await settle();
}

async function assertFadesOut(testid: string, shows: string) {
	const content = document.querySelector(`[data-testid="${testid}"]`);
	assert.ok(content, "the dialog opens");
	assert.equal(content.getAttribute("data-state"), "open");
	await escape();
	await settle();
	const closing = document.querySelector(`[data-testid="${testid}"]`);
	assert.ok(closing === content, "the content stays on screen while it animates out");
	assert.equal(closing.getAttribute("data-state"), "closed");
	assert.ok(closing.textContent!.includes(shows), `it still shows ${shows} as it fades`);
	await endExit(closing);
	assert.ok(document.querySelector(`[data-testid="${testid}"]`) === null, "the content leaves once its exit animation ends");
}

describe("dialogs fade out as they close", () => {
	for (const dialog of DIALOGS) {
		it(dialog.name, async () => {
			function Caller() {
				const [open, setOpen] = React.useState(true);
				return dialog.render(open, () => setOpen(false));
			}
			await mount(<Caller />);
			await assertFadesOut(dialog.testid, dialog.shows);
		});
	}

	it("settings, opened through its provider", async () => {
		function Opener() {
			const { open } = useSettingsDialog();
			React.useEffect(() => open(), [open]);
			return null;
		}
		await mount(<SettingsDialogProvider><Opener /></SettingsDialogProvider>);
		await assertFadesOut("settings-dialog", "Settings");
	});

	it("opens fresh after it closed: a new opening drops the last one's draft", async () => {
		let setOpen: (open: boolean) => void = () => {};
		function Caller() {
			const [open, set] = React.useState(true);
			setOpen = set;
			return <RenameCourseDialog course={open ? COURSE : null} onClose={() => set(false)} onRenamed={() => {}} />;
		}
		await mount(<Caller />);
		const field = () => document.querySelector<HTMLInputElement>('[data-testid="rename-course-title"]')!;
		await act(async () => {
			const input = field();
			Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, "Draft");
			input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
		assert.equal(field().value, "Draft");
		await escape();
		await endExit(document.querySelector('[data-testid="rename-course-dialog"]')!);
		await act(async () => setOpen(true));
		await settle();
		assert.equal(field().value, "SMM", "the title starts again from the course's own");
	});
});
