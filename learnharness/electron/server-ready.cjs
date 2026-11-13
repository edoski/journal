// No Electron import: the server's readiness contract is testable without a
// display. The standalone Next server logs "Ready in …" once its port
// listens (next/dist/server/lib/start-server.js; tests/server-ready.test.ts
// pins that the installed Next still does), so the shell waits for that
// line instead of polling, then makes one HTTP check.
const http = require("node:http");

const READY_LINE = /\bReady in\b/;

/** One GET; resolves on any HTTP answer, rejects when nothing answers. */
function httpAnswers(url) {
	return new Promise((resolve, reject) => {
		const req = http.get(url, (res) => {
			res.resume();
			resolve();
		});
		req.on("error", reject);
	});
}

/**
 * @param {{stdout: NodeJS.ReadableStream, once: Function, off: Function}} child
 * @param {string} url
 * @param {{timeoutMs?: number, check?: (url: string) => Promise<void>}} [options]
 * @returns {Promise<void>}
 */
function waitForServer(child, url, { timeoutMs = 30_000, check = httpAnswers } = {}) {
	return new Promise((resolve, reject) => {
		let seen = "";
		let settled = false;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(deadline);
			child.stdout.off("data", onData);
			child.off("exit", onExit);
			if (error) reject(error);
			else resolve();
		};
		const onData = (chunk) => {
			seen = (seen + chunk.toString()).slice(-4096);
			if (!READY_LINE.test(seen)) return;
			child.stdout.off("data", onData);
			check(url).then(() => finish(), (error) => finish(new Error(`server said it was ready but ${url} did not answer`, { cause: error })));
		};
		const onExit = (code, signal) => finish(new Error(`server exited (code=${code} signal=${signal}) before it was ready`));
		// A limit, not a poll: a server that never says it is ready fails the start.
		const deadline = setTimeout(() => finish(new Error(`server did not say it was ready within ${timeoutMs}ms`)), timeoutMs);
		child.stdout.on("data", onData);
		child.once("exit", onExit);
	});
}

module.exports = { waitForServer, READY_LINE };
