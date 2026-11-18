/**
 * Round 12, 3 n10 (flagged two rounds running): after Done for today and
 * Resume, the question box's Hint, Show me and confidence worked only if
 * the tutor posed the question again. When he opens the session again
 * (never under the closing words: round 14, M1), the app poses every
 * question Done for today left open again from its own saved call, with
 * no tutor turn, so the normal question box serves it after
 * Resume as before Done: his hint, worked step and confidence ride its
 * answer. The session still reads left for today until he answers.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep } from "@earendil-works/pi-ai";
import { onFake, sendToUser, type ScriptedModel } from "./helpers/fake-sdk.ts";
import { signInTestClaude } from "./claude-fixture.ts";
import type { ChatListItem } from "../src/core/index.ts";

assert.equal(process.env.NODE_ENV, "test", "Run with NODE_ENV=test; these tests must not invoke real providers.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-resumed-box-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
await signInTestClaude();

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { reposeLeftQuestions } = await import("../src/server/chats.ts");
const { newCourseContextMessage, newUserMessage, pendingQuestionOf } = await import("../src/core/native-messages.ts");
const { inputAppends } = await import("../src/core/input-events.ts");
const { leftQuestionRepose } = await import("../src/core/session-end.ts");
const { closedTonight, doneTonightAtEnd, sessionEndOf } = await import("../src/core/session-end.ts");
const { projectView } = await import("../src/core/view.ts");
const { findPendingToolCall } = await import("../src/core/pending.ts");
const { sessionState } = await import("../components/nav/session-state.ts");
const { reaskedFrom } = await import("../components/lesson/prose/prose-question-data.ts");
const { leftDraftAt } = await import("../components/lesson/kept-drafts.ts");
const { subscribe } = await import("../src/core/events.ts");
const { turnInputOf } = await import("../src/agent/voice-guard.ts");

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const CHECK = {
	type: "check",
	nodeId: "planet-order",
	question: "Which planet is closest to the sun?",
	correctAnswer: "Mercury — the innermost orbit.",
};

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

function item(overrides: Partial<ChatListItem>): ChatListItem {
	return { id: "c1", title: "Invertible matrices", kind: "teach", createdAt: "2026-11-16T09:00:00.000Z", updatedAt: "2026-11-16T10:00:00.000Z", messageCount: 9, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false, ...overrides };
}

describe("the question Done for today left, after the close", () => {
	it("is posed again from its own call, no tutor turn, so the box serves it; a hint, a worked step and his confidence ride its answer", async () => {
		const { engine, histories } = scripted([
			() => fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-left" })], { stopReason: "toolUse" }),
			() => sendToUser("Good place to stop. Next time we start from Mercury's orbit."),
			() => fauxAssistantMessage(""),
			() => sendToUser("Hint: which orbit is innermost?"),
			() => fauxAssistantMessage(""),
		]);
		const chat = chatStore.createChat("Test: resumed question box");
		chatStore.saveTree(chat.id, { nodes: [{ id: "planet-order", title: "Planet order" }], edges: [], version: 1 });

		await turn(engine, chat.id, { type: "text", text: "teach me the planets" });
		assert.equal((await turn(engine, chat.id, { type: "tonight" })).status, 200);
		const turnsAtClose = histories.length;

		assert.equal(pendingQuestionOf(chatStore.getChat(chat.id)!.messages), null, "nothing is asked under the closing words (round 14, M1)");
		assert.equal(reposeLeftQuestions(chat.id), true, "he opens the session again");
		const saved = chatStore.getChat(chat.id)!.messages;
		const open = pendingQuestionOf(saved);
		assert.ok(open, "back in the session, the left question is posed again: the box has a call to serve");
		assert.notEqual(open.toolCallId, "call-left", "a new call: the left one keeps its Left for next time");
		assert.equal(open.tool, "explain");
		assert.deepEqual(open.input, CHECK, "its own saved call, word for word");
		assert.ok(findPendingToolCall(projectView(saved), open), "the lesson draws it as the open question");
		assert.equal(histories.length, turnsAtClose, "no tutor turn posed it");
		assert.equal(reaskedFrom(projectView(saved), open.toolCallId), "call-left", "his half answer, kept for the left call, fills its box");

		assert.equal(doneTonightAtEnd(saved), true, "his Done for today is still his latest input");
		assert.equal(closedTonight(saved), true, "the lesson stays closed for today");
		assert.equal(sessionEndOf(saved, chatStore.getChat(chat.id)!.tree), "left");
		const summary = chatStore.listChats().find((c) => c.id === chat.id)!;
		assert.equal(summary.pendingQuestion, true);
		assert.equal(sessionState({ ...summary, busy: false }), "left", "Home, the sidebar and the calendar still say left for today");

		const hint = { kind: "explain", questionText: CHECK.question, answers: [], text: "Mercury, I think", hintRequested: true, confidence: "confident", answeredAt: "2026-11-17T09:00:00.000Z" };
		assert.equal((await turn(engine, chat.id, { type: "answer", toolCallId: open.toolCallId, answer: hint })).status, 200, "the box's Hint is an answer to the posed call");
		const after = chatStore.getChat(chat.id)!.messages;
		const result = after.find((m) => m.role === "toolResult" && m.toolCallId === open.toolCallId) as { details: { hintRequested?: boolean; confidence?: string } } | undefined;
		assert.equal(result?.details.hintRequested, true, "Hint is saved on his answer");
		assert.equal(result?.details.confidence, "confident", "his confidence is saved on his answer");
		assert.equal(turnInputOf(after.slice(0, after.indexOf(result as never) + 1)).kind, "hint", "the tutor's turn reads a hint turn");
		const sent = histories[turnsAtClose]!;
		assert.match(sent, new RegExp(`<answer tool=\\\\"explain\\\\" call=\\\\"${open.toolCallId}\\\\">`), "the tutor gets his answer tagged with the posed call");
		assert.match(sent, /Done for today with your question left open, so the app asked it again/, "and is told the app asked its left question again");
		assert.ok(sent.includes(CHECK.question), "naming the question");
		assert.equal(doneTonightAtEnd(after), false, "answering picks the lesson up");
	});

	it("brings back his half answer from the lesson's record, however he reopens it, and tells a view already open (round 15, 3 m1)", async () => {
		const { engine, histories } = scripted([
			() => fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-left" })], { stopReason: "toolUse" }),
			() => sendToUser("Good place to stop. Next time we start from Mercury's orbit."),
			() => fauxAssistantMessage(""),
		]);
		const chat = chatStore.createChat("Test: half answer kept");
		await turn(engine, chat.id, { type: "text", text: "teach me the planets" });
		assert.equal((await turn(engine, chat.id, { type: "tonight", draft: { toolCallId: "call-left", text: "Mercury, because", confidence: "guessing" } })).status, 200);
		assert.doesNotMatch(histories.at(-1)!, /Mercury, because/, "the tutor never reads his half answer");
		const told: string[] = [];
		const off = subscribe((event) => {
			if (event.type === "record-changed") told.push((event as { chatId: string }).chatId);
		});
		try {
			assert.equal(reposeLeftQuestions(chat.id), true);
		} finally {
			off();
		}
		assert.deepEqual(told, [chat.id], "a view of the lesson already open takes the question asked again");
		const view = projectView(chatStore.getChat(chat.id)!.messages);
		const open = pendingQuestionOf(chatStore.getChat(chat.id)!.messages)!;
		const from = reaskedFrom(view, open.toolCallId)!;
		assert.deepEqual(leftDraftAt(view, from), { text: "Mercury, because", confidence: "guessing" }, "the box opens with it, from the record any window reads");
	});

	it("a lesson left with nothing open is not given a question", async () => {
		const { engine } = scripted([
			() => sendToUser("Here is the idea of an inverse."),
			() => fauxAssistantMessage(""),
			() => sendToUser("Good place to stop."),
			() => fauxAssistantMessage(""),
		]);
		const chat = chatStore.createChat("Test: nothing left open");
		await turn(engine, chat.id, { type: "text", text: "teach me the planets" });
		await turn(engine, chat.id, { type: "tonight" });
		assert.equal(reposeLeftQuestions(chat.id), false);
		assert.equal(pendingQuestionOf(chatStore.getChat(chat.id)!.messages), null);
	});
});

describe("a session left for today with a question posed", () => {
	it("reads left with the course brief between the question it set aside and his Done, and no plan yet (live, 16 Nov: it read closed, so Your turn)", () => {
		const asked = [newUserMessage("Teach me linear maps"), { id: "a1", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: CHECK }], api: "faux", provider: "test", model: "m", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "toolUse", timestamp: 1 }] as never[];
		const appends = inputAppends({ messages: asked }, { type: "tonight" });
		const withBrief = [...appends.slice(0, -1), newCourseContextMessage("[Course record] Linear Algebra", "k1"), ...appends.slice(-1)];
		const close = { ...(asked[1] as unknown as object), id: "a2", content: [{ type: "text", text: "Good place to stop." }], stopReason: "stop" } as never;
		const record = [...asked, ...withBrief, close];
		const reposed = [...record, ...leftQuestionRepose(record)];
		assert.ok(pendingQuestionOf(reposed), "the question is posed again");
		assert.equal(sessionEndOf(reposed, undefined), "left");
	});

	it("reads left, not your turn: he said he is done for today", () => {
		assert.equal(sessionState(item({ ended: "left", pendingQuestion: true })), "left");
		assert.equal(sessionState(item({ ended: "left", pendingQuestion: true, busy: true })), "working");
	});
});
