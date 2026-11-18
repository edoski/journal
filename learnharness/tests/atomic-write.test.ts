/**
 * Crash-safe store writes (#403): src/store/atomic-write.ts. Each save must
 * leave the old bytes or the complete new bytes.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { after, describe, it } from "node:test";
import { removeLeftoverTemps, writeFileAtomicSync } from "../src/store/atomic-write.ts";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lh-atomic-write-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));

function target(name: string, text?: string, folder = "case-"): string {
	const dir = fs.mkdtempSync(path.join(root, folder));
	const file = path.join(dir, name);
	if (text !== undefined) fs.writeFileSync(file, text);
	return file;
}
const temps = (file: string) => fs.readdirSync(path.dirname(file)).filter((f) => f.includes(".tmp-"));
const fail = (code: string) => Object.assign(new Error(code), { code });

describe("writeFileAtomicSync", () => {
	it("replaces the file with exactly the given text and leaves no temp file", () => {
		const file = target("record.json", "old");
		writeFileAtomicSync(file, '{\n\t"é": "\u{1F600}"\n}');
		assert.equal(fs.readFileSync(file, "utf-8"), '{\n\t"é": "\u{1F600}"\n}');
		assert.deepEqual(temps(file), []);
	});

	it("creates files that did not exist", () => {
		const file = target("new.json");
		writeFileAtomicSync(file, "{}");
		assert.equal(fs.readFileSync(file, "utf-8"), "{}");
	});

	it("failed saves in folders with non-ASCII characters leave no temp file", (t) => {
		const file = target("record.json", "old", "José-日本-");
		t.mock.method(fs, "renameSync", () => { throw fail("EIO"); });
		assert.throws(() => writeFileAtomicSync(file, "new"), { code: "EIO" });
		assert.equal(fs.readFileSync(file, "utf-8"), "old");
		assert.deepEqual(temps(file), []);
	});

	it("failed renames throw their own error and keep the old file whole", (t) => {
		const file = target("record.json", "old");
		const rename = t.mock.method(fs, "renameSync", () => { throw fail("EIO"); });
		assert.throws(() => writeFileAtomicSync(file, "new"), { code: "EIO" });
		assert.equal(rename.mock.callCount(), 1, "renames are never retried");
		assert.equal(fs.readFileSync(file, "utf-8"), "old");
		assert.deepEqual(temps(file), []);
	});

	it("crashes right before the rename keep the chat (the #403 repro)", () => {
		const env = { ...process.env, NODE_ENV: "test" as const, LH_DATA_DIR: fs.mkdtempSync(path.join(root, "data-")) };
		const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "tests/helpers/chat-save-crash.ts", ...args], { env, encoding: "utf8", timeout: 30000 });
		const id = run("create").stdout.trim();
		assert.equal(run("crash", id).status, 77);
		const seen = JSON.parse(run("read", id).stdout);
		assert.equal(seen.chat?.messages[0].content, "first", "the old record still reads");
		assert.deepEqual(seen.listed, [id], "the sidebar still lists it and skips the leftover");
		assert.equal(seen.files.filter((f: string) => f.includes(".tmp-")).length, 1, "the crash left its temp file");
	});

	it("folders in the way fail at once", () => {
		const file = target("record.json");
		fs.mkdirSync(file);
		const started = Date.now();
		assert.throws(() => writeFileAtomicSync(file, "new"));
		assert.ok(Date.now() - started < 50, "no waiting on folders");
		assert.deepEqual(temps(file), []);
	});

	it("rename replaces a symlink without changing its referent", (t) => {
		const real = target("real.json", "old");
		const link = path.join(path.dirname(real), "link.json");
		try {
			fs.symlinkSync(real, link);
		} catch {
			t.skip("symlinks need extra rights on this machine");
			return;
		}
		writeFileAtomicSync(link, "new", { mode: 0o600 });
		assert.ok(fs.lstatSync(link).isFile());
		assert.equal(fs.readFileSync(link, "utf-8"), "new");
		assert.equal(fs.readFileSync(real, "utf-8"), "old");
		assert.equal(fs.statSync(link).mode & 0o777, 0o600);
	});

	it("mode applies to the new file", () => {
		const file = target("secret.json", "old");
		writeFileAtomicSync(file, "new", { mode: 0o600 });
		assert.equal(fs.statSync(file).mode & 0o777, 0o600);
	});
});

describe("removeLeftoverTemps", () => {
	it("removes only that file's crash leftovers", () => {
		const file = target("chat_a.json", "{}");
		const dir = path.dirname(file);
		for (const name of ["chat_a.json.tmp-1", "chat_a.json.tmp-2", "chat_ab.json.tmp-3", "chat_b.json"]) fs.writeFileSync(path.join(dir, name), "x");
		removeLeftoverTemps(file);
		assert.deepEqual(fs.readdirSync(dir).sort(), ["chat_a.json", "chat_ab.json.tmp-3", "chat_b.json"]);
	});

	it("works in folders with non-ASCII characters", () => {
		const file = target("chat_a.json", "{}", "José-日本-");
		fs.writeFileSync(`${file}.tmp-1`, "x");
		removeLeftoverTemps(file);
		assert.deepEqual(temps(file), []);
	});

	it("does nothing when the folder is gone", () => {
		removeLeftoverTemps(path.join(root, "missing", "x.json"));
	});
});
