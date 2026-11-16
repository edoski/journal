/**
 * Round 14, M1 (1 M1, 2 D2, 3 M1, 4 minor 5; with 3 n5 and 4 minor 4):
 * Done for today re-asked the left question, so a session he stopped read
 * "Your turn" on Home, the sidebar, the topic page and the calendar.
 *
 * The close turn ended at its closing words, as round 13 made it
 * (`send_to_user` after `lesson_progress {close: true}` ends the turn), so
 * the record ended on that call's result. The record's fold read a turn
 * ending on answered tool calls as owing a reply: the session read cut
 * ("Reply cut off" in the sidebar) and the chat sent a continue ("Continue
 * from where you stopped."), in which the tutor asked the left question
 * again or asked for work ("Type part (e) of sheet 4.").
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep } from "@earendil-works/pi-ai";
import { onFake, sendToUser, type ScriptedModel } from "./helpers/fake-sdk.ts";
import { signInTestClaude } from "./claude-fixture.ts";

assert.equal(process.env.NODE_ENV, "test", "Run with NODE_ENV=test; these tests must not invoke real providers.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-done-closes-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
await signInTestClaude();

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { needsContinuation, pendingQuestionOf } = await import("../src/core/native-messages.ts");
const { sessionEndOf } = await import("../src/core/session-end.ts");
const { continuesTask, sessionState } = await import("../components/nav/session-state.ts");
const { reposeLeftQuestions } = await import("../src/server/chats.ts");

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
		(opts) => createTeacherAgent({ chatId, chatStore, jobStore, spawn: () => {} }, { ...opts, ...onFake(engine, opts) }),
	);
	if (ack.status === 200) {
		const handle = runningTurn(chatId);
		if (handle) await new Response(handle.subscribe()).text();
	}
	return ack;
}

function lesson(title: string) {
	const chat = chatStore.createChat(title);
	chatStore.saveTree(chat.id, { nodes: [{ id: "planet-order", title: "Planet order" }, { id: "orbits", title: "Orbits" }], edges: [{ from: "planet-order", to: "orbits" }], version: 1 });
	return chat;
}

const close = () => fauxAssistantMessage([fauxToolCall("lesson_progress", { done: [], close: true })], { stopReason: "toolUse" });
const reask = () => fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-again" })], { stopReason: "toolUse" });

function summary(chatId: string) {
	const item = chatStore.listChats().find((c) => c.id === chatId)!;
	return { ...item, busy: false };
}

describe("Done for today with a question open (round 14, M1)", () => {
	it("ends at the closing words: nothing is owed, so no continue runs, and the session reads left for today", async () => {
		const { engine, histories } = scripted([
			() => fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-left" })], { stopReason: "toolUse" }),
			close,
			() => sendToUser("Your lesson picks up at the planet question tomorrow."),
			// What the continue got: "Continue from where you stopped."
			reask,
		]);
		const chat = lesson("Test: close ends at its words");
		await turn(engine, chat.id, { type: "text", text: "teach me the planets" });
		assert.equal((await turn(engine, chat.id, { type: "tonight" })).status, 200);

		const saved = chatStore.getChat(chat.id)!.messages;
		assert.equal(needsContinuation(saved), false, "the closing words ended the turn on purpose: the chat owes no continue");
		assert.equal(histories.length, 3, "the tutor was never asked to go on after its closing words");
		assert.equal(sessionEndOf(saved, chatStore.getChat(chat.id)!.tree), "left");
		assert.equal(sessionState(summary(chat.id)), "left", "Home, the sidebar, the topic page and the calendar say Left off today");
		assert.equal(pendingQuestionOf(saved), null, "nothing is asked under the closing words");
		assert.equal(continuesTask(summary(chat.id)), false, "the left question waits for him, so Continue opens the chat at it and takes up no task");

		assert.equal(reposeLeftQuestions(chat.id), true, "when he opens the session again, the left question is asked again");
		const resumed = chatStore.getChat(chat.id)!.messages;
		const open = pendingQuestionOf(resumed);
		assert.deepEqual(open?.input, CHECK, "its own call, word for word, so Hint, Show me and his confidence serve it");
		assert.equal(histories.length, 3, "with no tutor turn");
		assert.equal(sessionState(summary(chat.id)), "left", "and the session reads left until he answers");
		assert.equal(reposeLeftQuestions(chat.id), false, "once");
	});

	it("refuses a question after the close, in the closing words' own reply too", async () => {
		const { engine } = scripted([
			() => fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-left" })], { stopReason: "toolUse" }),
			close,
			() => fauxAssistantMessage([fauxToolCall("send_to_user", { message: "Your lesson picks up at the planet question tomorrow." }), fauxToolCall("explain", CHECK, { id: "call-again" })], { stopReason: "toolUse" }),
			() => fauxAssistantMessage(""),
		]);
		const chat = lesson("Test: no question after the close");
		await turn(engine, chat.id, { type: "text", text: "teach me the planets" });
		await turn(engine, chat.id, { type: "tonight" });
		const saved = chatStore.getChat(chat.id)!.messages;
		const again = saved.find((m) => m.role === "toolResult" && m.toolCallId === "call-again");
		assert.ok(again?.role === "toolResult" && again.isError, "the question after the close is refused");
		assert.equal(pendingQuestionOf(saved), null, "so nothing waits on him");
		assert.equal(sessionState(summary(chat.id)), "left");
	});

	it("refuses new work in the turn that answers his Done for today, before any close", async () => {
		const { engine } = scripted([
			() => fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-left" })], { stopReason: "toolUse" }),
			() => sendToUser("We'll stop here for today."),
			reask,
			() => fauxAssistantMessage(""),
		]);
		const chat = lesson("Test: no question in the Done turn");
		await turn(engine, chat.id, { type: "text", text: "teach me the planets" });
		await turn(engine, chat.id, { type: "tonight" });
		const saved = chatStore.getChat(chat.id)!.messages;
		assert.equal(pendingQuestionOf(saved), null, "the re-ask is refused");
		assert.equal(sessionState(summary(chat.id)), "left");
	});

	it("reads left on a record whose close ended in the tutor's own re-ask (the round-14 records)", async () => {
		const { engine } = scripted([
			() => fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-left" })], { stopReason: "toolUse" }),
			close,
			() => sendToUser("Your lesson picks up at the planet question tomorrow."),
		]);
		const chat = lesson("Test: recorded re-ask");
		await turn(engine, chat.id, { type: "text", text: "teach me the planets" });
		await turn(engine, chat.id, { type: "tonight" });
		const closed = chatStore.getChat(chat.id)!.messages;
		const reasked = { ...(closed.findLast((m) => m.role === "assistant") as object), id: "m-reask", content: [{ type: "toolCall", id: "call-again", name: "explain", arguments: CHECK }], stopReason: "toolUse" } as never;
		const record = [...closed, reasked];
		chatStore.saveMessages(chat.id, record);
		assert.ok(pendingQuestionOf(record), "the re-ask is open in the record");
		assert.equal(sessionEndOf(record, chatStore.getChat(chat.id)!.tree), "left", "his Done for today is read before the trailing call: not cut");
		assert.equal(sessionState(summary(chat.id)), "left", "so no surface says Your turn");
	});
});
