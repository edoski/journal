/**
 * The tutor never points at a demo before it is on his screen (round 13,
 * 3 N1): the Invertible reply called for the determinant demo and, in the
 * same turn, said "In the demo, slide d until the columns line up", and
 * its question relied on it; the demo is built after the turn moves on.
 * The reply's words are the lens's, word for word.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { LhMessage } from "../src/core/native-messages.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-demo-unbuilt-"));
const originalEnv = process.env;
process.env = { ...originalEnv, NODE_ENV: "test", LH_DATA_DIR: path.join(scratch, "data"), HOME: path.join(scratch, "home") };
after(() => {
	process.env = originalEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { VoiceGuard } = await import("../src/agent/voice-guard.ts");
const { SEND_TO_USER_TOOL, newUserMessage } = await import("../src/core/native-messages.ts");
const { DEMO_ACK } = await import("../src/agent/tools/jobs.ts");

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const ask = (question: string): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type: "check", nodeId: "collapse", correctAnswer: "(3,2)" } });
const demo = (): ToolCall => ({ type: "toolCall", id: `d-${++n}`, name: "demo", arguments: { title: "The unit square under a 2×2 map", brief: "Four sliders a, b, c, d for the columns (a, c) and (b, d); the unit square and its image." } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (callId: string, text: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-16T07:44:00Z" }, isError: false, timestamp: 1 }) as LhMessage;

const rules = (guard: InstanceType<typeof VoiceGuard>, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};

function answering(): LhMessage[] {
	const q = ask("A 2 × 3 matrix K has rank 2. Can K be undone, and why?");
	return [newUserMessage("Invertible matrices"), assistant([q]), answered(q.id, "no, rank-nullity gives dim ker K = 3 - 2 = 1 so two different inputs share every output, so it cannot be undone")];
}

const REPLY =
	"A zero determinant says the unit square's image has no area, which happens only when the two columns lie on one line through $0$. In the demo, slide $d$ until the columns line up and watch the transformed grid fold onto a single line.";

describe("no word of a demo before it is on his screen (3 N1)", () => {
	it("refuses a message that points at the demo this turn called for", () => {
		const guard = new VoiceGuard(answering());
		assert.deepEqual(rules(guard, demo()), []);
		assert.ok(rules(guard, send(REPLY)).includes("unbuilt"));
	});

	it("refuses a question that relies on it", () => {
		const guard = new VoiceGuard(answering());
		rules(guard, demo());
		assert.ok(rules(guard, ask("In the demo, which slider setting flattens the square, and why?")).includes("unbuilt"));
	});

	it("lets the same words through once the demo has arrived, in a later turn", () => {
		const guard = new VoiceGuard(answering());
		assert.ok(!rules(guard, send(REPLY)).includes("unbuilt"));
	});

	it("tells the tutor at the call that the demo is not on screen until its message", () => {
		assert.match(DEMO_ACK, /not on his screen/);
		assert.match(DEMO_ACK, /ask nothing that needs it/);
	});
});
