/**
 * SdkAgent, the lesson turn on the Agent SDK, driven through the fake SDK:
 * when a turn ends, where tool results and steers land in the record, and
 * how a lesson's Claude Code session is resumed, restored or refused.
 */
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, existsSync } from "node:fs";
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
import { nextChatSession, type ChatSession } from "../src/core/sdk-session.ts";
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

	it("a session whose file is gone, with no app copy, fails with SESSION_GONE without starting Claude Code", async () => {
		const { fake } = scripted([fauxAssistantMessage("Hi."), fauxAssistantMessage("never asked for")]);
		const { record, session } = await firstTurn(fake);
		rmSync(liveFile(fake, session.id));
		fake.forget(session.id);
		const agent = agentOn(fake.engine, [...record, user("next")], { session });
		await agent.continue();
		const last = agent.state.messages.at(-1) as AssistantMessage;
		assert.equal(last.stopReason, "error");
		assert.equal(last.errorMessage, SESSION_GONE);
		assert.equal(fake.calls.length, 1, "no second Claude Code run");
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
