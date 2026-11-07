import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TSX_LOADER = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "loader.mjs");

type Resolved = { data: string; chats: string; auth: string; dataDirExisted: boolean };

function resolveInChild(env: { NODE_ENV?: "test"; NODE_TEST_CONTEXT?: string }): Resolved {
	const { LH_DATA_DIR: _data, LH_AUTH_FILE: _auth, NODE_TEST_CONTEXT: _runner, ...rest } = process.env;
	const out = execFileSync(
		process.execPath,
		[
			"--import",
			TSX_LOADER,
			"--eval",
			`const m = await import(${JSON.stringify(path.join(REPO_ROOT, "config.ts"))});
			const fs = await import("node:fs");
			console.log(JSON.stringify({ data: m.PATHS.data, chats: m.PATHS.chats, auth: m.AUTH_FILE, dataDirExisted: fs.existsSync(m.PATHS.data) }));`,
		],
		{ cwd: REPO_ROOT, encoding: "utf-8", env: { ...rest, NODE_ENV: "development", ...env } },
	);
	return JSON.parse(out) as Resolved;
}

describe("LH_DATA_DIR seam", () => {
	it("relocates data/chats/graph under LH_DATA_DIR, keeps prompts ROOT-anchored", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-seam-"));
		process.env.LH_DATA_DIR = dir;
		try {
			const { PATHS, ROOT } = await import("../config.ts");
			assert.equal(PATHS.data, dir, "PATHS.data resolves the env value (resolved absolute)");
			assert.equal(PATHS.chats, path.join(dir, "chats"));
			assert.equal(PATHS.graph, path.join(dir, "graph"));
			assert.equal(
				PATHS.teacherPrompt,
				path.join(ROOT, "src", "agent", "system-prompt.md"),
				"read-only prompt assets stay bundle-anchored on purpose",
			);
		} finally {
			delete process.env.LH_DATA_DIR;
		}
	});

	it("unset in a plain dev process = the repo data/ and auth.json exactly as before", () => {
		const parsed = resolveInChild({});
		assert.equal(parsed.data, path.join(REPO_ROOT, "data"));
		assert.equal(parsed.chats, path.join(REPO_ROOT, "data", "chats"));
		assert.equal(parsed.auth, path.join(REPO_ROOT, "auth.json"));
	});

	for (const [runner, env] of [
		["npm test (NODE_ENV=test)", { NODE_ENV: "test" }],
		["a test file run directly (node's runner sets NODE_TEST_CONTEXT)", { NODE_TEST_CONTEXT: "child-v8" }],
	] as const) {
		it(`unset under ${runner} = a fresh scratch dir outside the repo, removed on exit`, () => {
			const first = resolveInChild(env);
			const second = resolveInChild(env);
			for (const resolved of [first, second]) {
				assert.ok(!resolved.data.startsWith(REPO_ROOT + path.sep), `${resolved.data} is outside the repo`);
				assert.ok(!resolved.auth.startsWith(REPO_ROOT + path.sep), `${resolved.auth} is outside the repo`);
				assert.equal(path.dirname(resolved.auth), path.dirname(resolved.data), "auth.json sits beside data/, like desktop userData");
				assert.equal(resolved.dataDirExisted, false, "the data dir starts empty: nothing to inherit");
				assert.equal(fs.existsSync(path.dirname(resolved.data)), false, "the scratch dir is removed when the process exits");
			}
			assert.notEqual(first.data, second.data, "each test process gets its own scratch dir");
		});
	}
});
