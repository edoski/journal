/**
 * The background pool's order (bg-llm-semaphore.ts): a course map build
 * waits ahead of queued arc readers, so a course set up while another
 * course's arc pass runs is usable without waiting for that pass.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BG_LLM_PERMITS, withBgLlmSlot } from "../src/agent/subagents/bg-llm-semaphore.ts";

describe("the background pool", () => {
	it("starts a ticket taken first ahead of every queued one", async () => {
		const started: string[] = [];
		const gates: Array<() => void> = [];
		const hold = (name: string) => () =>
			new Promise<void>((resolve) => {
				started.push(name);
				gates.push(resolve);
			});
		const running = Array.from({ length: BG_LLM_PERMITS }, (_, i) => withBgLlmSlot(undefined, hold(`busy-${i}`)));
		const queued = [withBgLlmSlot(undefined, hold("reader-1")), withBgLlmSlot(undefined, hold("reader-2"))];
		const map = withBgLlmSlot(undefined, hold("map"), "first");
		await Promise.resolve();
		assert.deepEqual(started, Array.from({ length: BG_LLM_PERMITS }, (_, i) => `busy-${i}`));
		gates.shift()!();
		await running[0];
		await new Promise((r) => setImmediate(r));
		assert.equal(started.at(-1), "map", "the map build takes the freed permit before the queued readers");
		while (gates.length > 0) gates.shift()!();
		for (let i = 0; i < 4 && gates.length === 0; i++) await new Promise((r) => setImmediate(r));
		while (gates.length > 0) gates.shift()!();
		await new Promise((r) => setImmediate(r));
		while (gates.length > 0) gates.shift()!();
		await Promise.all([...running, ...queued, map]);
		assert.deepEqual(started.slice(BG_LLM_PERMITS + 1).sort(), ["reader-1", "reader-2"]);
	});
});
