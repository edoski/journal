// What the installed .app runs on each launch (its own main, app/main.cjs,
// loads this file from the checkout, so a merge into main changes it too):
//   1. open a window in the app's frame at once, saying Opening or Updating;
//   2. update the checkout by the rule in update.cjs, then reinstall the
//      packages when package-lock.json changed;
//   3. start `next dev` on PORT, as `npm run desktop:dev` does, so pages,
//      server routes and the engine reload live;
//   4. load the app's own Electron shell (electron/main.cjs) against it; its
//      window takes the Updating window's place once it shows.
// Every step runs asynchronously in Electron's main process, so the Mac never
// finds the app not responding while an update installs. Only naming the app
// runs before Electron is ready: its userData folder must be final by then.
// A second launch never reaches this file: macOS focuses the running app.
const { app, BrowserWindow, Notification, session } = require("electron");
const { spawn } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { removeRenamedBundles } = require("./bundles.cjs");
const { updateCheckout } = require("./update.cjs");
const product = require.resolve("../../electron/product.cjs");
const serverReady = require.resolve("../../electron/server-ready.cjs");
const windowFrame = require.resolve("../../electron/window-frame.cjs");
const { PRODUCT_NAME, DATA_FOLDER, nameApp } = require(product);
const { waitForServer } = require(serverReady);
const { WINDOW_FRAME } = require(windowFrame);

/** Clear of the Amoreg dev servers (3000 to 3210, 5173, 5733). */
const PORT = Number(process.env.LH_LAUNCH_PORT) || 4747;
const LOG_DIR = process.env.LH_LAUNCH_LOGS || path.join(os.homedir(), "Library", "Logs", DATA_FOLDER);

/** Stops this launch's next dev; set once it starts. */
let stopServer = () => {};

/** Starts the launch and returns at once; the promise settles when the shell
 *  is loaded, the .app is being rebuilt, or the launch failed and said why. */
function launch({ checkout, bundle }) {
	const appDir = path.join(checkout, "learnharness");
	fs.mkdirSync(LOG_DIR, { recursive: true });
	const log = (line) => fs.appendFileSync(path.join(LOG_DIR, "launcher.log"), `[${new Date().toISOString()}] ${line}\n`);
	const notices = [];
	const notify = (body) => {
		log(`notice: ${body}`);
		notices.push(body);
	};
	log(`launch: ${checkout}${bundle ? ` from ${bundle}` : ""}`);
	const url = `http://127.0.0.1:${PORT}`;
	// The shell runs against this next dev, and the dev userData folder
	// follows from it: both are named before Electron is ready.
	process.env.LH_DEV_URL = url;
	nameApp(app, process.env);
	const waiting = updatingWindow();
	return start({ checkout, bundle, appDir, url, log, notify, notices, waiting }).catch((error) => fail(error.message, log, notices));
}

async function start({ checkout, bundle, appDir, url, log, notify, notices, waiting }) {
	const env = await shellEnvironment(log);
	const update = await updateCheckout(checkout, { env, log });
	if (update.skipped) notify(`Opened without updating: ${update.skipped}.`);
	else log(update.updated ? `updated ${update.from} -> ${update.to}` : "already on origin/main");
	if (update.updated) waiting.say(`Updating ${PRODUCT_NAME}…`);
	await installPackagesIfStale(appDir, env, log, waiting);
	if (!fs.existsSync(path.join(appDir, "node_modules", "electron", "path.txt"))) {
		await run("node", ["node_modules/electron/install.js"], appDir, env, log);
	}
	// The update may have renamed the app: the .app follows the name it brought.
	delete require.cache[product];
	const { PRODUCT_NAME: name } = require(product);
	if (bundle && (await reinstallStaleBundle({ appDir, checkout, bundle, name, env, log }))) return;
	if (bundle) removeRenamedBundles(bundle, name, log);

	const pidFile = path.join(LOG_DIR, `next-dev-${PORT}.pid`);
	await stopStaleServer(pidFile, appDir, log);
	if (await portTaken(PORT)) throw new Error(`port ${PORT} is in use by another program, so ${PRODUCT_NAME} can't start its server`);
	// The packaged app's capability, so no other program or web page can
	// call the API: the shell sends it on the window's requests.
	const secret = randomBytes(32).toString("hex");
	const server = startServer({ appDir, env: { ...env, LH_DESKTOP_API_SECRET: secret }, pidFile, log });
	const ready = waitForServer(server, url, { timeoutMs: 120_000 });
	ready.then(
		() => log(`server up: ${url}`),
		(error) => fail(`${error.message}. See ${LOG_DIR}`, log, notices),
	);
	server.on("error", (error) => fail(`next dev did not start: ${error.message}`, log, notices));

	await app.whenReady();
	// The shell opens its window at once; its page requests wait here
	// until the server says it is ready, instead of failing to connect.
	const requests = session.defaultSession.webRequest;
	requests.onBeforeRequest({ urls: [`${url}/*`] }, (_details, callback) =>
		ready.then(() => callback({}), () => callback({ cancel: true })),
	);
	void ready.then(() => requests.onBeforeRequest(null), () => {});
	show(notices);
	process.env.LH_DESKTOP_API_SECRET = secret;
	// The shell must get the updated copies of the files this launcher
	// loaded before the update, not Node's cached ones.
	for (const loaded of [product, serverReady, windowFrame]) delete require.cache[loaded];
	require(path.join(appDir, "electron", "main.cjs"));
}

/** A window in the app's frame from the moment Electron is ready, with one
 *  quiet line, until the app's own window shows in its place. */
function updatingWindow() {
	let line = `Opening ${PRODUCT_NAME}…`;
	let win = null;
	const page = () =>
		`data:text/html;charset=utf-8,${encodeURIComponent(
			`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
				`<style>html{color-scheme:dark}body{margin:0;height:100vh;display:grid;place-items:center;background:${WINDOW_FRAME.backgroundColor};` +
				`color:#a1a1a1;font:13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;cursor:default;-webkit-user-select:none;-webkit-app-region:drag}</style>` +
				`<body>${line}</body>`,
		)}`;
	void app.whenReady().then(() => {
		win = new BrowserWindow({ ...WINDOW_FRAME, title: PRODUCT_NAME, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
		win.once("ready-to-show", () => win.show());
		void win.loadURL(page());
		// The next window is the app's: this one closes once that one shows.
		app.once("browser-window-created", (_event, appWindow) =>
			appWindow.once("show", () => {
				if (!win.isDestroyed()) win.close();
			}),
		);
	});
	return {
		say(next) {
			line = next;
			if (win && !win.isDestroyed()) void win.loadURL(page());
		},
	};
}

/** Runs a command to its end without blocking the main process; resolves
 *  with its stdout, or `null` when it could not run or failed. */
function capture(command, args, { env, timeout = 15_000 } = {}) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "ignore"], timeout });
		let out = "";
		child.stdout.on("data", (chunk) => (out += chunk));
		// 'close' always comes, after 'exit' or after a failed spawn's 'error'.
		child.once("error", () => {});
		child.once("close", (code) => resolve(code === 0 ? out : null));
	});
}

/** The PATH his login shell sets (nvm's node, Homebrew's claude): an app
 *  opened from Spotlight gets launchd's bare PATH instead. */
async function shellEnvironment(log) {
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const shell = process.env.SHELL || os.userInfo().shell || "/bin/zsh";
	const mark = "__LH_PATH__";
	const found = ((await capture(shell, ["-ilc", `printf '${mark}%s${mark}' "$PATH"`])) ?? "").split(mark)[1];
	if (found) env.PATH = found;
	else log(`login shell gave no PATH; keeping ${env.PATH}`);
	return env;
}

/** Resolves when the command exits 0; its output goes to the launcher log. */
function run(command, args, cwd, env, log) {
	log(`run: ${command} ${args.join(" ")}`);
	const out = fs.openSync(path.join(LOG_DIR, "launcher.log"), "a");
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, env, stdio: ["ignore", out, out], timeout: 15 * 60_000 });
		let error = null;
		child.once("error", (spawnError) => (error = spawnError));
		// 'close' always comes, after 'exit' or after a failed spawn's 'error'.
		child.once("close", (code, signal) => {
			fs.closeSync(out);
			const failure = error?.message ?? (code === 0 ? null : signal ? `signal ${signal}` : `exit ${code}`);
			if (failure) reject(new Error(`${command} ${args.join(" ")} failed (${failure}). See ${LOG_DIR}`));
			else resolve();
		});
	});
}

/** Reinstalls unless the last install that finished was of this very
 *  package-lock.json, so a failed install or a pull made elsewhere heals on
 *  the next launch. npm blocks esbuild's install script and electron ships
 *  none, so both binaries are fetched by hand. */
async function installPackagesIfStale(appDir, env, log, waiting) {
	const stamp = path.join(appDir, "node_modules", ".lh-launcher-installed");
	const lock = createHash("sha256").update(fs.readFileSync(path.join(appDir, "package-lock.json"))).digest("hex");
	if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === lock) return;
	waiting.say(`Updating ${PRODUCT_NAME}…`);
	await run("npm", ["ci", "--no-audit", "--no-fund"], appDir, env, log);
	await run("node", ["node_modules/esbuild/install.js"], appDir, env, log);
	await run("node", ["node_modules/electron/install.js"], appDir, env, log);
	fs.writeFileSync(stamp, lock);
}

/** The .app carries its own copy of Electron and the app's name. When main
 *  moved to another Electron version or renamed the app, rebuild the .app
 *  from the checkout and open the new one. */
async function reinstallStaleBundle({ appDir, checkout, bundle, name, env, log }) {
	const wanted = JSON.parse(fs.readFileSync(path.join(appDir, "node_modules", "electron", "package.json"), "utf8")).version;
	const named = `${name}.app`;
	if ((wanted === process.versions.electron && path.basename(bundle) === named) || process.argv.includes("--lh-reinstalled")) return false;
	log(`${path.basename(bundle)} on Electron ${process.versions.electron} -> ${named} on ${wanted}: reinstalling`);
	await run("/bin/bash", [path.join(appDir, "scripts", "launcher", "install.sh"), "--checkout", checkout, "--dest", path.dirname(bundle)], appDir, env, log);
	app.relaunch({ execPath: path.join(path.dirname(bundle), named, "Contents", "MacOS", "Electron"), args: [...process.argv.slice(1), "--lh-reinstalled"] });
	app.exit(0);
	return true;
}

function startServer({ appDir, env, pidFile, log }) {
	const next = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
	const out = fs.openSync(path.join(LOG_DIR, `next-dev-${PORT}.log`), "w");
	// Its own process group, so quitting stops next dev and its workers together.
	const server = spawn("node", [next, "dev", "--port", String(PORT), "--hostname", "127.0.0.1"], {
		cwd: appDir,
		env,
		detached: true,
		stdio: ["ignore", "pipe", out],
	});
	server.stdout.on("data", (chunk) => fs.writeSync(out, chunk));
	if (server.pid) fs.writeFileSync(pidFile, String(server.pid));
	log(`next dev pid ${server.pid} on port ${PORT}`);
	stopServer = () => {
		try {
			process.kill(-server.pid, "SIGTERM");
		} catch {
			/* already gone */
		}
		fs.rmSync(pidFile, { force: true });
	};
	app.on("will-quit", () => stopServer());
	process.on("exit", () => stopServer());
	return server;
}

/** A launch that crashed leaves its next dev behind: stop it when the pid
 *  file still names our own next dev. */
async function stopStaleServer(pidFile, appDir, log) {
	const pid = Number(fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8"));
	fs.rmSync(pidFile, { force: true });
	if (!pid) return;
	const command = (await capture("/bin/ps", ["-o", "command=", "-p", String(pid)])) ?? "";
	if (!command.includes(path.join(appDir, "node_modules", "next"))) return;
	const group = ((await capture("/bin/ps", ["-A", "-o", "pid=,pgid="])) ?? "")
		.split("\n")
		.map((row) => row.trim().split(/\s+/).map(Number))
		.filter(([, pgid]) => pgid === pid)
		.map(([member]) => member);
	log(`stopping the next dev a previous launch left: ${pid}`);
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		/* already gone */
	}
	// macOS's caffeinate -w returns on the process's exit event; the
	// timeout is a limit, not a poll. Elsewhere it is missing and returns.
	await Promise.all(group.map((member) => capture("/usr/bin/caffeinate", ["-w", String(member)], { timeout: 5000 })));
}

/** Whether something already listens on the server's address. */
function portTaken(port) {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.once("error", () => resolve(true));
		probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(false)));
	});
}

function show(bodies) {
	for (const body of bodies.splice(0)) new Notification({ title: PRODUCT_NAME, body }).show();
}

/** Says what went wrong in one notification, then quits. */
function fail(reason, log, notices) {
	log(`failed: ${reason}`);
	stopServer();
	notices.push(`Could not open: ${reason}.`);
	void app.whenReady().then(() => {
		const note = new Notification({ title: PRODUCT_NAME, body: notices.join(" ") });
		notices.length = 0;
		// A limit, not a poll: quit once macOS took the notification.
		const quit = () => app.exit(1);
		note.once("show", () => setTimeout(quit, 1000));
		note.once("failed", quit);
		setTimeout(quit, 5000);
		note.show();
	});
}

module.exports = { launch };
