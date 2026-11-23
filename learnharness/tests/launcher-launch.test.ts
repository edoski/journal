/**
 * The Spotlight launcher runs in Electron's main process: while it updates
 * the checkout and reinstalls the packages, that process must keep answering
 * the Mac, or macOS marks the app "Not Responding" (23 Nov 2026: about 50 s
 * frozen on the first launch after an update). The launcher runs here as
 * plain Node against a fake Electron, a real git checkout one commit behind
 * origin, and stub commands that take seconds: git, npm, the login shell,
 * the esbuild and electron installs and next dev.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-launch-"));
const savedEnv = { ...process.env };

const identity = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: { ...process.env, ...identity }, encoding: "utf8" }).trim();
const write = (file: string, content: string, mode = 0o644) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content, { mode });
};

function freePort(): Promise<number> {
	return new Promise((resolve) => {
		const probe = net.createServer().listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});
}

/** origin's main is one commit ahead of the checkout: that commit brings the
 *  shell, so a loaded shell proves the update ran first. */
function checkoutBehindOrigin() {
	const origin = path.join(scratch, "origin.git");
	git(scratch, "init", "-q", "--bare", "-b", "main", origin);
	const upstream = path.join(scratch, "upstream");
	git(scratch, "clone", "-q", origin, upstream);
	write(path.join(upstream, "learnharness/package-lock.json"), "{}\n");
	git(upstream, "add", ".");
	git(upstream, "commit", "-qm", "lock");
	git(upstream, "push", "-q", "origin", "main");
	const checkout = path.join(scratch, "checkout");
	git(scratch, "clone", "-q", origin, checkout);
	write(path.join(upstream, "learnharness/electron/main.cjs"), "globalThis.lhTestShell(__dirname);\n");
	git(upstream, "add", ".");
	git(upstream, "commit", "-qm", "shell");
	git(upstream, "push", "-q", "origin", "main");
	return checkout;
}

/** Commands that take seconds, each leaving a mark when it finishes. */
function stubCommands(checkout: string) {
	const bin = path.join(scratch, "bin");
	const marks = path.join(scratch, "marks");
	fs.mkdirSync(marks);
	const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
	write(path.join(bin, "git"), `#!/bin/sh\nsleep 0.2\nexec ${realGit} "$@"\n`, 0o755);
	write(path.join(bin, "npm"), `#!/bin/sh\nsleep 1.5\ntouch ${marks}/npm\n`, 0o755);
	write(path.join(bin, "login-shell"), `#!/bin/sh\nsleep 0.5\nprintf '__LH_PATH__%s__LH_PATH__' "$PATH"\n`, 0o755);
	const modules = path.join(checkout, "learnharness/node_modules");
	write(path.join(modules, "esbuild/install.js"), `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(`${marks}/esbuild`)}, ""), 700);\n`);
	write(
		path.join(modules, "electron/install.js"),
		`setTimeout(() => require("node:fs").writeFileSync(require("node:path").join(__dirname, "path.txt"), "Electron"), 700);\n`,
	);
	write(
		path.join(modules, "next/dist/bin/next"),
		`const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
require("node:http").createServer((_req, res) => res.end("ok")).listen(port, "127.0.0.1", () => setTimeout(() => console.log("Ready in 300ms"), 300));
setTimeout(() => process.exit(0), 60_000).unref();
`,
	);
	return { bin, marks };
}

class FakeWindow extends EventEmitter {
	static all: FakeWindow[] = [];
	urls: string[] = [];
	destroyed = false;
	constructor(
		readonly options: Record<string, unknown>,
		readonly npmDone: boolean,
	) {
		super();
		FakeWindow.all.push(this);
	}
	loadURL(url: string) {
		this.urls.push(decodeURIComponent(url));
		return Promise.resolve();
	}
	show() {
		this.emit("show");
	}
	close() {
		this.destroyed = true;
		this.emit("closed");
	}
	isDestroyed() {
		return this.destroyed;
	}
}

after(() => {
	process.env = savedEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

describe("the launcher on the first launch after an update", () => {
	it("keeps the main process answering and shows an Updating window while it updates", async () => {
		const checkout = checkoutBehindOrigin();
		const { bin, marks } = stubCommands(checkout);
		const logs = path.join(scratch, "logs");
		Object.assign(process.env, identity, {
			PATH: `${bin}${path.delimiter}${process.env.PATH}`,
			SHELL: path.join(bin, "login-shell"),
			LH_LAUNCH_PORT: String(await freePort()),
			LH_LAUNCH_LOGS: logs,
		});

		type Hold = (details: unknown, callback: (response: { cancel?: boolean }) => void) => void;
		let hold: Hold | null = null;
		const paths: Record<string, string> = { appData: path.join(scratch, "appData") };
		let exited: number | null = null;
		const app = Object.assign(new EventEmitter(), {
			setName() {},
			getPath: (which: string) => paths[which],
			setPath: (which: string, where: string) => void (paths[which] = where),
			whenReady: () => Promise.resolve(),
			exit: (code: number) => void (exited = code),
			relaunch() {},
		});
		class Window extends FakeWindow {
			constructor(options: Record<string, unknown>) {
				super(options, fs.existsSync(path.join(marks, "npm")));
				app.emit("browser-window-created", {}, this);
			}
		}
		const electron = {
			app,
			BrowserWindow: Window,
			Notification: class {
				show() {}
				once() {}
			},
			session: {
				defaultSession: {
					webRequest: {
						// (filter, handler) holds the page; (null) releases it.
						onBeforeRequest: (...args: unknown[]) => void (hold = (args.at(-1) as Hold | null) ?? null),
					},
				},
			},
		};
		const electronId = require.resolve("electron");
		require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: electron } as NodeJS.Module;

		// The shell opens the app's window at once; it shows once its page
		// paints, and its page's request waits on the launcher's hold until
		// next dev is ready.
		let appWindow: FakeWindow | null = null;
		let heldPage = false;
		const shown = new Promise<void>((resolve) => {
			(globalThis as { lhTestShell?: (dir: string) => void }).lhTestShell = () => {
				const win = new Window({});
				appWindow = win;
				win.once("show", () => resolve());
				heldPage = hold !== null;
				if (hold) hold({}, ({ cancel }) => (cancel ? assert.fail("the page's request was cancelled") : win.show()));
				else win.show();
			};
		});

		// The probe: a timer that must keep firing while the launcher works.
		let last = performance.now();
		let worst = 0;
		const probe = setInterval(() => {
			const now = performance.now();
			worst = Math.max(worst, now - last);
			last = now;
		}, 5);
		const started = performance.now();
		try {
			const { launch } = require("../scripts/launcher/launch.cjs") as { launch: (options: { checkout: string; bundle: null }) => Promise<void> };
			const launched = launch({ checkout, bundle: null });
			const limit = new Promise((_resolve, reject) => setTimeout(() => reject(new Error("the shell never loaded")), 30_000).unref());
			await Promise.race([Promise.all([launched, shown]), limit]);
		} catch (error) {
			const log = fs.existsSync(path.join(logs, "launcher.log")) ? fs.readFileSync(path.join(logs, "launcher.log"), "utf8") : "";
			assert.fail(`${(error as Error).message}; exit ${exited}; longest gap ${Math.round(worst)} ms\n${log}`);
		} finally {
			clearInterval(probe);
			app.emit("will-quit");
			delete require.cache[electronId];
		}
		const took = performance.now() - started;

		assert.equal(exited, null, "the launch did not fail");
		assert.ok(took > 3000, `the stubs took seconds (${Math.round(took)} ms)`);
		assert.ok(fs.existsSync(path.join(marks, "esbuild")) && fs.existsSync(path.join(checkout, "learnharness/node_modules/electron/path.txt")), "the packages were reinstalled");
		assert.ok(worst < 100, `the main process answered every 100 ms throughout (longest gap ${Math.round(worst)} ms over ${Math.round(took)} ms)`);

		const updating = FakeWindow.all[0];
		assert.ok(updating, "a window opened");
		assert.equal(updating.npmDone, false, "the Updating window was asked for before the packages finished installing");
		assert.equal(updating.options.backgroundColor, "#141414", "in the app's own frame");
		assert.ok(updating.urls.some((url) => url.includes("Updating Chiron…")), `it says Updating: ${updating.urls.join(" | ")}`);
		assert.ok(appWindow !== null && updating !== appWindow, "the shell opened its own window");
		assert.ok(heldPage, "the app's page waited for next dev instead of failing to connect");
		assert.match(fs.readFileSync(path.join(logs, "launcher.log"), "utf8"), /server up/);
		assert.equal(updating.isDestroyed(), true, "the Updating window closed once the app's window showed");
		assert.equal(paths.userData, path.join(scratch, "appData", "LearnHarness-dev"), "the dev userData folder was named before Electron was ready");
	});
});
