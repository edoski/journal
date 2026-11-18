/**
 * Points the app's learning engine at the fake CLI (fake-learning-engine.mjs)
 * for one test file. Call it before the first import that loads config.ts:
 * the engine paths are read once, at that import.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-learning-engine.mjs");

export interface FakeEngine {
	/** The `plan --all` stdout; `init` registers into it. Rewrite it to
	 *  change what the engine lists. */
	planFile: string;
	setPlan(courses: unknown[]): void;
	calls(): Array<{ args: string[]; stdin: string }>;
}

export function useFakeEngine(dir: string, courses: unknown[]): FakeEngine {
	const python = path.join(dir, "python");
	const log = path.join(dir, "engine-calls.jsonl");
	const planFile = path.join(dir, "plan.json");
	fs.writeFileSync(python, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`, { mode: 0o755 });
	// The test's own HOME, whose engine registry follows the listing as the
	// real engine's does: the app keys its kept engine reads on it, and no
	// test reads the registry of the person running it.
	const home = path.join(dir, "home");
	const registry = path.join(home, "Library", "Application Support", "Learning", "workspaces.json");
	fs.mkdirSync(path.dirname(registry), { recursive: true });
	process.env.HOME = home;
	process.env.FAKE_ENGINE_REGISTRY = registry;
	const setPlan = (next: unknown[]) => {
		fs.writeFileSync(planFile, JSON.stringify({ today: "2026-11-07", courses: next }));
		fs.writeFileSync(registry, JSON.stringify({ schema: 2, workspaces: Object.fromEntries((next as { workspace: string }[]).map((c) => [c.workspace, {}])) }));
	};
	setPlan(courses);
	process.env.LH_LEARNING_ENGINE = dir;
	process.env.LH_LEARNING_PYTHON = python;
	process.env.FAKE_ENGINE_LOG = log;
	process.env.FAKE_ENGINE_PLAN_FILE = planFile;
	return {
		planFile,
		setPlan,
		calls: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf-8").trim().split("\n").map((l) => JSON.parse(l)) : []),
	};
}
