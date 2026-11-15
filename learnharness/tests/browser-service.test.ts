/**
 * Wave E stage 3 (owner 2026-10-10): demos run in the app's own Chromium
 * via a --browser-service helper (main.cjs boots a hidden window with
 * --remote-debugging-port=0), system Chrome as fallback. These pin the pure
 * halves of that chain: readiness from Chromium's own DevTools line and the
 * spawn-env sanitizer. The live chain (spawn → connect → page → run) is
 * exercised on dev machines, not in the suite.
 */
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { browserServiceSpawnEnv, devToolsEndpoint } from "../src/agent/subagents/headless.ts";

describe("browser-service helper (pure halves)", () => {
	it("is ready when Chromium prints its DevTools endpoint on stderr", async () => {
		const stderr = new PassThrough();
		const ready = devToolsEndpoint(stderr, 5_000);
		stderr.write("[1234:ERROR:gpu_init.cc] unrelated noise\nDevTools listening on ws://127.0.0.1:");
		stderr.write("57983/devtools/browser/0f3c-41aa\n");
		assert.equal(await ready, "ws://127.0.0.1:57983/devtools/browser/0f3c-41aa");
	});

	it("gives up when the helper exits without the DevTools line", async () => {
		const stderr = new PassThrough();
		const ready = devToolsEndpoint(stderr, 5_000);
		stderr.end("browser-service failed: Error: no display\n");
		assert.equal(await ready, null);
	});

	it("gives up at the timeout when the line never comes", async () => {
		const stderr = new PassThrough();
		const started = Date.now();
		assert.equal(await devToolsEndpoint(stderr, 100), null);
		assert.ok(Date.now() - started >= 90, "resolved before the timeout");
		stderr.destroy();
	});

	it("spawn env strips ELECTRON_RUN_AS_NODE — the helper must be a full app", () => {
		const env = browserServiceSpawnEnv({
			ELECTRON_RUN_AS_NODE: "1",
			LH_DEV_URL: "http://localhost:3000",
			PATH: "/usr/bin",
		});
		assert.equal("ELECTRON_RUN_AS_NODE" in env, false);
		assert.equal("LH_DEV_URL" in env, false);
		assert.equal(env.PATH, "/usr/bin");
	});

	it("spawn env never mutates the caller's env object", () => {
		const original = { ELECTRON_RUN_AS_NODE: "1", KEEP: "yes" };
		browserServiceSpawnEnv(original);
		assert.equal(original.ELECTRON_RUN_AS_NODE, "1");
		assert.equal(original.KEEP, "yes");
	});
});
