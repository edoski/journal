import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { claudeWorkDir } from "../src/agent/claude-cli.ts";
import { forgetSession, keepSession, restoreSession, type SessionStore } from "../src/agent/sdk/session-files.ts";

/** A temp Claude config dir and a temp chats folder for one lesson. */
function fixture() {
	const configDir = mkdtempSync(join(tmpdir(), "lh-claude-config-"));
	const store: SessionStore = { dir: join(mkdtempSync(join(tmpdir(), "lh-chats-")), "chats"), chatId: "chat_1" };
	const project = join(configDir, "projects", realpathSync(claudeWorkDir()).replace(/[^a-zA-Z0-9]/g, "-"));
	const live = (id: string) => join(project, `${id}.jsonl`);
	const liveSide = (id: string) => join(project, id);
	const kept = join(store.dir, "chat_1.session.jsonl");
	const keptSide = join(store.dir, "chat_1.session");
	const writeLive = (id: string, text: string, side?: string) => {
		mkdirSync(project, { recursive: true });
		writeFileSync(live(id), text);
		if (side !== undefined) { mkdirSync(liveSide(id), { recursive: true }); writeFileSync(join(liveSide(id), "agent.jsonl"), side); }
	};
	return { configDir, store, live, liveSide, kept, keptSide, writeLive };
}

describe("the app's copy of a lesson's session", () => {
	it("keepSession copies the live file and its side folder beside the record, replacing an older copy", () => {
		const f = fixture();
		f.writeLive("s1", "turn 1\n", "side 1");
		keepSession(f.store, f.configDir, "s1");
		assert.equal(readFileSync(f.kept, "utf8"), "turn 1\n");
		assert.equal(readFileSync(join(f.keptSide, "agent.jsonl"), "utf8"), "side 1");

		f.writeLive("s1", "turn 1\nturn 2\n");
		rmSync(f.liveSide("s1"), { recursive: true });
		keepSession(f.store, f.configDir, "s1");
		assert.equal(readFileSync(f.kept, "utf8"), "turn 1\nturn 2\n");
		assert.equal(existsSync(f.keptSide), false, "a side folder the session no longer has is dropped");
	});

	it("keepSession with no live file leaves the copy as it was", () => {
		const f = fixture();
		f.writeLive("s1", "turn 1\n");
		keepSession(f.store, f.configDir, "s1");
		keepSession(f.store, f.configDir, "gone");
		assert.equal(readFileSync(f.kept, "utf8"), "turn 1\n");
	});

	it("restoreSession: a live file is resumable as it is; a gone one comes back from the copy; with neither it fails", () => {
		const f = fixture();
		f.writeLive("s1", "live\n");
		assert.equal(restoreSession(undefined, f.configDir, "s1"), true, "the live file needs no copy");

		const g = fixture();
		assert.equal(restoreSession(g.store, g.configDir, "s1"), false, "no live file and no copy");
		assert.equal(restoreSession(undefined, g.configDir, "s1"), false);

		g.writeLive("s1", "kept\n", "side");
		keepSession(g.store, g.configDir, "s1");
		const other = fixture();
		assert.equal(restoreSession(g.store, other.configDir, "s1"), true, "another account's config dir gets the copy");
		assert.equal(readFileSync(other.live("s1"), "utf8"), "kept\n");
		assert.equal(readFileSync(join(other.liveSide("s1"), "agent.jsonl"), "utf8"), "side");
	});

	it("restoreSession never overwrites a live file with the copy", () => {
		const f = fixture();
		f.writeLive("s1", "old\n");
		keepSession(f.store, f.configDir, "s1");
		f.writeLive("s1", "newer\n");
		assert.equal(restoreSession(f.store, f.configDir, "s1"), true);
		assert.equal(readFileSync(f.live("s1"), "utf8"), "newer\n");
	});

	it("forgetSession deletes the copy and its side folder, and a missing copy is fine", () => {
		const f = fixture();
		f.writeLive("s1", "turn\n", "side");
		keepSession(f.store, f.configDir, "s1");
		forgetSession(f.store);
		assert.equal(existsSync(f.kept), false);
		assert.equal(existsSync(f.keptSide), false);
		assert.doesNotThrow(() => forgetSession(f.store));
		assert.equal(restoreSession(f.store, fixture().configDir, "s1"), false, "nothing left to restore");
	});
});

