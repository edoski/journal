/**
 * Round 15, m13 (3 m3), end to end: the probe-handoff wake that lands in
 * the record, and the teacher reads, quotes the feedback the probe gave
 * his last answer.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import { onFake } from "./helpers/fake-sdk.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-probe-feedback-"));
const PYTHON = path.join(TMP, "python");
fs.writeFileSync(PYTHON, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.LH_LEARNING_ENGINE = TMP;
// The test's own HOME: an engine run on the real one is refused (carry-in 3, round 19).
process.env.HOME = path.join(TMP, "home");
process.env.LH_LEARNING_PYTHON = PYTHON;

const { newUserMessage } = await import("../src/core/native-messages.ts");
const { buildProbeHandoffSteer } = await import("../src/core/contracts/jobs.ts");
const { handleChatInput } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { createPracticeAgent } = await import("../src/agent/teacher-agent.ts");
const { signInTestClaude } = await import("./claude-fixture.ts");
await signInTestClaude();

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const FEEDBACK = "The base and the exponent change together, so the limit cannot be taken one part at a time.";

it("the wake in the record quotes the probe's last feedback as already said", async () => {
	const chat = chatStore.createChat("Poisson distribution", { workspace: "/study/probability", title: "Probability" });
	const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	const assistant = (id: string, call: object) => ({ id, role: "assistant", content: [call], api: "faux", provider: "t", model: "t", usage, stopReason: "toolUse", timestamp: 1 });
	const result = (id: string, callId: string, toolName: string, details: unknown) => ({ id, role: "toolResult", toolCallId: callId, toolName, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: 2 });
	chatStore.saveMessages(chat.id, [
		newUserMessage("Poisson distribution"),
		assistant("a1", { type: "toolCall", id: "q1", name: "recall", arguments: { question: "What does $(1 - 3/n)^n$ approach?", correctAnswer: "$e^{-3}$" } }) as never,
		result("r1", "q1", "recall", { question: "q1", kind: "explain", text: "1", questionText: "What does $(1 - 3/n)^n$ approach?", answers: ["1"], answeredAt: "2026-11-08T10:00:00Z" }) as never,
		assistant("a2", { type: "toolCall", id: "s1", name: "send_to_user", arguments: { message: FEEDBACK } }) as never,
		result("r2", "s1", "send_to_user", null) as never,
		assistant("a3", { type: "toolCall", id: "p1", name: "probe_done", arguments: { assessment: { summary: "…" } } }) as never,
		result("r3", "p1", "probe_done", { ok: true }) as never,
	]);
	const faux = createFauxCore({});
	faux.setResponses([fauxAssistantMessage([fauxText("The chance of no events.")])]);
	const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const factory = (opts: object) => createPracticeAgent({ chatId: chat.id, chatStore }, { ...opts, ...onFake(engine, opts) });
	const steer = buildProbeHandoffSteer(chat.id);
	const ack = await handleChatInput(chat.id, { type: "steers", steers: [steer] }, factory as never);
	const handle = runningTurn(chat.id);
	if (handle) await new Response(handle.subscribe()).text();
	assert.equal(ack.status, 200);
	const wake = chatStore.getChat(chat.id)!.messages.find((m) => m.id === steer.id);
	assert.ok(wake, "the wake is in the record");
	assert.ok(String(wake.content).includes(`I have already read the probe's feedback on my last answer: "${FEEDBACK}"`), String(wake.content));
});
