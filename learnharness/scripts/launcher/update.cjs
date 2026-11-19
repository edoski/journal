// The launcher's update rule: a checkout on main with no tracked changes
// fast-forwards to origin/main; any other checkout is left exactly as it is,
// and the launcher says why. Synchronous on purpose: the launcher runs it
// before Electron is ready, so the shell it then loads is the updated one.
const { spawnSync } = require("node:child_process");

const BRANCH = "main";

/**
 * @param {string} checkout the repository's root
 * @param {{env?: NodeJS.ProcessEnv, log?: (line: string) => void}} [options]
 * @returns {{updated: boolean, skipped: string | null, from?: string, to?: string}}
 */
function updateCheckout(checkout, { env = process.env, log = () => {} } = {}) {
	const run = (...args) => {
		const result = spawnSync("git", args, { cwd: checkout, env: { ...env, GIT_TERMINAL_PROMPT: "0" }, encoding: "utf8", timeout: 60_000 });
		const ok = result.status === 0;
		if (!ok) log(`git ${args.join(" ")}: ${(result.stderr || result.error?.message || `exit ${result.status}`).trim()}`);
		return { ok, out: (result.stdout ?? "").trim() };
	};
	const skip = (reason) => ({ updated: false, skipped: reason });

	const branch = run("symbolic-ref", "--quiet", "--short", "HEAD");
	if (!branch.ok) return skip("the checkout is not on a branch");
	if (branch.out !== BRANCH) return skip(`the checkout is on ${branch.out}, not ${BRANCH}`);
	// Untracked files never block: git itself refuses a fast-forward that would overwrite one.
	const status = run("status", "--porcelain", "--untracked-files=no");
	if (!status.ok) return skip("git could not read the checkout (see the launcher log)");
	if (status.out) return skip("the checkout has uncommitted changes");

	if (!run("fetch", "--quiet", "origin", BRANCH).ok) return skip("fetching origin failed (see the launcher log)");
	if (!run("merge-base", "--is-ancestor", "HEAD", `origin/${BRANCH}`).ok) {
		return skip(`local ${BRANCH} has commits origin/${BRANCH} lacks, so it cannot fast-forward`);
	}
	const from = run("rev-parse", "HEAD").out;
	if (!run("merge", "--ff-only", "--quiet", `origin/${BRANCH}`).ok) return skip("the fast-forward failed (see the launcher log)");
	const to = run("rev-parse", "HEAD").out;
	return { updated: from !== to, skipped: null, from, to };
}

module.exports = { updateCheckout };
