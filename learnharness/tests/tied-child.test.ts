/**
 * A tutor process dies with its server (round 3, 14 Nov 2026): a killed
 * server left its `claude -p` running for 26 minutes. The tied child's
 * supervisor ends it the moment the server is gone, even on SIGKILL.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { test } from "node:test";
import { spawnTiedChild, stopTiedChild } from "../src/agent/tied-child.ts";

const groupAlive = (pgid: number) => {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch {
		return false;
	}
};

async function gone(pgid: number, withinMs: number): Promise<boolean> {
	const until = Date.now() + withinMs;
	while (Date.now() < until) {
		if (!groupAlive(pgid)) return true;
		await new Promise((r) => setTimeout(r, 50));
	}
	return !groupAlive(pgid);
}

test("a server killed with SIGKILL takes its tied command with it", async () => {
	const server = spawn(process.execPath, ["--import", "tsx", path.join(import.meta.dirname, "helpers", "tied-server.ts")], { stdio: ["ignore", "pipe", "inherit"] });
	const pgid = await new Promise<number>((resolve, reject) => {
		server.stdout!.once("data", (chunk) => resolve(Number(String(chunk).trim())));
		server.once("exit", () => reject(new Error("the stand-in server exited early")));
	});
	assert.ok(groupAlive(pgid), "the command runs while the server lives");
	server.kill("SIGKILL");
	assert.ok(await gone(pgid, 5000), "the command and its supervisor are gone once the server is");
});

test("a normal exit keeps the command's exit code, and stop ends the group", async () => {
	const ok = spawnTiedChild("sh", ["-c", "exit 3"], {});
	ok.stdin!.end();
	const code = await new Promise<number | null>((resolve) => ok.on("close", (c) => resolve(c)));
	assert.equal(code, 3);
	const long = spawnTiedChild("sleep", ["60"], {});
	long.stdin!.end();
	stopTiedChild(long);
	await new Promise((resolve) => long.on("close", resolve));
	assert.ok(await gone(long.pid!, 3000));
});

test("the command reads the server's stdin and writes to its stdout", async () => {
	const echo = spawnTiedChild("cat", [], {});
	let out = "";
	echo.stdout!.setEncoding("utf8");
	echo.stdout!.on("data", (c: string) => { out += c; });
	echo.stdin!.end("hello\n");
	await new Promise((resolve) => echo.on("close", resolve));
	assert.equal(out, "hello\n");
});

test("a supervisor killed outright takes the rest of its group with it, so nothing holds the server open", async () => {
	// The Agent SDK's close (0.3.x): stdin ends, SIGTERM to the process it
	// spawned 2 s later, SIGKILL 5 s after that, to the supervisor alone. An
	// arc pass's twelve readers left their watchers (and a slow claude)
	// orphaned, holding the server's lifeline pipe, so the pass never exited
	// (round 16, 18 Nov 2026).
	const slow = spawnTiedChild("sh", ["-c", "trap '' TERM; echo ready; while :; do sleep 1; done"], {});
	const closed = new Promise((resolve) => slow.on("close", resolve));
	await new Promise((resolve) => slow.stdout!.once("data", resolve));
	slow.stdin!.end();
	slow.kill("SIGTERM");
	slow.kill("SIGKILL");
	try {
		assert.ok(await gone(slow.pid!, 3000), "the command and the watcher are gone with their supervisor");
		await closed;
	} finally {
		try { process.kill(-slow.pid!, "SIGKILL"); } catch { /* gone */ }
	}
});
