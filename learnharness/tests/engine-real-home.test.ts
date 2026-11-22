/**
 * Carry-in 3 (round 19): a test wrote 8 temporary courses into his real
 * `~/Library/Application Support/Learning/workspaces.json`. Under test the
 * app's one engine spawn refuses the account's real home, and the test
 * process fails whatever the caller makes of the refusal.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { createCourseRecords } from "../src/store/course-records.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-real-home-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** A `python` that only leaves a mark that it ran. */
function marker(): { python: string; ran: string } {
	const ran = path.join(TMP, `ran-${Math.random().toString(36).slice(2)}`);
	const python = path.join(TMP, `python-${path.basename(ran)}`);
	fs.writeFileSync(python, `#!/bin/sh\ntouch "${ran}"\necho '{"ok":true}'\n`, { mode: 0o755 });
	return { python, ran };
}

for (const [name, home] of [
	["the real home", os.userInfo().homedir],
	["the real home, written with a trailing slash", `${os.userInfo().homedir}/`],
	["no HOME at all", undefined],
] as const) {
	it(`an engine run on ${name} under test is refused, never started, and fails the test process`, async () => {
		const { python, ran } = marker();
		const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test" };
		if (home === undefined) delete env.HOME;
		else env.HOME = home;
		const records = createCourseRecords({ python, root: TMP, env });
		const before = process.exitCode;
		const quiet = console.error;
		console.error = () => {};
		try {
			const result = await records.run(TMP, { verb: "show", handles: "all" });
			assert.ok(!result.ok && /real home/.test(result.message), JSON.stringify(result));
		} finally {
			console.error = quiet;
		}
		assert.equal(fs.existsSync(ran), false, "the engine never started");
		assert.equal(process.exitCode, 1, "the test process fails even when its caller swallows the refusal");
		process.exitCode = before;
	});
}

it("an engine run on a test's own HOME runs", async () => {
	const { python, ran } = marker();
	const records = createCourseRecords({ python, root: TMP, env: { ...process.env, HOME: path.join(TMP, "home") } });
	await records.run(TMP, { verb: "show", handles: "all" });
	assert.equal(fs.existsSync(ran), true);
});
