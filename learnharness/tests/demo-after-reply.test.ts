/**
 * A demo lands under the reply it arrived with (round 12, 3 D1): the
 * Poisson demo, dispatched with the lesson's plan, finished while his
 * prediction was open; the run his answer began drained it first, so it
 * was drawn between his answer and the reply, which sat below the fold
 * behind "New reply". The record keeps the order the tutor read it in.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inReadingOrder, projectView } from "../src/core/view.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (id: string, content: unknown[], stopReason: "stop" | "toolUse") => ({ id, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: 1 }) as unknown as LhMessage;
const answer = (id: string, callId: string) =>
	({ id, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text: "p = λ/n" }], details: { kind: "explain", questionText: "What should p be?", answers: ["λ/n"], answeredAt: "2026-11-16T03:10:00Z" }, isError: false, timestamp: 1 }) as unknown as LhMessage;
const demo = (id: string) => ({ id, role: "custom", customType: "subagent-steer", content: "The demo is ready.", display: true, details: { jobId: `job_${id}`, kind: "demo", result: { title: "Slots", html: "<p>x</p>", tested: true } }, timestamp: 1 }) as unknown as LhMessage;
const question = (id: string) => assistant(`a_${id}`, [{ type: "toolCall", id, name: "explain", arguments: { type: "predict", question: "What should p be?" } }], "toolUse");
const reply = (id: string) => assistant(id, [{ type: "text", text: "Right: p = λ/n keeps the average at λ." }], "stop");

describe("a demo lands under the reply it arrived with (3 D1)", () => {
	it("draws a result drained at the start of his answer's run after that run's reply, never above it", () => {
		const record = [question("q1"), answer("r1", "q1"), demo("d1"), reply("a2")];
		assert.deepEqual(inReadingOrder(record).map((m) => m.id), ["a_q1", "r1", "a2", "d1"]);
		const view = projectView(record);
		assert.equal(view.at(-1)!.id, "d1", "the demo is drawn last");
		assert.ok(view.at(-2)!.parts.some((p) => p.type === "text" && /keeps the average/.test((p as { text?: string }).text ?? "")), "the reply is drawn above it");
	});

	it("draws one steered in between a run's messages after its last, even when that run ends on a question", () => {
		const record = [question("q1"), answer("r1", "q1"), assistant("a2", [{ type: "text", text: "Right." }], "toolUse"), demo("d1"), question("q2"), answer("r2", "q2"), reply("a3")];
		assert.deepEqual(inReadingOrder(record).map((m) => m.id), ["a_q1", "r1", "a2", "a_q2", "d1", "r2", "a3"]);
	});

	it("keeps a result that opened a wake run of its own above the words that introduce it", () => {
		const record = [question("q1"), answer("r1", "q1"), reply("a2"), demo("d1"), reply("a3")];
		assert.deepEqual(inReadingOrder(record).map((m) => m.id), ["a_q1", "r1", "a2", "d1", "a3"]);
	});
});
