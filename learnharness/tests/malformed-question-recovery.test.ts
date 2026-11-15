import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type AssistantMessage, type JsonObject, type Message } from "@earendil-works/pi-ai";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { ChatInput } from "../src/core/input-events.ts";
import type { QuestionAnswerData } from "../src/core/question-core.ts";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";
import { signInTestClaude, TEST_MODEL } from "./claude-fixture.ts";
import { fakeFor, onFake, type ScriptedModel } from "./helpers/fake-sdk.ts";

assert.equal(process.env.NODE_ENV, "test");
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-malformed-question-")));
const COURSE = path.join(scratch, "course");
fs.mkdirSync(COURSE);
const engineFake = useFakeEngine(scratch, [{ workspace: COURSE, title: "Fixture course" }]);
process.env.LH_DATA_DIR = path.join(scratch, "data");
await signInTestClaude();
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { SessionModel } = await import("../components/session-core.ts");
const { pendingQuestionOf, danglingQuestionOf, hasUnresolvedQuestion, malformedQuestionsOf, newUserMessage, newAnswerResult, newCourseContextMessage, newPlanBlockMessage, needsContinuation, nativeInputCause } = await import("../src/core/native-messages.ts");
const { findPendingToolCall } = await import("../src/core/pending.ts");
const { projectView } = await import("../src/core/view.ts");
const { parseQuestionInput } = await import("../src/core/tool-parts.ts");
const { inputAppends, parseChatInput, questionRecoveryAppends, endsInFailedTurn } = await import("../src/core/input-events.ts");
const { PATHS } = await import("../config.ts");

const valid = { type: "check", nodeId: "fixture", question: "Why is 2 even?", correctAnswer: "It is divisible by 2." };
const partial = { type: "check", nodeId: "fixture", question: "What follows from $\\frac" };
const answerOf = (text: string): QuestionAnswerData => ({ kind: "explain", tool: "explain", questionText: valid.question, answers: [], text, confidence: "confident", answeredAt: "fixture" });
function assistant(input: unknown = partial, stopReason = "toolUse", id = "fixture-assistant", callId = "bad", tool = "explain"): AssistantMessage & { id: string } {
	return { ...fauxAssistantMessage([fauxToolCall(tool, input as JsonObject, { id: callId })], { stopReason: stopReason as AssistantMessage["stopReason"] }), id };
}
function scripted(steps: FauxResponseStep[]) {
	const histories: unknown[] = [];
	const faux = createFauxCore({});
	faux.setResponses(steps.map(step => (context, options, state, model) => {
		histories.push(structuredClone(context.messages));
		return typeof step === "function" ? step(context, options, state, model) : step;
	}));
	return { engine: { model: faux.getModel(), streamFn: faux.streamSimple } as ScriptedModel, histories };
}
const replacement = () => fauxAssistantMessage([fauxToolCall("explain", valid, { id: "replacement" })], { stopReason: "toolUse" });
function configured(messages: LhMessage[] = [], course = false) {
	const chat = chatStore.createChat("Offline malformed question", course ? { workspace: COURSE, title: "Fixture course" } : undefined);
	chatStore.saveTree(chat.id, { nodes: [{ id: "fixture", title: "Fixture" }], edges: [], version: 1 });
	chatStore.saveMessages(chat.id, messages);
	return chat.id;
}
function request(chatId: string, input: unknown) {
	return new Request("http://test/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId, input }) });
}
async function turn(chatId: string, input: unknown, engine: ScriptedModel) {
	const response = await handleChatRequest(request(chatId, input), opts => createTeacherAgent(undefined, { ...opts, ...onFake(engine, opts) }));
	if (response.ok) { const handle = runningTurn(chatId); if (handle) await new Response(handle.subscribe()).text(); }
	return response;
}
/** The lesson's Claude Code session as a seeded record left it: the
 *  scripted model's fake holds the record's model-facing messages up to
 *  `synced`, the app keeps its copy beside the record, and the record's map
 *  is synced there. */
function seedSession(engine: ScriptedModel, chatId: string, synced: string): void {
	const messages = chatStore.getChat(chatId)!.messages;
	const held = messages.slice(0, messages.findIndex(m => m.id === synced) + 1).filter(m => m.role === "user" || m.role === "assistant" || m.role === "toolResult");
	const entries = held.map(m => ({ uuid: randomUUID(), message: m as Message }));
	const id = randomUUID();
	fakeFor(engine).sessions.set(id, entries);
	fs.mkdirSync(PATHS.chats, { recursive: true });
	fs.writeFileSync(path.join(PATHS.chats, `${chatId}.session.jsonl`), `${JSON.stringify({ entries: entries.length })}\n`);
	chatStore.saveSession(chatId, { id, synced, anchor: entries.at(-1)!.uuid });
}
type Context = Array<{ role: string; toolCallId?: string; content?: string | Array<{ type?: string; text?: string }> }>;
const blockTexts = (m: Context[number] | undefined) => typeof m?.content === "string" ? [m.content] : (m?.content ?? []).map(b => b.text ?? "");
const userTexts = (context: Context) => context.filter(m => m.role === "user").flatMap(blockTexts);
const recover = (messageId = "fixture-assistant", contentIndex = 0, toolCallId = "bad"): Extract<ChatInput, { type: "retry-question" }> => ({ type: "retry-question", messageId, contentIndex, toolCallId });
const saves = () => engineFake.calls().filter(call => call.args[0] === "--workspace" && call.args[1] === COURSE && call.args[2] === "save");
const observation = { topics: ["rank"], question: "first", text: valid.question, response: "Divisible by two", result: "correct", sure: "confident" };
/** An older record's truncated input: the call stays, its arguments no longer display. */
function truncate(messages: LhMessage[], callId: string): LhMessage[] {
	return messages.map(m => m.role !== "assistant" ? m : { ...m, content: m.content.map(b => b.type === "toolCall" && b.id === callId ? { ...b, arguments: partial } : b) });
}

for (const stopReason of ["error", "aborted"]) for (const input of [partial, valid]) {
	test(`${stopReason} generation never owns a question, even with ${input === valid ? "valid-looking" : "partial"} arguments`, async () => {
		const { engine } = scripted([() => ({ ...assistant(input, stopReason), errorMessage: "Offline interrupted response" })]);
		const id = configured();
		assert.equal((await turn(id, { type: "text", text: "offline fixture" }, engine)).status, 200);
		const turned = chatStore.getChat(id)!.messages;
		assert.equal(turned.filter(m => m.role === "toolResult").length, 0, "the failed generation's call never ran");
		assert.equal(pendingQuestionOf(turned), null);
		assert.ok(endsInFailedTurn(turned));
		// A reply cut off mid-call keeps its partial call in the record (a
		// stream that died after the call began, or an older record).
		const messages: LhMessage[] = [newUserMessage("offline fixture"), { ...assistant(input, stopReason), errorMessage: "Offline interrupted response" }];
		assert.equal(pendingQuestionOf(messages), null);
		assert.equal(findPendingToolCall(projectView(messages), pendingQuestionOf(messages)), null);
		assert.equal(danglingQuestionOf(messages), null);
		assert.equal(malformedQuestionsOf(messages).length, 0, "existing failure Retry/new-message path owns recovery");
		assert.ok(hasUnresolvedQuestion(messages), "unblocking the composer must not authorize a background wake");
		assert.equal(needsContinuation(messages), false);
		assert.equal(endsInFailedTurn(messages), stopReason === "error");
		assert.throws(() => inputAppends({ messages }, { type: "answer", toolCallId: "bad", answer: answerOf("2") }));
	});
}

for (const tool of ["ask_user_question", "explain", "recall"]) {
	test(`${tool}: accepted boundary normalization remains displayable without changing the record`, async () => {
		const raw = tool === "ask_user_question" ? { question: "Goal?", options: JSON.stringify([{ label: "Rank" }, { label: "Kernel" }]) }
			: { ...valid, type: '"check"' };
		assert.ok(parseQuestionInput(tool, raw));
		if (tool === "recall") return; // the prober's registry is covered by the existing question-tool tests
		const before = structuredClone(raw);
		const { engine } = scripted([() => assistant(raw, "toolUse", "raw", "raw-call", tool)]);
		const id = configured();
		await turn(id, { type: "text", text: "offline fixture" }, engine);
		const messages = chatStore.getChat(id)!.messages;
		const pending = pendingQuestionOf(messages)!;
		assert.ok(pending);
		assert.deepEqual(pending.input, before);
		assert.equal(malformedQuestionsOf(messages).length, 0);
		assert.ok(parseQuestionInput(tool, pending.input));
	});
}

test("an invalid call still returns a model-visible error and is retried within the turn", async () => {
	const { engine, histories } = scripted([() => assistant(partial), replacement]);
	const id = configured();
	await turn(id, { type: "text", text: "offline fixture" }, engine);
	const messages = chatStore.getChat(id)!.messages;
	assert.equal(histories.length, 2);
	assert.match(JSON.stringify(histories[1]), /"isError":true/);
	assert.equal(pendingQuestionOf(messages)?.toolCallId, "replacement");
	assert.equal(malformedQuestionsOf(messages).length, 0);
});

test("recovery keeps an answer course_save already recorded, and never saves it again", async () => {
	const id = configured([newUserMessage("teach me parity"), assistant(valid, "toolUse", "first-question", "first")], true);
	const baseline = saves().length;
	const { engine, histories } = scripted([() => fauxAssistantMessage([
		fauxToolCall("course_save", { changes: { observations: [observation] } }, { id: "save" }),
		fauxToolCall("explain", valid, { id: "bad" }),
	], { stopReason: "toolUse" }), replacement]);
	seedSession(engine, id, "first-question");
	assert.equal((await turn(id, { type: "answer", toolCallId: "first", answer: answerOf("Divisible by two") }, engine)).status, 200);
	assert.equal(saves().length, baseline + 1, "the answer turn recorded the attempt");
	const recorded = chatStore.getChat(id)!.messages;
	const before = truncate(recorded, "bad");
	chatStore.saveMessages(id, before);
	const bad = malformedQuestionsOf(before)[0]!;
	assert.equal(bad.toolCallId, "bad");
	assert.equal(pendingQuestionOf(before), null, "the malformed question never takes the dock");

	let posts = 0;
	const reopened = new SessionModel({ chatId: id, initialMessages: before, fetch: async () => { posts++; throw new Error("Unexpected automatic request"); } });
	await reopened.continueIfOwed(before);
	assert.equal(posts, 0, "reopening neither retries nor re-runs the saving turn");

	assert.equal((await turn(id, recover(bad.messageId, bad.contentIndex, bad.toolCallId), engine)).status, 200);
	const saved = chatStore.getChat(id)!.messages;
	assert.deepEqual(saved.slice(0, before.length), before, "the answer and its save receipt stay in the record");
	assert.equal(saved.filter(m => m.role === "toolResult" && m.toolCallId === "first").length, 1);
	assert.equal(saved.filter(m => m.role === "toolResult" && m.toolCallId === "save").length, 1);
	const recovery = saved.filter(m => m.role === "toolResult" && (m.details as { questionRecovery?: boolean } | null)?.questionRecovery);
	assert.deepEqual(recovery.map(m => m.role === "toolResult" && m.toolCallId), ["bad"], "only the malformed call is resolved");
	const context = histories[1] as Context;
	const resultText = (callId: string) => blockTexts(context.find(m => m.role === "toolResult" && m.toolCallId === callId)).join("");
	const answerText = (callId: string) => userTexts(context).find(text => text.startsWith(`<answer tool="explain" call="${callId}">`)) ?? "";
	assert.match(answerText("first"), /Divisible by two/, "the model still sees the answer");
	assert.match(resultText("save"), /"observations":\["o1"\]/, "and the receipt that it was recorded");
	assert.match(answerText("bad"), /not an answer: save no attempt for it/);
	assert.equal(saves().length, baseline + 1, "recovery replays no tool and saves nothing");
	assert.equal(pendingQuestionOf(saved)?.toolCallId, "replacement");
	assert.equal((await turn(id, recover(bad.messageId, bad.contentIndex, bad.toolCallId), engine)).status, 400, "a repeated click cannot run another recovery");
	assert.equal(histories.length, 2);
	assert.equal(saves().length, baseline + 1);
});

test("an answer held behind a malformed sibling reaches the model once and is saved once", async () => {
	const pair = assistant(valid, "toolUse", "pair", "first");
	pair.content.push(fauxToolCall("explain", partial, { id: "bad" }));
	const before = [newUserMessage("teach me parity"), pair];
	const id = configured(before, true);
	const baseline = saves().length;
	const idle = scripted([]);
	assert.equal(pendingQuestionOf(before)?.toolCallId, "first");
	assert.equal((await turn(id, { type: "answer", toolCallId: "first", answer: answerOf("Divisible by two") }, idle.engine)).status, 200);
	assert.equal(idle.histories.length, 0, "the malformed sibling holds the reaction turn");
	const held = chatStore.getChat(id)!.messages;
	assert.equal(held.filter(m => m.role === "toolResult").length, 1, "the held answer is durable");
	assert.equal(pendingQuestionOf(held), null);
	assert.equal(malformedQuestionsOf(held).length, 1);
	assert.equal(saves().length, baseline);

	const { engine, histories } = scripted([() => fauxAssistantMessage([
		fauxToolCall("course_save", { changes: { observations: [observation] } }, { id: "save" }),
		fauxToolCall("explain", valid, { id: "replacement" }),
	], { stopReason: "toolUse" })]);
	seedSession(engine, id, "pair");
	assert.equal((await turn(id, recover("pair", 1, "bad"), engine)).status, 200);
	assert.equal(histories.length, 1);
	assert.match(JSON.stringify(histories[0]), /Divisible by two/, "the recovery turn carries the held answer");
	assert.equal(saves().length, baseline + 1);
	const saved = chatStore.getChat(id)!.messages;
	assert.equal(saved.filter(m => m.role === "toolResult" && m.toolCallId === "first").length, 1, "no second copy of the answer");
	assert.deepEqual(saved.slice(before.length, before.length + 2).map(m => m.role === "toolResult" && m.toolCallId), ["first", "bad"], "both results stay adjacent to their calls");
	assert.equal(pendingQuestionOf(saved)?.toolCallId, "replacement");
	assert.equal((await turn(id, recover("pair", 1, "bad"), engine)).status, 400);
	assert.equal(saves().length, baseline + 1);
});

test("malformed siblings share one recovery turn; valid siblings must be answered first", async () => {
	const bad = assistant();
	bad.content.push(fauxToolCall("explain", valid, { id: "valid-sibling" }), fauxToolCall("explain", partial, { id: "bad-sibling" }));
	const before = [newUserMessage("fixture"), bad];
	const id = configured(before);
	const { engine, histories } = scripted([replacement]);
	seedSession(engine, id, "fixture-assistant");
	assert.equal(pendingQuestionOf(before)?.toolCallId, "valid-sibling");
	assert.equal((await turn(id, recover(), engine)).status, 400);
	assert.equal(histories.length, 0);
	assert.deepEqual(chatStore.getChat(id)!.messages.map(m => m.id), before.map(m => m.id));
	assert.equal((await turn(id, { type: "answer", toolCallId: "valid-sibling", answer: answerOf("2") }, engine)).status, 200);
	assert.equal(histories.length, 0, "answering a valid sibling must not implicitly retry a malformed sibling");
	assert.equal((await turn(id, recover(), engine)).status, 200);
	assert.equal(histories.length, 1);
	const saved = chatStore.getChat(id)!.messages;
	assert.equal(saved.filter(m => m.role === "toolResult" && m.isError).length, 2);
	assert.equal(nativeInputCause(saved.find(m => m.role === "toolResult" && m.isError)!, before), "learner");
	assert.equal(pendingQuestionOf(saved)?.toolCallId, "replacement");
});

test("interrupted recovery write-ahead stays paused on reopen until explicit input", async () => {
	const before = [newUserMessage("fixture"), assistant()];
	const id = configured(before);
	// The POST durably records these results before starting the replacement.
	// Model a server stop at exactly that boundary: no replacement output.
	const checkpoint = [...before, ...inputAppends({ messages: before }, recover())];
	chatStore.saveMessages(id, checkpoint);
	const reopened = chatStore.getChat(id)!.messages;
	let posts = 0;
	const model = new SessionModel({ chatId: id, initialMessages: reopened, fetch: async () => {
		posts++;
		return new Response("Unexpected automatic request", { status: 500 });
	} });
	await model.continueIfOwed(reopened);
	assert.equal(posts, 0, "the original click did not authorize a restart on reopen");
	assert.equal(needsContinuation(reopened), false);
	assert.equal(pendingQuestionOf(reopened), null);
	assert.equal(malformedQuestionsOf(reopened).length, 0, "resolved calls are not offered again as stale retries");
	const { engine, histories } = scripted([replacement]);
	seedSession(engine, id, "fixture-assistant");
	assert.equal((await turn(id, { type: "text", text: "Please continue with a new question" }, engine)).status, 200);
	assert.equal(histories.length, 1);
	assert.deepEqual(chatStore.getChat(id)!.messages.slice(0, reopened.length), reopened);
	assert.equal(pendingQuestionOf(chatStore.getChat(id)!.messages)?.toolCallId, "replacement");
});

test("ordinary answer and validation/length error result batches still owe continuation", () => {
	const answer = newAnswerResult("bad", "explain", answerOf("2"));
	assert.equal(needsContinuation([assistant(valid), answer]), true);
	for (const stopReason of ["toolUse", "length"]) {
		const owner = assistant(valid, stopReason);
		const recovery = questionRecoveryAppends([assistant()], recover())[0]!;
		if (recovery.role !== "toolResult") assert.fail("expected a tool result");
		const validation = { ...recovery, details: { tool: "explain", problems: ["Invalid arguments"] } };
		assert.equal(needsContinuation([owner, validation]), true);
	}
});

test("exact occurrence, current authority, and recoverable status are checked before writes or calls", async () => {
	const before = [newUserMessage("fixture"), assistant(), assistant(partial, "toolUse", "newer", "bad")];
	const id = configured(before);
	const { engine, histories } = scripted([replacement]);
	for (const input of [recover(), recover("newer", 1), recover("newer", 0, "other")]) {
		assert.equal((await turn(id, input, engine)).status, 400);
		assert.deepEqual(chatStore.getChat(id)!.messages, before);
	}
	for (const stop of ["error", "aborted", "pending"]) assert.throws(() => questionRecoveryAppends([assistant(partial, stop)], recover()));
	assert.throws(() => questionRecoveryAppends([assistant(valid)], recover()));
	for (const index of [-1, 0.5, "0", null]) assert.throws(() => parseChatInput({ ...recover(), contentIndex: index }));
	assert.equal(histories.length, 0);
	assert.equal(runningTurn(id), undefined);
});

test("reload offers recovery without generating; ordinary composer input also works", async () => {
	const before = [newUserMessage("fixture"), assistant()];
	const id = configured(before);
	let posts = 0;
	const model = new SessionModel({ chatId: id, initialMessages: before, fetch: async () => { posts++; throw new Error("Unexpected automatic request"); } });
	await model.continueIfOwed(before);
	assert.equal(posts, 0);
	assert.equal(pendingQuestionOf(model.getState().nativeMessages), null);
	const { engine, histories } = scripted([replacement]);
	seedSession(engine, id, "fixture-assistant");
	assert.equal((await turn(id, { type: "text", text: "Let's take another approach" }, engine)).status, 200);
	assert.match(JSON.stringify(histories[0]), /Let's take another approach/);
	assert.deepEqual(chatStore.getChat(id)!.messages.slice(0, before.length), before);
});

test("a recovery after a later learner message is refused by the server and not offered in the UI", async () => {
	// The learner's turn died before any assistant message was saved.
	const before = [newUserMessage("fixture"), assistant(), newCourseContextMessage("Course brief", "fixture"), newUserMessage("Let's move on")];
	const id = configured(before);
	const model = new SessionModel({ chatId: id, initialMessages: before, fetch: async () => { throw new Error("Unexpected automatic request"); } });
	assert.equal(malformedQuestionsOf(model.getState().nativeMessages).length, 0, "no Retry question button");
	assert.throws(() => questionRecoveryAppends(before, recover()), /no longer available/);
	const { engine, histories } = scripted([replacement]);
	assert.equal((await turn(id, recover(), engine)).status, 400);
	assert.equal(histories.length, 0);
	assert.deepEqual(chatStore.getChat(id)!.messages, before, "no result lands after the learner's message");
});

test("a plan block after the malformed question keeps recovery offered, and the result reaches the model right after its call", async () => {
	const before = [newUserMessage("fixture"), assistant(), newPlanBlockMessage("plan", {})];
	const id = configured(before);
	assert.equal(malformedQuestionsOf(before).length, 1);
	const { engine, histories } = scripted([replacement]);
	seedSession(engine, id, "fixture-assistant");
	assert.equal((await turn(id, recover(), engine)).status, 200);
	assert.equal(histories.length, 1);
	const context = (histories[0] as Context).filter(m => m.role !== "system");
	assert.deepEqual(context.map(m => m.role), ["user", "assistant", "user"], "the UI-only plan block sends nothing");
	assert.deepEqual(userTexts(context.slice(-1)).map(text => text.split("\n")[0]), ['<answer tool="explain" call="bad">'], "the next message is the call's recovery result");
	assert.equal(pendingQuestionOf(chatStore.getChat(id)!.messages)?.toolCallId, "replacement");
});
