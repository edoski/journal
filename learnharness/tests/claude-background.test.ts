import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createFauxCore, fauxAssistantMessage, fauxText, type TranscriptContext } from "@earendil-works/pi-ai";
import { buildSubagentSteer } from "../src/core/contracts.ts";
import { SdkAgent } from "../src/agent/sdk/agent.ts";
import { fakeEngine } from "./helpers/fake-sdk.ts";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-claude-background-"));
process.env.LH_DATA_DIR = path.join(directory, "data");
const { stores } = await import("../src/server/stores.ts");
const { beginTurn, endTurn } = await import("../src/server/turn-liveness.ts");
const { automaticFollowUpAllowed, deliverJobResult, registerLiveAgent, setTurnRunner, settleSteers, unregisterLiveAgent } = await import("../src/server/jobs.ts");
const { persistTurn } = await import("../src/server/turn-service.ts");
after(() => fs.rmSync(directory, { recursive: true, force: true }));

const PROVIDER = "claude-subscription";
const usage = { input: 2, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
function runningJob(chatId: string, call: string) {
	const job = stores.jobStore.createJob({ kind: "research", chatId, toolCallId: call });
	const result = { brief: "Fixture helper result", sources: [] };
	const steer = buildSubagentSteer(job, result);
	const saveResult = () => stores.jobStore.updateJob(job.id, { status: "done", result, delivery: { kind: "result", status: "pending" } });
	/** The helper finishes: its result is saved as owed, then delivered. */
	const finish = () => { saveResult(); return deliverJobResult(steer); };
	return { job, steer, saveResult, finish };
}

function finishedJob(chatId: string, call: string) {
	const { job, steer, saveResult } = runningJob(chatId, call);
	saveResult();
	return { job, steer };
}

test("a Claude lesson takes a finished helper's result into its live run", { timeout: 5000 }, async () => {
	const chat = stores.chatStore.createChat("Fixture live Claude lesson");
	const { job, steer, finish } = runningJob(chat.id, "fixture-live-call");
	const contexts: string[] = [];
	let delivered: Promise<void> | undefined;
	const faux = createFauxCore({});
	faux.setResponses([
		(context: TranscriptContext) => {
			contexts.push(JSON.stringify(context.messages));
			// The helper finishes while the lesson's model is replying.
			delivered = finish();
			return fauxAssistantMessage([fauxText("Reply")]);
		},
		(context: TranscriptContext) => {
			contexts.push(JSON.stringify(context.messages));
			return fauxAssistantMessage([fauxText("Taking the helper's result in.")]);
		},
	]);
	const engine = fakeEngine({ model: { ...faux.getModel(), provider: PROVIDER }, streamFn: faux.streamSimple });
	const agent = new SdkAgent({ engine, systemPrompt: "Teach.", tools: [], endsTurn: () => false, messages: [{ id: "fixture-initial", role: "user", content: "Initial learner input", timestamp: 1 } as AgentMessage] });
	let wakes = 0;
	setTurnRunner(async () => { wakes++; return 200; });
	assert(beginTurn(chat.id)); registerLiveAgent(chat.id, agent);
	assert(automaticFollowUpAllowed(chat.id, agent), "Claude asks no background consent");
	await agent.continue();
	assert.equal(contexts.length, 2, "the steered result makes the run's next model call");
	assert(!contexts[0]!.includes("Fixture helper result"), "the result arrived after the run's first call");
	assert(contexts[1]!.includes("Fixture helper result"), "the result rides the live run");
	assert(agent.state.messages.some((message) => (message as { id?: string }).id === steer.id), "the run's record holds the result once Claude Code read it");
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
