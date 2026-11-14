import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { piModels } from "../src/agent/models.ts";
import { toLlmMessages } from "../src/core/native-messages.ts";
import { buildSubagentSteer } from "../src/core/contracts.ts";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-subscription-background-"));
process.env.LH_DATA_DIR = path.join(directory, "data"); process.env.LH_CREDENTIALS_DIR = directory;
const { stores } = await import("../src/server/stores.ts");
const { beginTurn, endTurn } = await import("../src/server/turn-liveness.ts");
const { deliverJobResult, registerLiveAgent, unregisterLiveAgent, setTurnRunner, settleSteers, steerLiveChat, automaticFollowUpAllowed } = await import("../src/server/jobs.ts");
const { persistTurn } = await import("../src/server/turn-service.ts");
const originalSend = Object.getOwnPropertyDescriptor(process, "send"), originalConnected = Object.getOwnPropertyDescriptor(process, "connected");
const marker = process.env.LH_DESKTOP_SERVER, secret = process.env.LH_DESKTOP_API_SECRET;
let revision = 0;
function connection(background: boolean) {
	revision++;
	(process.emit as (event: string, value: unknown) => boolean)("message", {
		channel: "lh:chatgpt", kind: "state", stamp: { epoch: 1, authorityRevision: 1, revision },
		status: { available: true, pending: false, allowBackgroundUse: background, activeId: "fixture-account", accounts: [{ id: "fixture-account", email: "fixture@example.invalid", registration: "fixture", connected: true, planEnabled: true }], error: null },
		...(background ? {} : { invalidate: "background" }),
	});
}
before(() => {
	process.env.LH_DESKTOP_SERVER = "1"; process.env.LH_DESKTOP_API_SECRET = "d".repeat(64);
	Object.defineProperty(process, "connected", { configurable: true, value: true });
	Object.defineProperty(process, "send", { configurable: true, value: (_message: unknown, callback?: (error: Error) => void) => { callback?.(new Error("unexpected fixture request")); return false; } });
});
after(() => {
	fs.rmSync(directory, { recursive: true, force: true });
	if (originalSend) Object.defineProperty(process, "send", originalSend); else delete process.send;
	if (originalConnected) Object.defineProperty(process, "connected", originalConnected); else delete (process as { connected?: boolean }).connected;
	if (marker === undefined) delete process.env.LH_DESKTOP_SERVER; else process.env.LH_DESKTOP_SERVER = marker;
	if (secret === undefined) delete process.env.LH_DESKTOP_API_SECRET; else process.env.LH_DESKTOP_API_SECRET = secret;
});
for (const revokeAfterQueue of [false, true]) test(`chatgpt: foreground survives and automatic queue retains ownership with background ${revokeAfterQueue ? "revoked" : "off"}`, { timeout: 5000 }, async () => {
	connection(revokeAfterQueue);
	const chat = stores.chatStore.createChat("Fixture mixed queue"); const model = { ...piModels().getModels("openai").find((m) => m.api === "openai-responses")!, provider: "chatgpt" };
	const job = stores.jobStore.createJob({ kind: "research", chatId: chat.id, toolCallId: "fixture-job-call" }); const result = { brief: "Fixture helper result", sources: [] };
	stores.jobStore.updateJob(job.id, { status: "done", result, delivery: { kind: "result", status: "pending" } }); const steer = buildSubagentSteer(job, result); const contexts: string[] = [];
	const agent = new Agent({ initialState: { model, messages: [{ id: "fixture-initial", role: "user", content: "Initial learner input", timestamp: 1 } as AgentMessage] }, convertToLlm: toLlmMessages, streamFn: () => {
		contexts.push(JSON.stringify(agent.state.messages)); const stream = new AssistantMessageEventStream();
		const output = { role: "assistant" as const, provider: "chatgpt", api: model.api, model: model.id, content: [{ type: "text" as const, text: "Foreground response" }], stopReason: "stop" as const, timestamp: 2, usage: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
		stream.push({ type: "start", partial: output }); stream.push({ type: "done", reason: "stop", message: output }); stream.end(); return stream;
	} });
	let wakes = 0;
	setTurnRunner(async (chatId, input) => { wakes++; if (input.type === "steers") stores.chatStore.saveMessages(chatId, [...stores.chatStore.getChat(chatId)!.messages, ...input.steers]); return 200; });
	assert(beginTurn(chat.id)); registerLiveAgent(chat.id, agent); const delivered = deliverJobResult(steer);
	assert(steerLiveChat(chat.id, { id: "fixture-live-learner", role: "user", content: "Continue my learning", timestamp: 3 } as never));
	if (revokeAfterQueue) connection(false);
	assert(!automaticFollowUpAllowed(chat.id, agent)); await agent.continue();
	assert.equal(contexts.length, 1); assert(contexts[0]!.includes("Continue my learning")); assert(!contexts[0]!.includes(steer.id));
	const persisted = persistTurn(stores.chatStore, chat.id, 0, agent.state.messages, false);
	unregisterLiveAgent(chat.id); endTurn(chat.id); settleSteers(chat.id, persisted); await new Promise((resolve) => setImmediate(resolve));
	assert.equal(wakes, 0); assert.equal(stores.jobStore.getJob(job.id)!.status, "done"); assert.equal(stores.jobStore.getJob(job.id)!.delivery?.status, "pending");
	connection(true); await delivered; assert.equal(wakes, 1); assert.equal(stores.jobStore.getJob(job.id)!.status, "done");
});
