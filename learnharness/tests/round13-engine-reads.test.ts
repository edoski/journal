/**
 * Round 13 N2 (speed, root cause 3): every page, window and turn read the
 * engine on its own, a child process replaying every course each time, so
 * one save set off a dozen identical `plan --all` reads and four `/api/study`
 * reads at once, each 10 to 34 s on a loaded Mac, and the tutor's own saves
 * and the next turn's brief waited behind them. One read of one state of the
 * records now runs the engine once, for every reader of it.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createCourseRecords } from "../src/store/course-records.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-engine-reads-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** A call's verb and operands, past `--workspace DIR`. */
const argsOf = (args: string[]) => (args[0] === "--workspace" ? args.slice(2) : args).join(" ");

/** A fake engine over one registered course on disk, as the real engine
 *  keeps it: the registry in the support folder, the record in `.study`. */
function world() {
	const dir = fs.mkdtempSync(path.join(TMP, "world-"));
	const home = path.join(dir, "home");
	const support = path.join(home, "Library", "Application Support", "Learning");
	const workspace = path.join(dir, "courses", "algebra");
	fs.mkdirSync(support, { recursive: true });
	fs.mkdirSync(path.join(workspace, ".study"), { recursive: true });
	fs.writeFileSync(path.join(support, "workspaces.json"), JSON.stringify({ schema: 2, workspaces: { [workspace]: {} } }));
	fs.writeFileSync(path.join(workspace, ".study", "workspace.json"), "{}");
	fs.writeFileSync(path.join(workspace, ".study", "course.json"), JSON.stringify({ revision: 1 }));
	const python = path.join(dir, "python");
	fs.writeFileSync(python, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
	const log = path.join(dir, "calls.jsonl");
	const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-10", FAKE_ENGINE_LOG: log };
	const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf-8").trim().split("\n").map((l) => argsOf((JSON.parse(l) as { args: string[] }).args)) : []);
	return { records: createCourseRecords({ python, root: dir, env }), workspace, env, calls, record: path.join(workspace, ".study", "course.json"), support };
}

describe("one engine run per read of one state of the records (round 13, N2)", () => {
	it("readers of the same map at once, and after it, share one run until the record changes", async () => {
		const { records, workspace, calls } = world();
		const read = await Promise.all(Array.from({ length: 5 }, () => records.map(workspace)));
		assert.ok(read.every((r) => r.ok));
		await records.map(workspace);
		await records.run(workspace, { verb: "show", handles: "all" });
		await records.run(workspace, { verb: "show", handles: "all" });
		assert.deepEqual(calls(), ["map", "show --all"], "five readers and two more after them ran map once, show once");
	});

	it("a save through the app, a write by another host, a deleted course's kept record and a new study day each read again", async () => {
		const { records, workspace, env, calls, record, support } = world();
		await records.map(workspace);
		await records.run(workspace, { verb: "save", changes: { focus: "rank" } });
		await records.map(workspace);
		// Claude Code saving through the engine's MCP server replaces the file whole.
		const next = `${record}.tmp`;
		fs.writeFileSync(next, JSON.stringify({ revision: 2, focus: "kernel" }));
		fs.renameSync(next, record);
		await records.map(workspace);
		fs.mkdirSync(path.join(workspace, ".study", "forgotten"));
		await records.map(workspace);
		fs.writeFileSync(path.join(support, "preferences.json"), "{}");
		await records.map(workspace);
		env.LEARNING_TODAY = "2026-11-11";
		await records.map(workspace);
		await records.map(workspace);
		assert.deepEqual(calls(), ["map", "save", "map", "map", "map", "map", "map"]);
	});

	it("the plan, which also reads his Journal, is shared only while it runs", async () => {
		const { records, workspace, calls } = world();
		await Promise.all([records.list(), records.list(), records.run(workspace, { verb: "plan" }), records.run(workspace, { verb: "plan" })]);
		assert.deepEqual(calls().sort(), ["plan --all --days 1", "plan --days 1"]);
		await records.list();
		assert.equal(calls().length, 3, "a list after the first settled reads his Journal again");
	});

	it("a read that failed is not kept, so the next reader tries again", async () => {
		const { records, workspace, calls } = world();
		await records.run(workspace, { verb: "show", handles: ["garbled"] });
		await records.run(workspace, { verb: "show", handles: ["garbled"] });
		assert.deepEqual(calls(), ["show -- garbled", "show -- garbled"]);
	});
});
