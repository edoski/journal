import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import { chatStore } from "../src/store/chats.ts";
import { PATHS } from "../config.ts";
import type { CallUsage, TurnUsage } from "../src/core/contracts.ts";

const call = (over: Partial<CallUsage> = {}): CallUsage => ({
	inputTokens: 0, outputTokens: 0, cacheReadTokens: undefined,
	cacheWriteTokens: undefined, reasoningTokens: undefined, ...over,
});

test("appendTurnUsage: idempotent per turn; continuations survive saveMessages; list omits log", () => {
	const record = chatStore.createChat("usage fixture");
	try {
		const entry: TurnUsage = { id: "turn_1", messageId: "msg_a", at: "x", model: "openai:gpt-5", steps: [call({ inputTokens: 100, outputTokens: 10, cacheWrite1hTokens: 0 })] };
		chatStore.appendTurnUsage(record.id, entry);
		chatStore.appendTurnUsage(record.id, entry);
		chatStore.appendTurnUsage(record.id, { ...entry, id: "turn_2" });
		assert.equal(chatStore.getChat(record.id)?.turns?.length, 2);
		chatStore.saveMessages(record.id, [{ id: "msg_a", role: "user", content: "fixture", timestamp: 1 }]);
		assert.deepEqual(chatStore.getChat(record.id)?.turns?.[0]?.steps, JSON.parse(JSON.stringify(entry.steps)));
		assert.equal(chatStore.getChat(record.id)?.turns?.length, 2);
		assert.equal("turns" in chatStore.listChats().find((c) => c.id === record.id)!, false);
	} finally { fs.unlinkSync(`${PATHS.chats}/${record.id}.json`); }
});

test("an older record's graph extraction usage log stays out of the list", () => {
	const record = chatStore.createChat("legacy extraction usage fixture");
	try {
		const file = `${PATHS.chats}/${record.id}.json`;
		const raw = JSON.parse(fs.readFileSync(file, "utf8"));
		fs.writeFileSync(file, JSON.stringify({ ...raw, extractions: [{ startedAt: 1, at: "2026-09-09T00:00:00Z", durationMs: 1, stages: {} }] }));
		assert.equal("extractions" in chatStore.listChats().find((c) => c.id === record.id)!, false);
	} finally { fs.unlinkSync(`${PATHS.chats}/${record.id}.json`); }
});
