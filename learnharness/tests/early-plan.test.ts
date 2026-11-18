/**
 * Round 16, M6 (3 M9): probe to teaching still took 45 to 60 s, the plan
 * waiting on the assessment the probe writes first. Edo's approved lever:
 * the teacher plans while the assessment is written, on a fork of the
 * probe's session, from his answers; the handoff's turn takes that run and
 * reads it from its start, so he sees the same handoff, sooner. A run that
 * failed before it was taken, or a probe that did not conclude, leaves the
 * handoff as it was.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type Message } from "@earendil-works/pi-ai";
import { fakeSdk } from "./helpers/fake-sdk.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-early-plan-"));
process.env.LH_DATA_DIR = path.join(TMP, "data");

const { newUserMessage } = await import("../src/core/native-messages.ts");
const { EARLY_PLAN_TEXT } = await import("../src/core/contracts.ts");
const { handleChatInput } = await import("../src/server/chat-handler.ts");
const { hasEarlyPlan } = await import("../src/server/early-plan.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { createProberAgent, createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { signInTestClaude } = await import("./claude-fixture.ts");
await signInTestClaude();
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const ASSESSMENT = { strands: [{ strand: "limits of powers", assessment: "Takes the base's limit alone." }] };
const FEEDBACK = "The base and the exponent change together.";

/** A lesson at the probe's last question, on its own scripted model; each
 *  request's messages are kept, with the handoffs the probe delivers. */
async function lesson(steps: Parameters<ReturnType<typeof createFauxCore>["setResponses"]>[0]) {
	const faux = createFauxCore({});
	const seen: Message[][] = [];
	const scripted = { model: faux.getModel(), streamFn: ((model, context, options) => { seen.push([...context.messages]); return faux.streamSimple(model, context, options); }) as typeof faux.streamSimple };
	const fake = fakeSdk(scripted);
	const chat = chatStore.createChat("Poisson distribution");
	chatStore.saveMessages(chat.id, [newUserMessage("teach me the Poisson distribution")]);
	const handoffs: unknown[] = [];
	const factory = (opts: { agent: string; messages?: unknown[]; session?: unknown; sessionStore?: unknown }) => {
		const built = { ...opts, engine: fake.engine };
		return opts.agent === "teacher"
			? createTeacherAgent({ chatId: chat.id, chatStore, jobStore: undefined as never, spawn: () => undefined, deliver: () => undefined }, built as never)
			: createProberAgent({ chatId: chat.id, chatStore, deliver: (steer) => handoffs.push(steer), jobStore: undefined as never, spawn: () => undefined }, built as never);
	};
	const turn = async (input: Parameters<typeof handleChatInput>[1]) => {
		const ack = await handleChatInput(chat.id, input, factory as never);
		assert.equal(ack.status, 200, await ack.clone().text());
		const handle = runningTurn(chat.id);
		if (handle) await new Response(handle.subscribe()).text();
	};
	faux.setResponses([fauxAssistantMessage([fauxToolCall("recall", { question: "What does $(1 - 3/n)^n$ approach?", correctAnswer: "$e^{-3}$" }, { id: "q1" })], { stopReason: "toolUse" }), ...steps]);
	await turn({ type: "continue" });
	return { chat: chat.id, fake, seen, handoffs, turn };
}

const answer = { type: "answer" as const, toolCallId: "q1", answer: { kind: "explain" as const, tool: "recall", questionText: "What does $(1 - 3/n)^n$ approach?", answers: [], text: "1", answeredAt: "2026-11-18T10:00:00Z" } };
const conclude = fauxAssistantMessage([fauxToolCall("send_to_user", { message: FEEDBACK }), fauxToolCall("probe_done", { assessment: ASSESSMENT })], { stopReason: "toolUse" });
const plan = fauxAssistantMessage([fauxToolCall("plan_init", { mermaid: "graph TD\n  a[Powers of a vanishing base] --> b[The Poisson limit]" }), fauxToolCall("send_to_user", { message: "Start from what the exponent does: it grows as the base shrinks toward one." }), fauxToolCall("explain", { type: "check", nodeId: "a", question: "What does $(1 - 1/n)^n$ approach?", correctAnswer: "$e^{-1}$" }, { id: "q2" })], { stopReason: "toolUse" });

describe("planning while the assessment is written", () => {
	it("the handoff runs on the plan begun from his answers, before the assessment, and starts nothing of its own", async () => {
		const { chat, fake, seen, handoffs, turn } = await lesson([conclude, plan]);
		await turn(answer);
		assert.equal(handoffs.length, 1, "the probe concluded and queued its handoff");
		assert.ok(hasEarlyPlan(chat), "the teacher began while the assessment was written");
		const queries = fake.calls.length;
		await turn({ type: "steers", steers: handoffs as never });
		assert.equal(fake.calls.length, queries, "the handoff's turn took the run begun early");
		const teacherRequest = seen.find((messages) => JSON.stringify(messages).includes(EARLY_PLAN_TEXT));
		assert.ok(teacherRequest, "the teacher read that the assessment was being written");
		assert.doesNotMatch(JSON.stringify(teacherRequest), /Takes the base's limit alone/, "it planned from his answers, not the assessment");
		assert.match(JSON.stringify(teacherRequest), /I have already read the probe's feedback on my last answer/);
		const record = chatStore.getChat(chat)!.messages;
		const handoffAt = record.findIndex((m) => m.role === "custom" && m.customType === "probe-handoff");
		const planAt = record.findIndex((m) => m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.name === "plan_init"));
		assert.ok(handoffAt >= 0 && planAt > handoffAt, "the plan lands after the handoff, as before");
		assert.ok(record.some((m) => m.role === "toolResult" && m.toolName === "plan_init" && !m.isError), "its tools ran for the handoff's turn");
	});

	it("a plan run that failed before the handoff leaves the handoff to plan as before, with no error on his screen", async () => {
		const { chat, fake, handoffs, turn } = await lesson([conclude, fauxAssistantMessage([], { stopReason: "error", errorMessage: "overloaded" }), plan]);
		await turn(answer);
		const queries = fake.calls.length;
		await turn({ type: "steers", steers: handoffs as never });
		assert.equal(fake.calls.length, queries + 1, "the handoff started its own run");
		const record = chatStore.getChat(chat)!.messages;
		assert.ok(!record.some((m) => m.role === "assistant" && m.stopReason === "error"), "no failed reply in the record");
		assert.ok(record.some((m) => m.role === "toolResult" && m.toolName === "plan_init" && !m.isError));
	});

	it("any other turn of the lesson before the handoff ends the plan it began", async () => {
		const { chat, turn } = await lesson([conclude, plan, fauxAssistantMessage([fauxToolCall("send_to_user", { message: "Here is where we were." })], { stopReason: "toolUse" }), fauxAssistantMessage("")]);
		await turn(answer);
		assert.ok(hasEarlyPlan(chat));
		await turn({ type: "text", text: "wait, where were we?" });
		assert.ok(!hasEarlyPlan(chat), "nothing waits for a handoff that came another way");
	});
});
