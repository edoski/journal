/**
 * The desktop shell starts the app's server and waits for the server's own
 * ready line, then checks once that it answers, instead of polling it every
 * 200 ms. The line is Next's, so the installed Next is pinned to still log it.
 */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { waitForServer, READY_LINE } = require("../electron/server-ready.cjs") as {
	waitForServer: (child: unknown, url: string, options?: { timeoutMs?: number; check?: (url: string) => Promise<void> }) => Promise<void>;
	READY_LINE: RegExp;
};

function fakeServer() {
	const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter() });
	return child;
}

describe("the desktop shell's wait for its server", () => {
	it("checks the server once, right after its ready line, and never before", async () => {
		const child = fakeServer();
		const checks: string[] = [];
		const ready = waitForServer(child, "http://127.0.0.1:4100", { check: async (url) => void checks.push(url) });
		child.stdout.emit("data", Buffer.from("   ▲ Next.js 16\n   - Local: http://127.0.0.1:4100\n"));
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(checks, [], "no request before the server says it is ready");
		child.stdout.emit("data", Buffer.from(" ✓ Ready in 412ms\n"));
		await ready;
		assert.deepEqual(checks, ["http://127.0.0.1:4100"]);
	});

	it("fails the start when the server exits first", async () => {
		const child = fakeServer();
		const ready = waitForServer(child, "http://127.0.0.1:4100", { check: async () => {} });
		child.emit("exit", 1, null);
		await assert.rejects(ready, /exited \(code=1/);
	});

	it("the installed Next still logs the ready line the shell waits for", () => {
		const source = readFileSync(require.resolve("next/dist/server/lib/start-server.js"), "utf8");
		const logged = /_log\.event\(`(Ready in [^`]*)`\)/.exec(source)?.[1];
		assert.ok(logged && READY_LINE.test(logged), "next/dist/server/lib/start-server.js logs `Ready in …` when it listens");
	});
});
