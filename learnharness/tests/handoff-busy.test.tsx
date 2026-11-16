/**
 * Round 14, 3 M2 (with 3's free placeholder flicker): a handoff between
 * agents showed nothing in the lesson. After the probe's last answer, 29 s
 * passed with no status, no Stop and a box reading "Ask the tutor
 * anything…", while the sidebar said "Tutor writing"; on Invertible, Stop
 * vanished for 2 s. The teacher's turn begins as the probe's closes, so
 * its turn-started reached the lesson while the lesson's own stream was
 * still ending and was ignored, and the setup before a wake turn counted
 * as idle. The lesson now reads the session's busy fact the sidebar reads
 * (useSessionBusy), and attaches when its own stream ends with that fact
 * still up.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { lessonBusy, useSessionBusy } from "../components/lesson/session-busy.ts";
import type { SessionStatus } from "../components/session-core.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; });

function fakeSource() {
	const events = new Map<string, Set<(data: string) => void>>();
	const src: NotifySource & { push(name: string, payload: unknown): void } = {
		close() {},
		onOpen() {},
		onEvent(name, cb) { (events.get(name) ?? events.set(name, new Set()).get(name)!).add(cb); },
		push(name, payload) { for (const cb of events.get(name) ?? []) cb(JSON.stringify(payload)); },
	};
	return src;
}

const CHAT = "chat_handoff";

async function mount() {
	const source = fakeSource();
	const seen: { busy: boolean; attaches: number } = { busy: false, attaches: 0 };
	let setStatus: (s: SessionStatus) => void = () => {};
	function Lesson() {
		const [status, set] = React.useState<SessionStatus>("ready");
		setStatus = set;
		const { busy } = useSessionBusy({ chatId: CHAT, status, attached: false, initiallyInFlight: false, attachIfRunning: () => { seen.attaches++; } });
		seen.busy = busy;
		return null;
	}
	const host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	const connect = () => source;
	await act(async () => root!.render(<ServerEventsProvider connect={connect}><Lesson /></ServerEventsProvider>));
	const step = async (fn: () => void) => act(async () => { fn(); });
	return {
		seen,
		status: (s: SessionStatus) => step(() => setStatus(s)),
		push: (name: string, payload: unknown) => step(() => source.push(name, payload)),
	};
}

test("the probe's last answer to the teacher's first word: busy at every step, and the lesson attaches to the teacher's turn", async () => {
	const lesson = await mount();
	const trace: [string, boolean][] = [];
	const note = (what: string) => trace.push([what, lesson.seen.busy]);
	await lesson.status("submitted"); note("his answer sent");
	await lesson.push("turn-started", { chatId: CHAT }); note("the probe's turn starts");
	await lesson.status("streaming"); note("its marks stream");
	await lesson.push("turn-settled", { chatId: CHAT }); note("the probe's turn settles");
	await lesson.push("turn-waking", { chatId: CHAT, waking: true }); note("the teacher's turn is set up");
	await lesson.push("turn-started", { chatId: CHAT }); note("the teacher's turn starts");
	await lesson.push("turn-waking", { chatId: CHAT, waking: false }); note("its setup ends");
	await lesson.status("ready"); note("the probe's stream ends");
	assert.deepEqual(trace.filter(([, busy]) => !busy), [], "nothing between the two turns looks finished");
	assert.equal(lesson.seen.attaches, 1, "the end of the probe's stream attaches to the teacher's turn, which it could not attach to while it ran");
	await lesson.push("turn-settled", { chatId: CHAT });
	assert.equal(lesson.seen.busy, false, "the teacher's settle ends it");
});

test("a wake's setup after the lesson's stream ended keeps it busy (Stop never vanishes, the box never flickers to the next problem's words)", async () => {
	const lesson = await mount();
	await lesson.status("submitted");
	await lesson.push("turn-started", { chatId: CHAT });
	await lesson.push("turn-settled", { chatId: CHAT });
	await lesson.status("ready");
	assert.equal(lesson.seen.busy, false, "his own turn, settled: idle");
	assert.equal(lesson.seen.attaches, 0, "nothing else runs, so nothing to attach to");
	await lesson.push("turn-waking", { chatId: CHAT, waking: true });
	assert.equal(lesson.seen.busy, true, "the practice agent's setup is busy");
	await lesson.push("turn-started", { chatId: CHAT });
	await lesson.push("turn-waking", { chatId: CHAT, waking: false });
	assert.equal(lesson.seen.busy, true, "and so is its turn, attached or not");
});

test("another chat's turns never make this lesson busy", async () => {
	const lesson = await mount();
	await lesson.push("turn-waking", { chatId: "chat_other", waking: true });
	await lesson.push("turn-started", { chatId: "chat_other" });
	assert.equal(lesson.seen.busy, false);
});

test("his stop ends the busy look at once, before the stopped turn settles (round 14, 4 minor 10)", () => {
	const running = { localStream: false, attached: false, serverTurn: true, waking: false };
	assert.equal(lessonBusy({ ...running, stopAsked: false }), true);
	assert.equal(lessonBusy({ ...running, stopAsked: true }), false);
	assert.equal(lessonBusy({ ...running, waking: true, serverTurn: false, stopAsked: true }), false, "a stop during a wake's setup too");
	assert.equal(lessonBusy({ ...running, localStream: true, stopAsked: true }), true, "his next send is busy whatever came before");
});
