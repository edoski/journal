/**
 * The Spotlight launcher updates the checkout only when it is on main with no
 * tracked changes, by fast-forwarding to origin/main; any other checkout is
 * left exactly as it is. Real git repositories in a scratch folder.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { updateCheckout } = require("../scripts/launcher/update.cjs") as {
	updateCheckout: (checkout: string) => Promise<{ updated: boolean; skipped: string | null }>;
};

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-launcher-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const identity = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, env: { ...process.env, ...identity }, encoding: "utf8" }).trim();
const head = (repo: string) => git(repo, "rev-parse", "HEAD");
const lockfile = "learnharness/package-lock.json";

function commit(repo: string, file: string, content: string) {
	fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
	fs.writeFileSync(path.join(repo, file), content);
	git(repo, "add", file);
	git(repo, "commit", "-qm", `change ${file}`);
}

/** A commit on origin's main, made from a second clone. */
function push(upstream: string, file: string, content: string) {
	commit(upstream, file, content);
	git(upstream, "push", "-q", "origin", "main");
}

let checkout = "";
let upstream = "";
let run = 0;
beforeEach(() => {
	const root = path.join(scratch, String(run++));
	const origin = path.join(root, "origin.git");
	git(scratch, "init", "-q", "--bare", "-b", "main", origin);
	upstream = path.join(root, "upstream");
	git(scratch, "clone", "-q", origin, upstream);
	push(upstream, lockfile, "{}\n");
	checkout = path.join(root, "checkout");
	git(scratch, "clone", "-q", origin, checkout);
	Object.assign(process.env, identity);
});

describe("the launcher's update rule", () => {
	it("fast-forwards a clean main to origin/main", async () => {
		push(upstream, "learnharness/page.tsx", "new page\n");
		const result = await updateCheckout(checkout);
		assert.deepEqual([result.updated, result.skipped], [true, null]);
		assert.equal(head(checkout), head(upstream));
	});

	it("leaves a main with uncommitted changes alone, without fetching", async () => {
		push(upstream, "learnharness/page.tsx", "new page\n");
		const before = head(checkout);
		fs.writeFileSync(path.join(checkout, lockfile), "his edit\n");
		const result = await updateCheckout(checkout);
		assert.equal(result.updated, false);
		assert.match(result.skipped ?? "", /uncommitted changes/);
		assert.equal(head(checkout), before);
		assert.equal(git(checkout, "rev-parse", "origin/main"), before, "origin/main was not fetched");
		assert.equal(fs.readFileSync(path.join(checkout, lockfile), "utf8"), "his edit\n");
	});

	it("leaves another branch alone", async () => {
		push(upstream, "learnharness/page.tsx", "new page\n");
		git(checkout, "switch", "-qc", "his-work");
		const before = head(checkout);
		const result = await updateCheckout(checkout);
		assert.equal(result.updated, false);
		assert.match(result.skipped ?? "", /on his-work, not main/);
		assert.equal(head(checkout), before);
		assert.equal(git(checkout, "branch", "--show-current"), "his-work");
	});

	it("leaves a main with its own commits alone", async () => {
		push(upstream, "learnharness/page.tsx", "new page\n");
		commit(checkout, "learnharness/local.tsx", "local\n");
		const before = head(checkout);
		const result = await updateCheckout(checkout);
		assert.match(result.skipped ?? "", /cannot fast-forward/);
		assert.equal(head(checkout), before);
	});
});
