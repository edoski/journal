/**
 * smoke-server.mjs — boot the packaged standalone server and prove it serves.
 *
 * The payload gate that pays for itself (2026-10-08): `next build` success
 * and a completed electron-builder run say NOTHING about whether the
 * packaged server actually starts. On its first day this smoke caught two
 * real defects nothing else saw: (1) a trace-exclude regression that
 * stripped the pi engine packages to bare package.jsons — the server
 * answered 500 on every route with ERR_MODULE_NOT_FOUND; (2) before that,
 * the dev auth.json (the retired API-key store) shipping inside the bundle. It runs
 * between build-server.mjs and electron-builder so a broken payload fails
 * in seconds, not after a full packaging pass.
 *
 * What it does: spawns .next/standalone/server.js exactly the way the
 * Electron shell does (electron/main.cjs) — with --electron it uses
 * Electron's bundled Node via ELECTRON_RUN_AS_NODE, otherwise host Node —
 * 127.0.0.1 on a kernel-assigned
 * free port, NODE_ENV=production, a THROWAWAY LH_DATA_DIR under
 * os.tmpdir() (no real sign-in or data ever touch it) —
 * waits for the shell's own readiness check (electron/server-ready.cjs),
 * then probes the home route and the GET-only API surface (chats / models
 * / settings — no side effects). Any non-200, an early server exit, or a
 * 30s boot timeout fails the gate and prints the server's own
 * log tail for diagnosis. The child is ALWAYS killed before exit — a
 * leaked server holds its port against the next run (learned the hard
 * way, same day).
 */
import { spawn } from "node:child_process";
import { probeEnv, verifyDemoRuntime } from "./smoke-demo-runtime.mjs";
import { verifyCompressionRuntime } from "./smoke-compression-runtime.mjs";
import { verifyImageRuntime } from "./smoke-image-runtime.mjs";
import { createRequire } from "node:module";
import { waitForServer } from "../electron/server-ready.cjs";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const SERVER = path.join(STANDALONE, "server.js");
const ELECTRON_MODE = process.argv.includes("--electron");
const RUNTIME = ELECTRON_MODE ? createRequire(import.meta.url)("electron") : process.execPath;

const BOOT_TIMEOUT_MS = 30_000;
/** GET-only probes — the routes that exercised today's failure class. */
const PROBES = ["/", "/api/chats", "/api/models", "/api/settings"];

if (!fs.existsSync(SERVER)) {
	console.error("[smoke-server] .next/standalone/server.js missing — run next build first.");
	process.exit(1);
}

/** A free TCP port (listen(0) → the kernel assigns one) — mirrors main.cjs. */
function freePort() {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
		srv.on("error", reject);
	});
}

async function main() {
	// HTTP boot alone never imports the dynamically loaded demo engine.
	// Fail before packaging if its standalone dependency graph is incomplete.
	verifyDemoRuntime(STANDALONE, RUNTIME);
	// A plain GET without Accept-Encoding never exercises gzip backpressure.
	verifyCompressionRuntime(STANDALONE, RUNTIME);
	// Photon's WASM and the resize worker load unbundled from the payload.
	verifyImageRuntime(STANDALONE, RUNTIME);
	const port = await freePort();
	const url = `http://127.0.0.1:${port}`;
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "lh-smoke-"));
	const dataDir = path.join(home, "data");

	const tail = []; // rolling log tail for failure diagnosis
	let tailBytes = 0;
	const keep = (buf) => {
		for (const line of buf.toString().split("\n")) {
			tail.push(line);
			tailBytes += line.length + 1;
		}
		while (tailBytes > 16_000 && tail.length > 2) {
			tailBytes -= tail[0].length + 1;
			tail.shift();
		}
	};
	const dumpTail = () => {
		console.error("--- server log tail " + "-".repeat(20));
		for (const line of tail.slice(-40)) if (line.trim()) console.error(`    ${line}`);
	};

	console.log(`[smoke-server] runtime: ${ELECTRON_MODE ? "Electron bundled Node" : "host Node"}`);
	const child = spawn(RUNTIME, [SERVER], {
		cwd: STANDALONE,
		env: {
			...probeEnv(process.env, home),
			...(ELECTRON_MODE ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
			NODE_ENV: "production",
			PORT: String(port),
			HOSTNAME: "127.0.0.1",
			LH_DATA_DIR: dataDir,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let exited = false;
	child.stdout.on("data", keep);
	child.stderr.on("data", keep);
	child.on("exit", () => {
		exited = true;
	});
	const ready = waitForServer(child, url, { timeoutMs: BOOT_TIMEOUT_MS });

	const kill = () =>
		new Promise((resolve) => {
			if (exited) return resolve();
			const done = () => resolve();
			child.once("exit", done);
			child.kill("SIGTERM");
			setTimeout(() => {
				if (!exited) {
					try {
						child.kill("SIGKILL");
					} catch {
						/* already gone */
					}
				}
				done();
			}, 3000);
		});

	let failed = null;
	try {
		await ready;
		console.log(`[smoke-server] boot ok (${url})`);
		for (const route of PROBES) {
			const { status } = await fetch(url + route, { signal: AbortSignal.timeout(5000) });
			if (status !== 200) throw new Error(`GET ${route} → ${status} (expected 200)`);
			console.log(`[smoke-server] GET ${route} → 200`);
		}
	} catch (err) {
		failed = err;
	} finally {
		await kill();
		try {
			fs.rmSync(home, { recursive: true, force: true });
		} catch {
			/* best effort — it's under os.tmpdir() */
		}
	}

	if (failed) {
		console.error(`[smoke-server] FAIL: ${failed.message}`);
		dumpTail();
		process.exit(1);
	}
	console.log("[smoke-server] smoke passed — the packaged server boots and serves.");
}

main().catch((err) => {
	console.error(`[smoke-server] FAIL: ${err.message}`);
	process.exit(1);
});
