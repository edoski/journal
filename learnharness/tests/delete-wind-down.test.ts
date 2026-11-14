/**
 * Deleting a session whose digest is running aborts the run and waits
 * for it to leave the registry: the deletion goes on the moment the run's
 * end is announced, never on a poll, and gives up after its limit.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it, mock } from "node:test";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-delete-wind-down-"));
process.env.LH_DATA_DIR = TMP;
const { chatStore } = await import("../src/store/chats.ts");
const { deleteChatSession } = await import("../src/server/chats.ts");
const { finishRun, setRunPhase } = await import("../src/agent/subagents/background-runs.ts");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const turns = () => new Promise((resolve) => setImmediate(resolve));

it("the deletion goes on as soon as the aborted run ends, with no clock running", async () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	try {
		const chat = chatStore.createChat("doomed");
		const run = setRunPhase(`${chat.id}#digest`, "digesting", "digest");
		let outcome: { ok: boolean } | undefined;
		void deleteChatSession(chat.id).then((o) => (outcome = o));
		for (let i = 0; i < 3; i++) await turns();
		assert.equal(outcome, undefined, "waiting while the run winds down");
		assert.ok(run.controller.signal.aborted, "the run was aborted");
		finishRun(`${chat.id}#digest`);
		for (let i = 0; i < 5 && !outcome; i++) await turns();
		assert.equal((outcome as { ok: boolean } | undefined)?.ok, true);
		assert.equal(chatStore.getChat(chat.id), null);
	} finally {
		mock.timers.reset();
	}
});

it("gives up after its limit while the run is still registered", async () => {
	mock.timers.enable({ apis: ["setTimeout"] });
	try {
		const chat = chatStore.createChat("stuck");
		setRunPhase(`${chat.id}#digest`, "digesting", "digest");
		const pending = deleteChatSession(chat.id);
		await turns();
		mock.timers.tick(10_000);
		const outcome = await pending;
		assert.equal(outcome.ok, false);
		assert.equal((outcome as { code?: string }).code, "digest_winding_down");
		finishRun(`${chat.id}#digest`);
	} finally {
		mock.timers.reset();
	}
});
