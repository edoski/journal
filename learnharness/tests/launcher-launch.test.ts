/**
 * The Spotlight launcher runs in Electron's main process: while it updates
 * the checkout, reinstalls the packages and builds the app, that process
 * must keep answering the Mac, or macOS marks the app "Not Responding"
 * (23 Nov 2026: about 50 s frozen on the first launch after an update). It
 * serves a production build (23 Nov 2026: on `next dev` the app was slow
 * to use), built only when the app's source changed. The launcher runs
 * here as plain Node against a fake Electron, a real git checkout one
 * commit behind origin, and stub commands that take seconds: git, npm, the
 * login shell, the esbuild and electron installs, next and its server.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-launch-"));
const savedEnv = { ...process.env };

const identity = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: { ...process.env, ...identity }, encoding: "utf8" }).trim();
const write = (file: string, content: string, mode = 0o644) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content, { mode });
};
const lines = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : []);

function freePort(): Promise<number> {
	return new Promise((resolve) => {
		const probe = net.createServer().listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});
}

const checkout = path.join(scratch, "checkout");
const appDir = path.join(checkout, "learnharness");
const bin = path.join(scratch, "bin");
const marks = path.join(scratch, "marks");
const logs = path.join(scratch, "logs");

/** origin's main is one commit ahead of the checkout: that commit brings the
 *  shell, so a loaded shell proves the update ran first. The app ignores
 *  what git ignores in the real one. */
function checkoutBehindOrigin() {
	const origin = path.join(scratch, "origin.git");
	git(scratch, "init", "-q", "--bare", "-b", "main", origin);
	const upstream = path.join(scratch, "upstream");
	git(scratch, "clone", "-q", origin, upstream);
	write(path.join(upstream, "learnharness/package-lock.json"), "{}\n");
	write(path.join(upstream, "learnharness/.gitignore"), "node_modules/\ndata/\n.next/\n");
	write(path.join(upstream, "learnharness/next-env.d.ts"), "as committed\n");
	write(path.join(upstream, "learnharness/scripts/build-server.mjs"), `import fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(`${marks}/build-server`)}, "ran\\n");\n`);
	git(upstream, "add", ".");
	git(upstream, "commit", "-qm", "app");
	git(upstream, "push", "-q", "origin", "main");
	git(scratch, "clone", "-q", origin, checkout);
	write(path.join(upstream, "learnharness/electron/main.cjs"), "globalThis.lhTestShell(__dirname);\n");
	git(upstream, "add", ".");
	git(upstream, "commit", "-qm", "shell");
	git(upstream, "push", "-q", "origin", "main");
}

/** Commands that take seconds, each leaving a mark when it runs or ends. */
function stubCommands() {
	fs.mkdirSync(marks);
	const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
	write(path.join(bin, "git"), `#!/bin/sh\nsleep 0.2\nexec ${realGit} "$@"\n`, 0o755);
	write(path.join(bin, "npm"), `#!/bin/sh\nsleep 1.5\ntouch ${marks}/npm\n`, 0o755);
	write(path.join(bin, "login-shell"), `#!/bin/sh\nsleep 0.5\nprintf '__LH_PATH__%s__LH_PATH__' "$PATH"\n`, 0o755);
	const modules = path.join(appDir, "node_modules");
	write(path.join(modules, "esbuild/install.js"), `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(`${marks}/esbuild`)}, ""), 700);\n`);
	write(
		path.join(modules, "electron/install.js"),
		`setTimeout(() => require("node:fs").writeFileSync(require("node:path").join(__dirname, "path.txt"), "Electron"), 700);\n`,
	);
	// The standalone server: what it was started with, then Ready once it listens.
	const server = `const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(`${marks}/server`)}, JSON.stringify({ NODE_ENV: process.env.NODE_ENV, LH_DATA_DIR: process.env.LH_DATA_DIR, LH_LEARNING_ENGINE: process.env.LH_LEARNING_ENGINE }) + "\\n");
require("node:http").createServer((_req, res) => res.end("ok")).listen(Number(process.env.PORT), process.env.HOSTNAME, () => setTimeout(() => console.log("Ready in 300ms"), 300));
setTimeout(() => process.exit(0), 60_000).unref();
`;
	// next: build writes the standalone server (and, as the real one does,
	// rewrites next-env.d.ts); dev would serve too, so only its mark tells.
	write(
		path.join(modules, "next/dist/bin/next"),
		`const fs = require("node:fs");
const command = process.argv[2];
fs.appendFileSync(${JSON.stringify(`${marks}/next`)}, command + "\\n");
if (command === "build") {
	setTimeout(() => {
		fs.mkdirSync(".next/standalone", { recursive: true });
		fs.writeFileSync(".next/standalone/server.js", ${JSON.stringify(server)});
		fs.writeFileSync("next-env.d.ts", "pointed at the build's types\\n");
	}, 1000);
} else {
	process.env.PORT = process.argv[process.argv.indexOf("--port") + 1];
	eval(${JSON.stringify(server)});
}
`,
	);
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

before(async () => {
	checkoutBehindOrigin();
	stubCommands();
	Object.assign(process.env, identity, {
		PATH: `${bin}${path.delimiter}${process.env.PATH}`,
		SHELL: path.join(bin, "login-shell"),
		LH_LAUNCH_PORT: String(await freePort()),
		LH_LAUNCH_LOGS: logs,
	});
	require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: electron } as NodeJS.Module;
});

after(() => {
	delete require.cache[electronId];
	process.env = savedEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

/** One launch, from the .app's call to the app's window showing, with a
 *  probe timer that must keep firing throughout; then the app quits. */
async function launchOnce() {
	FakeWindow.all = [];
	hold = null;
	// The app loads the shell once per process; each launch here is a new one.
	delete require.cache[path.join(appDir, "electron", "main.cjs")];
	exited = null;
	// The shell opens the app's window at once; it shows once its page
	// paints, and its page's request waits on the launcher's hold until
	// the server is ready.
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
		const limit = new Promise((_resolve, reject) => setTimeout(() => reject(new Error("the app's window never showed")), 30_000).unref());
		await Promise.race([Promise.all([launched, shown]), limit]);
	} catch (error) {
		const log = fs.existsSync(path.join(logs, "launcher.log")) ? fs.readFileSync(path.join(logs, "launcher.log"), "utf8") : "";
		assert.fail(`${(error as Error).message}; exit ${exited}; longest gap ${Math.round(worst)} ms\n${log}`);
	} finally {
		clearInterval(probe);
		app.emit("will-quit");
		app.removeAllListeners();
	}
	const updating = FakeWindow.all[0];
	assert.ok(updating, "a window opened");
	assert.equal(exited, null, "the launch did not fail");
	assert.ok(appWindow !== null && updating !== appWindow, "the shell opened its own window");
	assert.ok(heldPage, "the app's page waited for the server instead of failing to connect");
	assert.equal(updating.isDestroyed(), true, "the Updating window closed once the app's window showed");
	assert.match(fs.readFileSync(path.join(logs, "launcher.log"), "utf8"), /server up/);
	return { took: performance.now() - started, worst, updating };
}

describe("the launcher", () => {
	it("on the first launch after an update, keeps the main process answering, says Updating and builds the production server", async () => {
		const { took, worst, updating } = await launchOnce();
		assert.ok(took > 3000, `the stubs took seconds (${Math.round(took)} ms)`);
		assert.ok(fs.existsSync(path.join(marks, "esbuild")) && fs.existsSync(path.join(appDir, "node_modules/electron/path.txt")), "the packages were reinstalled");
		assert.ok(worst < 100, `the main process answered every 100 ms throughout (longest gap ${Math.round(worst)} ms over ${Math.round(took)} ms)`);
		assert.equal(updating.npmDone, false, "the Updating window was asked for before the packages finished installing");
		assert.equal(updating.options.backgroundColor, "#141414", "in the app's own frame");
		assert.ok(updating.urls.some((url) => url.includes("Updating Chiron…")), `it says Updating: ${updating.urls.join(" | ")}`);
		assert.equal(paths.userData, path.join(scratch, "appData", "LearnHarness-dev"), "the dev userData folder was named before Electron was ready");

		assert.deepEqual(lines(path.join(marks, "next")), ["build"], "one next build, no next dev");
		assert.deepEqual(lines(path.join(marks, "build-server")), ["ran"], "the standalone payload was finished");
		assert.deepEqual(lines(path.join(marks, "server")).map((line) => JSON.parse(line)), [
			{ NODE_ENV: "production", LH_DATA_DIR: path.join(appDir, "data"), LH_LEARNING_ENGINE: checkout },
		], "the production server ran on his data and engine");
		assert.equal(fs.readFileSync(path.join(appDir, "next-env.d.ts"), "utf8"), "as committed\n", "the build left next-env.d.ts as committed");
		assert.equal(git(checkout, "status", "--porcelain", "--untracked-files=no"), "", "the checkout stays clean for the next update");
	});

	it("on a launch with nothing changed, starts the last build straight away: no build and no next dev", async () => {
		const { updating } = await launchOnce();
		assert.deepEqual(lines(path.join(marks, "next")), ["build"], "nothing ran next again");
		assert.deepEqual(lines(path.join(marks, "build-server")), ["ran"]);
		assert.equal(lines(path.join(marks, "server")).length, 2, "the production server started again");
		assert.ok(!updating.urls.some((url) => url.includes("Updating")), `it never says Updating: ${updating.urls.join(" | ")}`);
	});

	it("builds again once the app's source changes, a new file of his own included", async () => {
		write(path.join(appDir, "app/page.tsx"), "export default function Page() {}\n");
		const { updating } = await launchOnce();
		assert.deepEqual(lines(path.join(marks, "next")), ["build", "build"], "the new file was built");
		assert.ok(updating.urls.some((url) => url.includes("Updating Chiron…")), "a build says Updating");
	});
});
