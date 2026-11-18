import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * A suite on the real `learning` engine: `describe(name, { skip:
 * realEngineMissing(python) }, …)`. With no engine one failing test says how
 * to give it one, so the run fails, never skipping out of sight (fix round 16:
 * a worktree has no `.venv`, so these suites skipped there and two of them
 * failed unseen for two rounds).
 */
export function realEngineMissing(python: string): string | false {
	if (fs.existsSync(python)) return false;
	const why = `No learning engine at ${python}. In a worktree, link the journal's: ln -sfn ~/dev/python/journal/.venv ${path.resolve(python, "../../..", ".venv")}`;
	test("the real learning engine is installed", () => assert.fail(why));
	return why;
}
