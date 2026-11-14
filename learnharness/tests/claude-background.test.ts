import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { claudeSubscriptionModel } from "../src/agent/claude-stream.ts";
import { toLlmMessages } from "../src/core/native-messages.ts";
import { buildSubagentSteer } from "../src/core/contracts.ts";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-claude-background-"));
process.env.LH_DATA_DIR = path.join(directory, "data");
const { stores } = await import("../src/server/stores.ts");
const { beginTurn, endTurn } = await import("../src/server/turn-liveness.ts");
const { automaticFollowUpAllowed, deliverJobResult, registerLiveAgent, setTurnRunner, settleSteers, unregisterLiveAgent } = await import("../src/server/jobs.ts");
const { persistTurn } = await import("../src/server/turn-service.ts");
after(() => fs.rmSync(directory, { recursive: true, force: true }));

const PROVIDER = "claude-subscription";
const usage = { input: 2, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
function finishedJob(chatId: string, call: string) {
	const job = stores.jobStore.createJob({ kind: "research", chatId, toolCallId: call });
	const result = { brief: "Fixture helper result", sources: [] };
	stores.jobStore.updateJob(job.id, { status: "done", result, delivery: { kind: "result", status: "pending" } });
	return { job, steer: buildSubagentSteer(job, result) };
}

test("a Claude lesson takes a finished helper's result into its live run", { timeout: 5000 }, async () => {
	const chat = stores.chatStore.createChat("Fixture live Claude lesson");
	const model = { ...claudeSubscriptionModel(PROVIDER)!, provider: PROVIDER };
	const { job, steer } = finishedJob(chat.id, "fixture-live-call");
	const contexts: string[] = [];
	const agent = new Agent({ initialState: { model, messages: [{ id: "fixture-initial", role: "user", content: "Initial learner input", timestamp: 1 } as AgentMessage] }, convertToLlm: toLlmMessages, streamFn: () => {
		contexts.push(JSON.stringify(agent.state.messages)); const stream = new AssistantMessageEventStream();
		const output = { role: "assistant" as const, provider: PROVIDER, api: model.api, model: model.id, content: [{ type: "text" as const, text: "Reply" }], stopReason: "stop" as const, timestamp: 2, usage };
		stream.push({ type: "start", partial: output }); stream.push({ type: "done", reason: "stop", message: output }); stream.end(); return stream;
	} });
	let wakes = 0;
	setTurnRunner(async () => { wakes++; return 200; });
	assert(beginTurn(chat.id)); registerLiveAgent(chat.id, agent);
	const delivered = deliverJobResult(steer);
	assert(automaticFollowUpAllowed(chat.id, agent), "Claude asks no background consent");
	await agent.continue();
	assert(contexts.some((context) => context.includes(steer.id)), "the result rides the live run");
	const persisted = persistTurn(stores.chatStore, chat.id, 0, agent.state.messages, false);
	unregisterLiveAgent(chat.id); endTurn(chat.id); settleSteers(chat.id, persisted);
	await delivered;
	assert.equal(wakes, 0, "delivered in the run, so nothing wakes the lesson again");
	assert.equal(stores.jobStore.getJob(job.id)!.status, "done");
});

test("a finished helper wakes an idle Claude lesson once", { timeout: 5000 }, async () => {
	const chat = stores.chatStore.createChat("Fixture idle Claude lesson");
	stores.chatStore.saveMessages(chat.id, [
		{ id: "fixture-user", role: "user", content: "Teach me", timestamp: 1 },
		{ id: "fixture-reply", role: "assistant", provider: PROVIDER, api: "anthropic-messages", model: "claude-opus-5-5", content: [{ type: "text", text: "Sure" }], stopReason: "stop", timestamp: 2, usage },
	] as never);
	assert(automaticFollowUpAllowed(chat.id), "the latest reply ran on Claude");
	const { steer } = finishedJob(chat.id, "fixture-idle-call");
	let wakes = 0;
	setTurnRunner(async (chatId, input) => {
		wakes++;
		if (input.type === "steers") stores.chatStore.saveMessages(chatId, [...stores.chatStore.getChat(chatId)!.messages, ...input.steers]);
		return 200;
	});
	await deliverJobResult(steer);
	assert.equal(wakes, 1);
});
