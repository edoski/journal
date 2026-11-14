/**
 * A wake turn's markers land in the record at its write-ahead, after
 * turn-started: the write is announced as record-changed, so a view that
 * attached on turn-started shows them at once instead of re-reading the
 * record on a timed window.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-wake-markers-"));
const PYTHON = path.join(TMP, "python");
fs.writeFileSync(PYTHON, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.LH_LEARNING_ENGINE = TMP;
process.env.LH_LEARNING_PYTHON = PYTHON;

const { newUserMessage } = await import("../src/core/native-messages.ts");
const { buildModeHandoffSteer } = await import("../src/core/contracts/jobs.ts");
const { handleChatInput } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { createPracticeAgent } = await import("../src/agent/teacher-agent.ts");
const { subscribe } = await import("../src/core/events.ts");
const { signInTestClaude, TEST_MODEL } = await import("./claude-fixture.ts");
await signInTestClaude();

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

it("a wake turn announces its markers as soon as they are written", async () => {
	const chat = chatStore.createChat("practise rank", { workspace: "/study/linalg", title: "Linear Algebra" });
	chatStore.saveSettings(chat.id, { model: { ...TEST_MODEL } });
	const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	const handoff = { id: "h1", role: "assistant", content: [{ type: "toolCall", id: "call-h1", name: "practice", arguments: { scope: "rank", reason: "asked" } }], api: "faux", provider: "t", model: "t", usage, stopReason: "toolUse", timestamp: 1 };
	const result = { id: "r1", role: "toolResult", toolCallId: "call-h1", toolName: "practice", content: [{ type: "text", text: "ok" }], details: { ok: true, mode: "practice" }, isError: false, timestamp: 2 };
	chatStore.saveMessages(chat.id, [newUserMessage("give me problems on rank"), handoff as never, result as never]);
	const faux = createFauxCore({});
	faux.setResponses([fauxAssistantMessage([fauxText("Rank first.")])]);
	const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const factory = (opts: object) => createPracticeAgent({ chatId: chat.id, chatStore }, { ...opts, engine });
	const steer = buildModeHandoffSteer(chat.id, "call-h1", "practice");
	const seen: boolean[] = [];
	const stop = subscribe((e) => {
		if (e.type === "record-changed" && e.chatId === chat.id) seen.push(chatStore.getChat(chat.id)!.messages.some((m) => m.id === steer.id));
	});
	const ack = await handleChatInput(chat.id, { type: "steers", steers: [steer] }, factory as never);
	const handle = runningTurn(chat.id);
	if (handle) await new Response(handle.subscribe()).text();
	stop();
	assert.equal(ack.status, 200);
	assert.deepEqual(seen, [true], "one announcement, made once the marker is on disk");
});
