/**
 * Fix round 16, Edo's approved prestart (P5): the next answer's Claude Code
 * process starts while he thinks, so his answer's turn spends no start-up
 * on it. The process is exactly the one the turn would have started (the
 * turn takes it only when every option matches, and starts its own
 * otherwise), it serves one turn, and none outlives his leaving the lesson,
 * another lesson's page, a turn there, Stop, sign-out or a change of
 * account: the live processes are counted after each.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { fakeFor, onFake } from "./helpers/fake-sdk.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-prestart-"));
process.env.LH_DATA_DIR = path.join(TMP, "data");

const { newUserMessage } = await import("../src/core/native-messages.ts");
const { handleChatInput, prestartAnswerTurn } = await import("../src/server/chat-handler.ts");
const { releasePrestart } = await import("../src/server/prestart.ts");
const { runningTurn, stopTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { createProberAgent } = await import("../src/agent/teacher-agent.ts");
const { claudeAccountStatuses } = await import("../src/server/claude-connection-http.ts");
const { PUT: putSettings } = await import("../app/api/settings/[section]/route.ts");
const { processKey } = await import("../src/agent/sdk/agent.ts");
const { signInTestClaude, TEST_MODEL } = await import("./claude-fixture.ts");
await signInTestClaude();
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const faux = createFauxCore({});
const scripted = { model: faux.getModel(), streamFn: faux.streamSimple };
const fake = fakeFor(scripted);
const factory = (chatId: string) => (opts: object) => createProberAgent({ chatId, chatStore, deliver: () => undefined, jobStore: undefined as never, spawn: () => undefined }, { ...opts, ...onFake(scripted, opts as never) });
const question = (id: string) => fauxAssistantMessage([fauxToolCall("recall", { question: "What does a hash function return?", correctAnswer: "An index into the table." }, { id })], { stopReason: "toolUse" });

/** Runs one turn of `chatId` to its end. */
async function turn(chatId: string, input: Parameters<typeof handleChatInput>[1]): Promise<void> {
	const ack = await handleChatInput(chatId, input, factory(chatId) as never);
	assert.equal(ack.status, 200, await ack.clone().text());
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
}

/** A lesson that waits on his answer to a question. */
async function waiting(title: string, id: string): Promise<string> {
	const chat = chatStore.createChat(title);
	chatStore.saveMessages(chat.id, [newUserMessage(`teach me ${title}`)]);
	faux.setResponses([question(id)]);
	await turn(chat.id, { type: "continue" });
	return chat.id;
}

const answer = (id: string) => ({ type: "answer" as const, toolCallId: id, answer: { kind: "explain" as const, tool: "recall", questionText: "What does a hash function return?", answers: [], text: "An index.", answeredAt: "2026-11-18T10:00:00Z" } });

describe("the next answer's process, started while he thinks", () => {
	let a = "";
	let b = "";
	before(async () => {
		a = await waiting("hash tables", "q-a1");
		b = await waiting("heaps", "q-b1");
	});

	it("is the process his answer's turn runs on, used once, and gone with the turn", async () => {
		const before = fake.started.length;
		await prestartAnswerTurn(a, factory(a) as never);
		assert.equal(fake.live(), 1);
		const prestarted = fake.started.at(-1);
		await prestartAnswerTurn(a, factory(a) as never);
		assert.equal(fake.started.length, before + 1, "asked again with the same options, it keeps the one it started");
		faux.setResponses([question("q-a2")]);
		await turn(a, answer("q-a1"));
		assert.ok(fake.calls.at(-1) === prestarted, "the turn ran on the process started for it, with every option it starts one with");
		assert.equal(fake.started.length, before + 1, "the turn started no other");
		assert.equal(fake.live(), 0);
	});

	it("ends when he leaves the lesson", async () => {
		await prestartAnswerTurn(a, factory(a) as never);
		assert.equal(fake.live(), 1);
		releasePrestart(a);
		assert.equal(fake.live(), 0);
	});

	it("ends when he opens another lesson that waits on him, which gets its own", async () => {
		await prestartAnswerTurn(a, factory(a) as never);
		await prestartAnswerTurn(b, factory(b) as never);
		assert.equal(fake.live(), 1, "one process, the other lesson's");
		releasePrestart(a);
		assert.equal(fake.live(), 1, "leaving the first lesson ends nothing of the second");
		faux.setResponses([question("q-b2")]);
		await turn(b, answer("q-b1"));
		assert.equal(fake.live(), 0);
	});

	it("ends on a turn it does not match, which starts its own as before", async () => {
		await prestartAnswerTurn(a, factory(a) as never);
		const prestarted = fake.started.at(-1);
		// The session moved since: the turn resumes it elsewhere, an option the
		// process lacks.
		const record = chatStore.getChat(a)!;
		chatStore.saveSession(a, { ...record.session!, cut: true, anchor: record.session!.anchor ?? "kept" });
		faux.setResponses([question("q-a3")]);
		await turn(a, answer("q-a2"));
		assert.ok(fake.calls.at(-1) !== prestarted, "the turn started its own process");
		assert.equal(fake.live(), 0, "the unmatched one ended");
	});

	it("is started only while he owes an answer, and Stop leaves none", async () => {
		faux.setResponses([fauxAssistantMessage([fauxText("Thinking it over.")], { stopReason: "stop" })]);
		const ack = await handleChatInput(a, answer("q-a3"), factory(a) as never);
		assert.equal(ack.status, 200);
		const started = fake.started.length;
		await prestartAnswerTurn(a, factory(a) as never);
		assert.equal(fake.started.length, started, "his answer is in: nothing to start");
		stopTurn(a);
		const handle = runningTurn(a);
		if (handle) await new Response(handle.subscribe()).text();
		assert.equal(fake.live(), 0);
	});

	it("ends when he changes the Claude account", async () => {
		const c = await waiting("tries", "q-c1");
		await prestartAnswerTurn(c, factory(c) as never);
		assert.equal(fake.live(), 1);
		const put = await putSettings(new Request("http://x/api/settings/claude", { method: "PUT", body: JSON.stringify({ account: TEST_MODEL.provider }) }), { params: Promise.resolve({ section: "claude" }) });
		assert.equal(put.status, 200);
		assert.equal(fake.live(), 0);
	});

	it("ends when his Claude account is signed out", async () => {
		const d = await waiting("graphs", "q-d1");
		await prestartAnswerTurn(d, factory(d) as never);
		assert.equal(fake.live(), 1);
		await claudeAccountStatuses({
			force: true,
			binary: () => "/nonexistent/claude",
			run: async () => ({ code: 0, stdout: JSON.stringify({ loggedIn: false }), stderr: "" }),
			now: () => Number.POSITIVE_INFINITY,
		} as never);
		assert.equal(fake.live(), 0);
		await signInTestClaude();
	});

	it("matches though the SDK wrote its version into this server's environment in between, as its first call does (live, 18 Nov)", () => {
		const before = processKey({ env: { PATH: "/usr/bin" }, model: "m" }, [], "/config");
		const after = processKey({ env: { PATH: "/usr/bin", CLAUDE_AGENT_SDK_VERSION: "0.3.319" }, model: "m" }, [], "/config");
		assert.equal(after, before, "every process gets the SDK's version either way");
		assert.notEqual(processKey({ env: { PATH: "/bin" }, model: "m" }, [], "/config"), before, "any other variable of ours still counts");
	});
});
