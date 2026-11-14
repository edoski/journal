/**
 * Done for today: one learner action stops the session whatever is open.
 * A check he left resolves unanswered with its answer withheld, never
 * graded; an active problem drops with nothing recorded; the agent reads
 * a marker telling it to close. Scripted faux engines: no real provider.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type FauxResponseStep } from "@earendil-works/pi-ai";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { onFake, type ScriptedModel } from "./helpers/fake-sdk.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { signInTestClaude } from "./claude-fixture.ts";

assert.equal(process.env.NODE_ENV, "test", "Run with NODE_ENV=test; these tests must not invoke real providers.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-done-tonight-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LH_CREDENTIALS_DIR = scratch;
await signInTestClaude();

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { inputAppends, parseChatInput } = await import("../src/core/input-events.ts");
const { activeProblemOf, newProblemDismissedMarker, newUserMessage, pendingQuestionOf, PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL } = await import("../src/core/native-messages.ts");
const { closedTonight, doneTonightAtEnd, sessionEndOf } = await import("../src/core/session-end.ts");
const { projectView } = await import("../src/core/view.ts");
const { DONE_TONIGHT_TEXT } = await import("../src/core/contracts/chat.ts");

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const CHECK = {
	type: "check",
	nodeId: "planet-order",
	question: "Which planet is closest to the sun?",
	correctAnswer: "Mercury — the innermost orbit.",
};

const STAMPS = {
	api: "faux", provider: "test", model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
} as const;

const assistant = (id: string, content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "toolUse"): LhMessage =>
	({ id, role: "assistant", content, timestamp: 1, ...STAMPS, stopReason }) as LhMessage;
const ack = (toolCallId: string, toolName: string): LhMessage =>
	({ id: `r_${toolCallId}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details: null, isError: false, timestamp: 2 }) as LhMessage;

/** A lesson waiting on one check (or two parallel ones). */
const pendingChecks = (...ids: string[]): LhMessage[] => [
	newUserMessage("teach me the planets"),
	assistant("a_q", ids.map((id) => ({ type: "toolCall" as const, id, name: "explain", arguments: CHECK }))),
];

const problemPose = (callId = "call_p1"): LhMessage[] => [
	assistant(`a_${callId}`, [{ type: "toolCall", id: callId, name: PRACTICE_PROBLEM_TOOL, arguments: { statement: "Show that…", mode: "recall", modelSolution: "Because…" } }]),
	ack(callId, PRACTICE_PROBLEM_TOOL),
];

type Withheld = ToolResultMessage & { details: { dismissed?: boolean; reason?: string; committed?: string; confidence?: string } };
const results = (messages: LhMessage[]) => messages.filter((m): m is LhMessage & Withheld => m.role === "toolResult");
const last = (messages: LhMessage[]) => messages.at(-1) as { role: string; customType?: string; content?: unknown };

describe("the tonight input", () => {
	it("parses bare", () => {
		assert.deepEqual(parseChatInput({ type: "tonight" }), { type: "tonight" });
	});

	it("leaves a pending check unanswered: a dismissal for tonight, no answer, no grade", () => {
		const appends = inputAppends({ messages: pendingChecks("q1") }, { type: "tonight" });
		const [withheld] = results(appends);
		assert.equal(withheld?.toolCallId, "q1", "the result stays adjacent to its call");
		assert.equal(withheld.details.dismissed, true);
		assert.equal(withheld.details.reason, "tonight");
		assert.equal(withheld.details.committed, undefined, "the answer is never carried");
		assert.equal(withheld.details.confidence, undefined, "nothing to grade");
		assert.match(JSON.stringify(withheld.content), /stopped for today/);
		assert.equal(last(appends).customType, "done-tonight");
		assert.equal(last(appends).content, DONE_TONIGHT_TEXT.prober, "the prober answers before the probe concludes");
		assert.equal(pendingQuestionOf([...pendingChecks("q1"), ...appends]), null);
	});

	it("tells the teacher to close the lesson with lesson_progress", () => {
		const resumed = { id: "resume", role: "custom", customType: "session-resume", content: "", display: true, details: {}, timestamp: 0 } as LhMessage;
		const appends = inputAppends({ messages: [resumed, ...pendingChecks("q1")] }, { type: "tonight" });
		assert.equal(last(appends).content, DONE_TONIGHT_TEXT.teacher);
		assert.match(DONE_TONIGHT_TEXT.teacher, /lesson_progress/);
	});

	it("leaves every parallel sibling unanswered", () => {
		const appends = inputAppends({ messages: pendingChecks("q1", "q2") }, { type: "tonight" });
		assert.deepEqual(results(appends).map((r) => [r.toolCallId, r.details.reason]), [["q1", "tonight"], ["q2", "tonight"]]);
	});

	it("drops an active practice problem with nothing recorded and closes with the practice words", () => {
		const record = { messages: problemPose(), kind: "practice" as const };
		const appends = inputAppends(record, { type: "tonight" });
		assert.deepEqual(appends.map((m) => m.role === "custom" ? m.customType : m.role),
			["problem-dismissed", "assistant", "toolResult", "done-tonight"]);
		const conclude = appends[1] as AssistantMessage;
		assert.deepEqual(conclude.content.map((b) => b.type === "toolCall" ? [b.name, b.arguments] : null),
			[[PRACTICE_CONCLUDE_TOOL, { outcome: "dismissed" }]], "the synthesized conclude records nothing");
		assert.equal(last(appends).content, DONE_TONIGHT_TEXT.practice);
		assert.equal(activeProblemOf([...record.messages, ...appends]), null);
	});

	it("carries the conclude pair a discard left waiting", () => {
		const record = { messages: [...problemPose(), newProblemDismissedMarker("call_p1")], kind: "practice" as const };
		const appends = inputAppends(record, { type: "tonight" });
		assert.deepEqual(appends.map((m) => m.role === "custom" ? m.customType : m.role), ["assistant", "toolResult", "done-tonight"]);
	});

	it("projects a quiet Done for today line", () => {
		const appends = inputAppends({ messages: [] }, { type: "tonight" });
		assert.ok(projectView(appends).some((m) => m.parts.some((p) => p.type === "data-done-tonight")));
	});
});

describe("a session he closed for today", () => {
	const practice = (): LhMessage[] => {
		const record = { messages: problemPose(), kind: "practice" as const };
		return [...record.messages, ...inputAppends(record, { type: "tonight" })];
	};

	it("reads done while his Done for today is his latest input, left for next time while it set work aside", () => {
		const closed = [...practice(), assistant("a_bye", [{ type: "text", text: "Good work tonight. Next time: the second lemma." }], "stop")];
		assert.equal(doneTonightAtEnd(closed), true);
		assert.equal(closedTonight(closed), true, "a practice session closed by him reads closed for the digest");
		assert.equal(sessionEndOf(closed, undefined, "practice"), "left", "the problem it dropped waits for next time");
	});

	it("a check he left open at Done for today waits for next time", () => {
		const record = { messages: pendingChecks("call_q1") };
		const closed = [...record.messages, ...inputAppends(record, { type: "tonight" }), assistant("a_bye", [{ type: "text", text: "Next time we start with that check." }], "stop")];
		assert.equal(sessionEndOf(closed, undefined), "left");
	});

	it("Done for today with nothing open closes the session", () => {
		const wrapped: LhMessage[] = [
			...problemPose(),
			assistant("a_c", [{ type: "toolCall", id: "call_c1", name: PRACTICE_CONCLUDE_TOOL, arguments: { outcome: "solved", verdict: "Right.", rung: null, missClass: null, retest: false, result: "correct" } }]),
			ack("call_c1", PRACTICE_CONCLUDE_TOOL),
			assistant("a_w", [{ type: "text", text: "Solved." }], "stop"),
		];
		const record = { messages: wrapped, kind: "practice" as const };
		const closed = [...wrapped, ...inputAppends(record, { type: "tonight" }), assistant("a_bye", [{ type: "text", text: "Good work." }], "stop")];
		assert.equal(sessionEndOf(closed, undefined, "practice"), "closed", "a round he opened on no topics is his to end");
	});

	it("reopens when he writes again", () => {
		const reopened = [...practice(), assistant("a_bye", [{ type: "text", text: "Good night." }], "stop"), newUserMessage("one more?")];
		assert.equal(doneTonightAtEnd(reopened), false);
		assert.equal(closedTonight(reopened), false);
	});

	it("never reads done without the marker", () => {
		assert.equal(doneTonightAtEnd(problemPose()), false);
		assert.equal(doneTonightAtEnd([]), false);
	});
});

function scripted(steps: FauxResponseStep[]) {
	const histories: string[] = [];
	const faux = createFauxCore({});
	faux.setResponses(steps.map((step) => (context, options, state, model) => {
		histories.push(JSON.stringify(context.messages));
		return typeof step === "function" ? step(context, options, state, model) : step;
	}));
	const engine: ScriptedModel = { model: faux.getModel(), streamFn: faux.streamSimple };
	return { engine, histories };
}

async function turn(engine: ScriptedModel, chatId: string, input: unknown): Promise<Response> {
	const ack = await handleChatRequest(
		new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input }) }),
		(opts) => createTeacherAgent(undefined, { ...opts, ...onFake(engine, opts) }),
	);
	if (ack.status === 200) {
		const handle = runningTurn(chatId);
		if (handle) await new Response(handle.subscribe()).text();
	}
	return ack;
}

describe("Done for today on the server", () => {
	it("withholds a pending check's answer, never grades it, and runs the closing turn", async () => {
		const { engine, histories } = scripted([
			() => fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-1" })], { stopReason: "toolUse" }),
			() => fauxAssistantMessage([fauxText("Good place to stop. Next time we start from Mercury's orbit.")]),
		]);
		const chat = chatStore.createChat("Test: done for today");
		chatStore.saveTree(chat.id, { nodes: [{ id: "planet-order", title: "Planet order" }], edges: [], version: 1 });

		await turn(engine, chat.id, { type: "text", text: "teach me the planets" });
		assert.equal((await turn(engine, chat.id, { type: "tonight" })).status, 200);

		const saved = chatStore.getChat(chat.id)!.messages;
		const withheld = results(saved).filter((r) => r.toolCallId === "call-1");
		assert.equal(withheld.length, 1);
		assert.equal(withheld[0]!.details.reason, "tonight");
		assert.equal(withheld[0]!.details.committed, undefined, "the answer stays hidden in the record");
		assert.ok(saved.some((m) => m.role === "custom" && m.customType === "done-tonight"), "the marker is saved");
		assert.match(JSON.stringify(saved.at(-1)), /Good place to stop/, "the closing turn ran");
		assert.equal(histories.length, 2);
		assert.match(histories[1]!, /stopped for today/, "the model reads the check as left, not answered");
		assert.match(histories[1]!, /DONE FOR TODAY/);
		assert.equal(doneTonightAtEnd(saved), true);
	});
});
