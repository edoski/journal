/**
 * Round 15, m21 (4 minor 4; round-14 m10's remainder): after a stop,
 * "Thinking…" and Stop came back from 0.44 to 2.3 s before the stop line
 * settled, and an Enter pressed then was swallowed (`110`, `107`). His stop
 * ended the reply's own stream, and the end of that stream, with the
 * server's turn not yet aborted, attached to that same turn again. A stop
 * now holds until its turn settles: nothing attaches to the turn he stopped.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { useSessionBusy } from "../components/lesson/session-busy.ts";
import type { SessionStatus } from "../components/session-core.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; });

const CHAT = "chat_stop";

async function mount() {
	const events = new Map<string, Set<(data: string) => void>>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent(name, cb) { (events.get(name) ?? events.set(name, new Set()).get(name)!).add(cb); } };
	const seen = { busy: false, attaches: 0, askStop: () => {}, stopAsked: () => false };
	let setStatus: (s: SessionStatus) => void = () => {};
	function Lesson() {
		const [status, set] = React.useState<SessionStatus>("ready");
		setStatus = set;
		const busy = useSessionBusy({ chatId: CHAT, status, attached: false, initiallyInFlight: false, attachIfRunning: () => { seen.attaches++; } });
		seen.busy = busy.busy;
		seen.askStop = busy.askStop;
		seen.stopAsked = () => busy.stopAskedRef.current;
		return null;
	}
	const host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(<ServerEventsProvider connect={() => source}><Lesson /></ServerEventsProvider>));
	const step = async (fn: () => void) => act(async () => { fn(); });
	return {
		seen,
		status: (s: SessionStatus) => step(() => setStatus(s)),
		push: (name: string, payload: unknown) => step(() => { for (const cb of events.get(name) ?? []) cb(JSON.stringify(payload)); }),
		stop: () => step(() => seen.askStop()),
	};
}

test("his stop holds until the stopped turn settles: its stream's end attaches to nothing, and nothing looks busy (round 15, m21)", async () => {
	const lesson = await mount();
	await lesson.status("submitted");
	await lesson.push("turn-started", { chatId: CHAT });
	await lesson.status("streaming");
	assert.equal(lesson.seen.busy, true);
	// ⌘↵ on the stop confirm: the view lets go of the stream at once.
	await lesson.stop();
	await lesson.status("ready");
	assert.equal(lesson.seen.busy, false, "stopped at once");
	assert.equal(lesson.seen.attaches, 0, "the stream's end never attaches to the turn he stopped (`110`)");
	assert.equal(lesson.seen.stopAsked(), true, "the stop holds while the server aborts the turn");
	await lesson.push("turn-settled", { chatId: CHAT });
	assert.equal(lesson.seen.busy, false);
	assert.equal(lesson.seen.stopAsked(), false, "the settle confirms it");
	// His next send is busy as any send is.
	await lesson.status("submitted");
	assert.equal(lesson.seen.busy, true);
});
