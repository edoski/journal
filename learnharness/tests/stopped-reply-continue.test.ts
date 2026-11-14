/**
 * Try again after a stop, and continue from two windows (round 4, 14 Nov
 * 2026). Scripted faux engines: no real provider calls or learning data.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, type FauxResponseStep } from "@earendil-works/pi-ai";
import type { PiEngine } from "../src/agent/models.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { signInTestClaude } from "./claude-fixture.ts";

assert.equal(process.env.NODE_ENV, "test", "Run with NODE_ENV=test; these tests must not invoke real providers.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-stopped-reply-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LH_CREDENTIALS_DIR = scratch;
await signInTestClaude();

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn, turnFailure } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { replyCutOf } = await import("../src/core/turn-cut.ts");

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function scripted(steps: FauxResponseStep[]) {
	const calls: string[][] = [];
	const faux = createFauxCore({});
	faux.setResponses(steps.map((step) => (context, options, state, model) => {
		calls.push(context.messages.map((m) => m.role).filter((role) => role !== "system"));
		return typeof step === "function" ? step(context, options, state, model) : step;
	}));
	const engine: PiEngine = { model: faux.getModel(), streamFn: faux.streamSimple };
	return { engine, calls };
}

async function turn(engine: PiEngine, chatId: string, input: unknown): Promise<{ status: number; body: string }> {
	const ack = await handleChatRequest(
		new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input }) }),
		(opts) => createTeacherAgent(undefined, { ...opts, engine }),
	);
	const handle = runningTurn(chatId);
	const body = handle ? await new Response(handle.subscribe()).text() : await ack.text();
	return { status: ack.status, body };
}

const stopped = (id: string): LhMessage => ({ ...fauxAssistantMessage([], { stopReason: "aborted" }), id } as LhMessage);
const texts = (chatId: string) => chatStore.getChat(chatId)!.messages
	.filter((m) => m.role === "assistant")
	.map((m) => (m as { content: { type: string; text?: string }[] }).content.filter((b) => b.type === "text").map((b) => b.text).join(""));

describe("Try again after a stop", () => {
	it("gets the tutor's reply to his message, and keeps the stop in the record", async () => {
		const { engine, calls } = scripted([() => fauxAssistantMessage([fauxText("Rank counts pivots, not rows.")])]);
		const chat = chatStore.createChat("Test: try again after a stop");
		chatStore.saveMessages(chat.id, [newUserMessage("The rank is 2, two nonzero rows"), stopped("a-stop")]);
		assert.equal(replyCutOf(chatStore.getChat(chat.id)!.messages), "stopped");

		const { status, body } = await turn(engine, chat.id, { type: "continue" });
		assert.equal(status, 200);
		assert.doesNotMatch(body, /"type":"error"/);
		assert.deepEqual(calls, [["user"]], "the tutor resumes from his message");
		assert.deepEqual(texts(chat.id), ["", "Rank counts pivots, not rows."]);
		assert.equal(replyCutOf(chatStore.getChat(chat.id)!.messages), null);
	});

	it("works after two stops in a row", async () => {
		const { engine, calls } = scripted([() => fauxAssistantMessage([fauxText("Here it is.")])]);
		const chat = chatStore.createChat("Test: two stops");
		chatStore.saveMessages(chat.id, [newUserMessage("Explain the kernel"), stopped("s1"), stopped("s2")]);
		assert.equal((await turn(engine, chat.id, { type: "continue" })).status, 200);
		assert.deepEqual(calls, [["user"]]);
		assert.deepEqual(texts(chat.id).at(-1), "Here it is.");
	});
});

describe("a continue whose reply already came", () => {
	it("runs no tutor turn, so a second window never answers his input twice", async () => {
		const { engine, calls } = scripted([() => fauxAssistantMessage([fauxText("First reply.")]), () => fauxAssistantMessage([fauxText("Second reply.")])]);
		const chat = chatStore.createChat("Test: two windows resume");
		chatStore.saveMessages(chat.id, [newUserMessage("What is a pivot?")]);
		assert.equal((await turn(engine, chat.id, { type: "continue" })).status, 200, "the first window resumes the lost reply");
		const late = await turn(engine, chat.id, { type: "continue" });
		assert.equal(late.status, 200);
		assert.match(late.body, /turn-settled/, "the second window is pointed at the record");
		assert.equal(calls.length, 1, "the tutor ran once");
		assert.deepEqual(texts(chat.id), ["First reply."]);
	});
});

describe("a turn that fails at once", () => {
	it("leaves its notice for the window that attaches after the ack", async () => {
		const { engine } = scripted([]);
		const chat = chatStore.createChat("Test: failure notice");
		chatStore.saveMessages(chat.id, [newUserMessage("hello")]);
		const ack = await handleChatRequest(
			new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chat.id, input: { type: "continue" } }) }),
			(opts) => {
				const agent = createTeacherAgent(undefined, { ...opts, engine });
				agent.continue = () => Promise.reject(new Error("boom"));
				return agent;
			},
		);
		assert.equal(ack.status, 200);
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(runningTurn(chat.id), undefined, "the turn already left the registry");
		assert.ok(turnFailure(chat.id), "but a late view still learns it failed");
	});
});
