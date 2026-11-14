/**
 * SdkAgent, the lesson turn on the Agent SDK, driven through the fake SDK:
 * when a turn ends, where tool results and steers land in the record, and
 * how a lesson's Claude Code session is resumed, restored or refused.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Type } from "typebox";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type AssistantMessage, type FauxResponseStep, type Message } from "@earendil-works/pi-ai";
import { claudeWorkDir } from "../src/agent/claude-cli.ts";
import { CLAUDE_API_KEY_REFUSAL } from "../src/agent/claude-errors.ts";
import { SESSION_GONE, SdkAgent } from "../src/agent/sdk/agent.ts";
import type { SdkEngine } from "../src/agent/sdk/engine.ts";
import type { SessionStore } from "../src/agent/sdk/session-files.ts";
import { nextChatSession, QUESTION_POSED_TEXT, type ChatSession } from "../src/core/sdk-session.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { fakeSdk, type FakeSdk } from "./helpers/fake-sdk.ts";

/** A scripted model on a fresh fake SDK; `seen` holds each request's messages. */
function scripted(steps: FauxResponseStep[]): { fake: FakeSdk; seen: Message[][] } {
	const faux = createFauxCore({});
	faux.setResponses(steps);
	const seen: Message[][] = [];
	const fake = fakeSdk({ model: faux.models[0], streamFn: (model, context, options) => { seen.push([...context.messages]); return faux.streamSimple(model, context, options); } });
	return { fake, seen };
}

const posed: { count: number; onPose?: () => void } = { count: 0 };
const ask: AgentTool<any> = {
	name: "ask", label: "ask", description: "Pose a question to the learner.",
	parameters: Type.Object({ q: Type.String() }),
	execute: async () => { posed.count++; posed.onPose?.(); return { content: [{ type: "text", text: "Question posed." }], details: {} }; },
};
const lookup: AgentTool<any> = {
	name: "lookup", label: "lookup", description: "Look something up.",
	parameters: Type.Object({}),
	execute: async () => ({ content: [{ type: "text", text: "found" }], details: {} }),
};

let ids = 0;
const user = (text: string): LhMessage => ({ id: `u${++ids}`, role: "user", content: text, timestamp: Date.now() } as LhMessage);
/** The record as the turn runner persists it: every message has an id. */
const persisted = (messages: AgentMessage[]): LhMessage[] => messages.map((m) => ((m as { id?: string }).id ? m : { ...m, id: `m${++ids}` }) as LhMessage);

function agentOn(engine: SdkEngine, messages: LhMessage[], extra: { session?: ChatSession; sessionStore?: SessionStore } = {}): SdkAgent {
	return new SdkAgent({ engine, systemPrompt: "tutor", tools: [ask, lookup], messages: messages as AgentMessage[], endsTurn: (name) => name === "ask", ...extra });
}
const roles = (messages: AgentMessage[]) => messages.map((m) => (m as { role: string }).role);
const textOf = (m: AgentMessage) => typeof (m as { content: unknown }).content === "string" ? (m as { content: string }).content : JSON.stringify((m as { content: unknown }).content);
const liveFile = (fake: FakeSdk, id: string) => join(fake.configDir, "projects", realpathSync(claudeWorkDir()).replace(/[^a-zA-Z0-9]/g, "-"), `${id}.jsonl`);

describe("when a lesson turn ends", () => {
	it("a clean question ends the turn after its batch: one model request", async () => {
		const { fake, seen } = scripted([fauxAssistantMessage([fauxToolCall("ask", { q: "Why?" }, { id: "q1" })], { stopReason: "toolUse" }), fauxAssistantMessage("never asked for")]);
		const agent = agentOn(fake.engine, [user("teach me")]);
		await agent.continue();
		assert.equal(seen.length, 1, "no model request after the question");
		assert.deepEqual(roles(agent.state.messages), ["user", "assistant", "toolResult"]);
		assert.equal(agent.sessionEnd()?.held, "all");
	});

	it("with two turn-ending calls where one fails validation, the turn continues and the model retries", async () => {
		const { fake, seen } = scripted([
			fauxAssistantMessage([fauxToolCall("ask", { q: "A?" }, { id: "q1" }), fauxToolCall("ask", {}, { id: "q2" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("ask", { q: "B?" }, { id: "q3" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("never asked for"),
		]);
		const agent = agentOn(fake.engine, [user("teach me")]);
		await agent.continue();
		assert.equal(seen.length, 2, "the failed call is retried within the turn, then the clean retry ends it");
		const results = agent.state.messages.filter((m) => (m as { role: string }).role === "toolResult") as { toolCallId: string; isError: boolean }[];
		assert.deepEqual(results.map((r) => [r.toolCallId, r.isError]), [["q1", false], ["q2", true], ["q3", false]]);
	});

	it("tool results and tool events land after the reply that called them", async () => {
		const { fake } = scripted([fauxAssistantMessage([fauxText("Let me check."), fauxToolCall("lookup", {}, { id: "l1" })], { stopReason: "toolUse" }), fauxAssistantMessage("Done.")]);
		const agent = agentOn(fake.engine, [user("teach me")]);
		const events: string[] = [];
		agent.subscribe((event: AgentEvent) => {
			if (event.type === "message_end") events.push(`end:${(event.message as { role: string }).role}`);
			if (event.type === "tool_execution_start" || event.type === "tool_execution_end") events.push(event.type);
		});
		await agent.continue();
		assert.deepEqual(events, ["end:assistant", "tool_execution_start", "tool_execution_end", "end:toolResult", "end:assistant"]);
		assert.deepEqual(roles(agent.state.messages), ["user", "assistant", "toolResult", "assistant"]);
	});
});

describe("steering a running turn", () => {
	it("a steer pushed during a plain-text reply runs in the same run and joins the record after that reply", async () => {
		let agent!: SdkAgent;
		const steer = user("also cover collisions");
		const { fake, seen } = scripted([
			() => { agent.steer(steer as AgentMessage); return fauxAssistantMessage("Hash tables map keys."); },
			fauxAssistantMessage("Collisions chain."),
		]);
		agent = agentOn(fake.engine, [user("teach me")]);
		await agent.continue();
		assert.equal(fake.calls.length, 1, "one Claude Code run");
		assert.equal(seen.length, 2);
		assert.match(JSON.stringify(seen[1]), /also cover collisions/, "the model read the steer");
		assert.deepEqual(agent.state.messages.map(textOf).slice(1).map((t) => /Hash tables/.test(t) ? "reply1" : /also cover/.test(t) ? "steer" : /Collisions/.test(t) ? "reply2" : t), ["reply1", "steer", "reply2"]);
	});

	it("a steer pushed after a question pose is not delivered", async () => {
		let agent!: SdkAgent;
		const steer = user("late words");
		posed.onPose = () => agent.steer(steer as AgentMessage);
		try {
			const { fake, seen } = scripted([fauxAssistantMessage([fauxToolCall("ask", { q: "Why?" }, { id: "q1" })], { stopReason: "toolUse" }), fauxAssistantMessage("never asked for")]);
			agent = agentOn(fake.engine, [user("teach me")]);
			await agent.continue();
			assert.equal(seen.length, 1, "the question still ends the turn");
			assert.ok(!agent.state.messages.includes(steer as AgentMessage), "the steer waits for the learner's next turn");
			assert.ok(!agent.state.messages.some((m) => textOf(m).includes("late words")));
		} finally {
			posed.onPose = undefined;
		}
	});
});

describe("resuming a lesson's session", () => {
	/** One finished turn: the record and its session map. */
	async function firstTurn(fake: FakeSdk, sessionStore?: SessionStore) {
		const agent = agentOn(fake.engine, [user("teach me")], { sessionStore });
		await agent.continue();
		const record = persisted(agent.state.messages);
		const session = nextChatSession(undefined, agent.sessionEnd()!, record);
		return { record, session };
	}

	it("a session whose file is gone, with no app copy, is seeded from the record and the lesson continues", async () => {
		const { fake, seen } = scripted([fauxAssistantMessage("Hi."), fauxAssistantMessage("Where were we.")]);
		const { record, session } = await firstTurn(fake);
		rmSync(liveFile(fake, session.id));
		fake.forget(session.id);
		const agent = agentOn(fake.engine, [...record, user("next")], { session });
		await agent.continue();
		assert.equal((agent.state.messages.at(-1) as AssistantMessage).stopReason, "stop");
		const seeded = fake.calls[1]!.resume!;
		assert.notEqual(seeded, session.id, "a new session, seeded from the record");
		assert.deepEqual(seen[1]!.filter((m) => m.role !== "system").map((m) => m.role), ["user", "assistant", "user"]);
		assert.match(JSON.stringify(seen[1]), /teach me.*Hi\..*next/s, "the model kept the first turn");
		assert.equal(nextChatSession(session, agent.sessionEnd()!, persisted(agent.state.messages)).id, seeded, "the record maps to the seeded session");
	});

	it("with the app's copy, a gone session file is restored and the lesson resumes", async () => {
		const store: SessionStore = { dir: mkdtempSync(join(tmpdir(), "lh-session-store-")), chatId: "chat_restore" };
		const { fake, seen } = scripted([fauxAssistantMessage("Hi."), fauxAssistantMessage("Welcome back.")]);
		const { record, session } = await firstTurn(fake, store);
		assert.ok(existsSync(join(store.dir, "chat_restore.session.jsonl")), "the turn kept a copy");
		rmSync(liveFile(fake, session.id));
		const agent = agentOn(fake.engine, [...record, user("next")], { session, sessionStore: store });
		await agent.continue();
		assert.equal(fake.calls[1]!.resume, session.id);
		assert.ok(existsSync(liveFile(fake, session.id)), "the session file is back");
		assert.equal((agent.state.messages.at(-1) as AssistantMessage).stopReason, "stop");
		assert.match(JSON.stringify(seen[1]), /teach me/, "the model kept the first turn");
	});

	it("a cut session resumes at its anchor, dropping the failed turn's partial entries", async () => {
		const { fake, seen } = scripted([
			fauxAssistantMessage("Hi."),
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "overloaded" }),
			fauxAssistantMessage("Picking up."),
		]);
		const { record, session } = await firstTurn(fake);
		const second = agentOn(fake.engine, [...record, user("go on")], { session });
		await second.continue();
		const afterCut = persisted(second.state.messages);
		const cut = nextChatSession(session, second.sessionEnd()!, afterCut);
		assert.equal(cut.cut, true);
		assert.equal(cut.anchor, session.anchor, "the anchor stays at the last finished turn");

		const third = agentOn(fake.engine, [...afterCut, user("retry")], { session: cut });
		await third.continue();
		assert.equal(fake.calls[2]!.resume, session.id);
		assert.equal(fake.calls[2]!.resumeSessionAt, session.anchor);
		const context = seen[2]!.filter((m) => m.role !== "system");
		assert.deepEqual(context.map((m) => m.role), ["user", "assistant", "user"], "the failed turn's entries are gone");
		assert.match(JSON.stringify(context[2]), /go on.*retry/s, "its input is owed again with the new words");
	});
});

describe("continuing a lesson from before sessions", () => {
	const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	const reply = (id: string, content: AssistantMessage["content"]): LhMessage => ({ id, role: "assistant", api: "anthropic-messages", provider: "claude-subscription", model: "claude-opus-5-5", content, stopReason: content.some((b) => b.type === "toolCall") ? "toolUse" : "stop", usage, timestamp: 1 } as LhMessage);
	const resultOf = (id: string, toolCallId: string, toolName: string, text: string): LhMessage => ({ id, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text }], isError: false, timestamp: 1 } as LhMessage);
	/** A record the app wrote before sessions: a question card answered, a
	 *  tool call, a reply, then his next message. No `session`. */
	const oldRecord = (): LhMessage[] => [
		user("teach me hashing"),
		reply("a1", [{ type: "text", text: "Hash tables map keys to slots." }, { type: "toolCall", id: "toolu_q1", name: "ask_user_question", arguments: { question: "Why hash a key?" } }]),
		resultOf("r1", "toolu_q1", "ask_user_question", "To find it fast"),
		reply("a2", [{ type: "toolCall", id: "toolu_l1", name: "lookup", arguments: {} }]),
		resultOf("r2", "toolu_l1", "lookup", "found"),
		reply("a3", [{ type: "text", text: "Right: constant time on average." }]),
		user("go on"),
	];
	const store = (chatId: string): SessionStore => ({ dir: mkdtempSync(join(tmpdir(), "lh-session-store-")), chatId });

	it("an old-format lesson record continues on a session seeded from it, kept as the app's copy", async () => {
		const { fake } = scripted([fauxAssistantMessage("Collisions next.")]);
		const sessionStore = store("chat_old");
		const agent = agentOn(fake.engine, oldRecord(), { sessionStore });
		await agent.continue();
		const last = agent.state.messages.at(-1) as AssistantMessage;
		assert.equal(last.stopReason, "stop");
		assert.equal(fake.calls.length, 1);
		const seeded = fake.calls[0]!.resume;
		assert.ok(seeded, "the turn resumes a seeded session instead of failing");
		assert.ok(existsSync(join(sessionStore.dir, "chat_old.session.jsonl")), "the seed is kept beside the record");
		const saved = persisted(agent.state.messages);
		const map = nextChatSession(undefined, agent.sessionEnd()!, saved);
		assert.deepEqual([map.id, map.synced, map.cut], [seeded, saved.at(-1)!.id, undefined], "the record maps to the seeded session, through the new reply");
	});

	it("its first SDK turn sees the earlier exchange as turns, and the next turn resumes it without seeding again", async () => {
		const { fake, seen } = scripted([fauxAssistantMessage("Collisions next."), fauxAssistantMessage("Chaining.")]);
		const record = oldRecord();
		const first = agentOn(fake.engine, record);
		await first.continue();
		const context = seen[0]!.filter((m) => m.role !== "system");
		assert.deepEqual(context.map((m) => m.role), ["user", "assistant", "toolResult", "user", "assistant", "toolResult", "assistant", "user"]);
		const text = (i: number) => JSON.stringify(context[i]);
		assert.match(text(0), /teach me hashing/);
		assert.match(text(1), /Hash tables map keys.*ask_user_question.*Why hash a key/s, "his question card, as the tutor's own call");
		assert.match(text(2), new RegExp(QUESTION_POSED_TEXT.slice(0, 20)), "the call returned what the tool server returns");
		assert.match(text(3), /<answer tool=\\"ask_user_question\\" call=\\"toolu_q1\\">\\nTo find it fast/, "his answer, tagged with the call");
		assert.match(text(5), /found/, "the tool result the record kept");
		assert.match(text(6), /constant time on average/);
		assert.match(text(7), /go on/, "the prompt is his new message, as on any resumed lesson");

		const persistedFirst = persisted(first.state.messages);
		const session = nextChatSession(undefined, first.sessionEnd()!, persistedFirst);
		const second = agentOn(fake.engine, [...persistedFirst, user("and then?")], { session });
		await second.continue();
		assert.equal(fake.calls[1]!.resume, session.id, "the seeded session is resumed like any other");
		assert.equal(second.sessionEnd()!.seeded, undefined, "seeded once");
		assert.match(JSON.stringify(seen[1]), /teach me hashing.*Collisions next\..*and then\?/s);
	});

	it("a seeded first turn that fails resumes the seed at its last entry on retry, without seeding again", async () => {
		const { fake, seen } = scripted([fauxAssistantMessage("", { stopReason: "error", errorMessage: "overloaded" }), fauxAssistantMessage("Back.")]);
		const first = agentOn(fake.engine, oldRecord());
		await first.continue();
		const afterFail = persisted(first.state.messages);
		const cut = nextChatSession(undefined, first.sessionEnd()!, afterFail);
		assert.equal(cut.id, fake.calls[0]!.resume);
		assert.equal(cut.cut, true);
		assert.ok(cut.anchor, "the seed's last entry");
		const retry = agentOn(fake.engine, [...afterFail, user("retry")], { session: cut });
		await retry.continue();
		assert.equal(fake.calls[1]!.resume, cut.id);
		assert.equal(fake.calls[1]!.resumeSessionAt, cut.anchor);
		assert.equal(retry.sessionEnd()!.seeded, undefined);
		assert.match(JSON.stringify(seen[1]!.at(-1)), /go on.*retry/s, "the failed turn's input is owed again");
	});

	it("a failed seed falls back to SESSION_GONE, says why, and never starts Claude Code", async (t) => {
		const { fake } = scripted([fauxAssistantMessage("never asked for")]);
		const blocker = join(mkdtempSync(join(tmpdir(), "lh-blocked-")), "file");
		writeFileSync(blocker, "");
		const engine: SdkEngine = { ...fake.engine, launch: () => ({ options: {}, configDir: join(blocker, "config") }) };
		const logged = t.mock.method(console, "error", () => undefined);
		const agent = agentOn(engine, oldRecord());
		await agent.continue();
		const last = agent.state.messages.at(-1) as AssistantMessage;
		assert.equal(last.errorMessage, SESSION_GONE);
		assert.equal(fake.calls.length, 0);
		assert.match(String(logged.mock.calls[0]?.arguments[0]), /could not seed a session for the lesson \(no session of its own holds its replies/);
	});

	it("a lesson made on the SDK is unchanged: it resumes its own session and nothing is seeded", async () => {
		const { fake } = scripted([fauxAssistantMessage("Hi."), fauxAssistantMessage("Again.")]);
		const sessionStore = store("chat_sdk");
		const first = agentOn(fake.engine, [user("teach me")], { sessionStore });
		await first.continue();
		const record = persisted(first.state.messages);
		const session = nextChatSession(undefined, first.sessionEnd()!, record);
		assert.equal(first.sessionEnd()!.seeded, undefined);
		const kept = readFileSync(join(sessionStore.dir, "chat_sdk.session.jsonl"), "utf8");
		assert.doesNotMatch(kept, /msg_seed_/, "the app's copy is Claude Code's own file");
		const second = agentOn(fake.engine, [...record, user("next")], { session, sessionStore });
		await second.continue();
		assert.equal(fake.calls[1]!.resume, session.id);
		assert.equal(second.sessionEnd()!.seeded, undefined);
		const project = join(fake.configDir, "projects", realpathSync(claudeWorkDir()).replace(/[^a-zA-Z0-9]/g, "-"));
		assert.deepEqual(readdirSync(project), [`${session.id}.jsonl`], "one session, no seed");
	});
});

describe("refusing to bill an API key", () => {
	it("an init that reports an API key source fails with CLAUDE_API_KEY_REFUSAL", async () => {
		const { fake } = scripted([]);
		const engine: SdkEngine = {
			...fake.engine,
			query: () => {
				const iterator = (async function* () {
					yield { type: "system", subtype: "init", session_id: "s1", apiKeySource: "ANTHROPIC_API_KEY", mcp_servers: [{ name: "lh", status: "connected" }], uuid: "i1" } as unknown as SDKMessage;
					yield { type: "stream_event", event: { type: "message_start", message: { id: "m", usage: {} } }, parent_tool_use_id: null } as unknown as SDKMessage;
				})();
				return { [Symbol.asyncIterator]: () => iterator, interrupt: async () => undefined, close: () => void iterator.return(undefined) };
			},
		};
		const agent = agentOn(engine, [user("teach me")]);
		await agent.continue();
		const replies = agent.state.messages.filter((m) => (m as { role: string }).role === "assistant") as AssistantMessage[];
		assert.equal(replies.length, 1, "nothing Claude Code streamed reached the record");
		assert.equal(replies[0]!.stopReason, "error");
		assert.equal(replies[0]!.errorMessage, CLAUDE_API_KEY_REFUSAL);
	});
});
