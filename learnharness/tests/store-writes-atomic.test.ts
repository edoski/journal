/**
 * Store rename failures (#403). For each store, the save is made to fail at the rename:
 * the save must throw and the file on disk must be exactly what it was,
 * with no temp file left. Stores that write in place would never reach
 * the rename, so their saves would succeed and this test would fail. Runs
 * under its own isolated LH_DATA_DIR (set before any config-loading import).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it, type TestContext } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-store-writes-atomic-"));
process.env.LH_DATA_DIR = TMP_DATA;

const config = await import("../config.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { writeSettings } = await import("../src/store/settings.ts");

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const snapshot = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null);

/** Seed `file` with one good save, then make the next save's rename fail. */
function assertAllOrNothing(t: TestContext, file: string, seed: () => void, save: () => void): void {
	seed();
	const before = snapshot(file);
	t.mock.method(fs, "renameSync", () => { throw Object.assign(new Error("fixture I/O failure"), { code: "EIO" }); });
	assert.throws(save, { code: "EIO" });
	t.mock.restoreAll();
	assert.equal(snapshot(file), before, "the old file is untouched");
	assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((f) => f.includes(".tmp-")), [], "no temp file left");
}

describe("failed saves leave the old file whole", () => {
	it("chat", (t) => {
		const { id } = chatStore.createChat("atomic");
		assertAllOrNothing(t, path.join(config.PATHS.chats, `${id}.json`),
			() => chatStore.saveMessages(id, [{ role: "user", content: "old", timestamp: 1 }] as never),
			() => chatStore.saveMessages(id, [{ role: "user", content: "new", timestamp: 2 }] as never));
	});

	it("job", (t) => {
		assertAllOrNothing(t, path.join(config.PATHS.data, "jobs", "unborn.json"), () => {},
			() => jobStore.createJob({ kind: "research", chatId: "chat_atomic", toolCallId: "tc_unborn" }));
		const job = jobStore.createJob({ kind: "research", chatId: "chat_atomic", toolCallId: "tc_atomic" });
		assertAllOrNothing(t, path.join(config.PATHS.data, "jobs", `${job.id}.json`), () => {}, () => jobStore.updateJob(job.id, { status: "done" }));
	});

	it("settings", (t) => {
		assertAllOrNothing(t, config.SETTINGS_FILE,
			() => writeSettings({ version: 1, appearance: { mode: "light" } }),
			() => writeSettings({ version: 1, appearance: { mode: "dark" } }));
	});
});
