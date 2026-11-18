import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-chat-route-usage-"));
process.env.LH_DATA_DIR = scratch;
const { chatStore } = await import("../src/store/chats.ts");
const { GET } = await import("../app/api/chats/[id]/route.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test("chat GET serves the record and its token log as stored, with no price nobody shows", async () => {
	const record = chatStore.createChat("usage fixture");
	chatStore.saveMessages(record.id, [{ id: "fixture-input", role: "user", content: "synthetic", timestamp: 1 }]);
	const step = { inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 70_000, cacheWriteTokens: 0, cacheWrite1hTokens: 0, reasoningTokens: 500 };
	chatStore.appendTurnUsage(record.id, { id: "plan", model: "claude-subscription:fixture", messageId: "fixture-input", at: "fixture", steps: [step] });
	const file = path.join(scratch, "chats", `${record.id}.json`);
	const before = fs.readFileSync(file, "utf8");
	const response = await GET(new Request(`http://localhost/api/chats/${record.id}`), { params: Promise.resolve({ id: record.id }) });
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.deepEqual(body.messages, chatStore.getChat(record.id)!.messages);
	assert.deepEqual(body.turns, chatStore.getChat(record.id)!.turns, "the token log is served as stored");
	assert.equal("pricing" in body, false, "no price is derived for the page");
	assert.equal(fs.readFileSync(file, "utf8"), before, "a read never rewrites the record");
});
