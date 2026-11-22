/**
 * The background pool's order (bg-llm-semaphore.ts): a course map build
 * waits ahead of queued arc readers, so a course set up while another
 * course's arc pass runs is usable without waiting for that pass; map
 * builds among themselves keep their order.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BG_LLM_PERMITS, withBgLlmSlot } from "../src/agent/subagents/bg-llm-semaphore.ts";

describe("the background pool", () => {
	it("starts tickets taken first ahead of every queued one, in their own order", async () => {
		const started: string[] = [];
		const release = new Map<string, () => void>();
		const job = (name: string) => () => new Promise<void>((resolve) => (started.push(name), release.set(name, resolve)));
		const settled = () => new Promise((r) => setImmediate(r));
		const busy = Array.from({ length: BG_LLM_PERMITS }, (_, i) => withBgLlmSlot(undefined, job(`busy-${i}`)));
		const rest = [withBgLlmSlot(undefined, job("reader-1")), withBgLlmSlot(undefined, job("map-1"), "first"), withBgLlmSlot(undefined, job("reader-2")), withBgLlmSlot(undefined, job("map-2"), "first")];
		await settled();
		for (let i = 0; i < BG_LLM_PERMITS; i++) {
			release.get(`busy-${i}`)!();
			await settled();
		}
		assert.deepEqual(started.slice(BG_LLM_PERMITS), ["map-1", "map-2", "reader-1"], "the map builds take the freed permits first, in their order");
		for (const name of ["map-1", "map-2", "reader-1"]) release.get(name)!();
		await settled();
		release.get("reader-2")!();
		await Promise.all([...busy, ...rest]);
		assert.equal(started.at(-1), "reader-2");
	});
});
