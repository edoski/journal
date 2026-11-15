/**
 * Round 8 (4 #10): the lesson resumes as soon as the app is back after a
 * restart. EventSource gives up for good on an answer that is not its
 * stream (a restarting app's error, a proxy's 502), so the window's channel
 * stayed shut and the auto-resume waited about 29 s. The channel now opens
 * again after the server's retry wait, once per failure, and every open
 * fires the resyncs that heal the dropped turn.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openEventsChannel, type EventStream } from "../components/server-events.tsx";
import { eventsResponse } from "../src/server/events-stream.ts";
import { EVENTS_RETRY_MS } from "../src/core/events.ts";

class FakeStream implements EventStream {
	readyState = 0;
	onopen: ((ev: Event) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;
	listeners: string[] = [];
	addEventListener(name: string) { this.listeners.push(name); }
	close() { this.readyState = 2; }
}

test("a channel EventSource gave up on opens again after the retry wait, and its open fires the resyncs", () => {
	const made: FakeStream[] = [];
	const waits: [() => void, number][] = [];
	const channel = openEventsChannel(() => { const s = new FakeStream(); made.push(s); return s; }, (run, ms) => waits.push([run, ms]));
	let resyncs = 0;
	channel.onOpen(() => resyncs++);
	channel.onEvent("turn-started", () => {});
	made[0]!.readyState = 0;
	made[0]!.onerror?.(new Event("error"));
	assert.equal(waits.length, 0, "a dropped connection EventSource retries itself");
	made[0]!.readyState = 2;
	made[0]!.onerror?.(new Event("error"));
	assert.deepEqual(waits.map(([, ms]) => ms), [EVENTS_RETRY_MS]);
	waits[0]![0]();
	assert.equal(made.length, 2, "a new channel");
	assert.deepEqual(made[1]!.listeners, ["turn-started"], "with every listener");
	made[1]!.onopen?.(new Event("open"));
	assert.equal(resyncs, 1);
	channel.close();
	made[1]!.onerror?.(new Event("error"));
	assert.equal(waits.length, 1, "a closed channel stays closed");
});

test("the server asks for the same retry wait", async () => {
	const res = eventsResponse();
	const reader = res.body!.getReader();
	const { value } = await reader.read();
	await reader.cancel();
	assert.match(new TextDecoder().decode(value), new RegExp(`retry: ${EVENTS_RETRY_MS}`));
});
