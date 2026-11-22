// What the installed .app runs on each launch (its own main, app/main.cjs,
// loads this file from the checkout, so a merge into main changes it too):
//   1. update the checkout by the rule in update.cjs, then reinstall the
//      packages when package-lock.json changed;
//   2. start `next dev` on PORT, as `npm run desktop:dev` does, so pages,
//      server routes and the engine reload live;
//   3. load the app's own Electron shell (electron/main.cjs) against it.
// Everything up to loading the shell runs before Electron is ready: the shell
// names the app and its userData folder at load, which must happen first.
// A second launch never reaches this file: macOS focuses the running app.
const { app, Notification, session } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { removeRenamedBundles } = require("./bundles.cjs");
const { updateCheckout } = require("./update.cjs");
const product = require.resolve("../../electron/product.cjs");
const serverReady = require.resolve("../../electron/server-ready.cjs");
const { PRODUCT_NAME, DATA_FOLDER, nameApp } = require(product);
const { waitForServer } = require(serverReady);

/** Clear of the Amoreg dev servers (3000 to 3210, 5173, 5733). */
const PORT = Number(process.env.LH_LAUNCH_PORT) || 4747;
const LOG_DIR = process.env.LH_LAUNCH_LOGS || path.join(os.homedir(), "Library", "Logs", DATA_FOLDER);

/** Stops this launch's next dev; set once it starts. */
let stopServer = () => {};

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
	// Until the shell loads, a failed launch must not leave a userData folder
	// named after the launcher's package.json.
	nameApp(app, process.env);

	try {
		const env = shellEnvironment(log);
		const update = updateCheckout(checkout, { env, log });
		if (update.skipped) notify(`Opened without updating: ${update.skipped}.`);
		else log(update.updated ? `updated ${update.from} -> ${update.to}` : "already on origin/main");
		installPackagesIfStale(appDir, env, log);
		if (!fs.existsSync(path.join(appDir, "node_modules", "electron", "path.txt"))) {
			run("node", ["node_modules/electron/install.js"], appDir, env, log);
		}
		// The update may have renamed the app: the .app follows the name it brought.
		delete require.cache[product];
		const { PRODUCT_NAME: name } = require(product);
		if (bundle && reinstallStaleBundle({ appDir, checkout, bundle, name, env, log })) return;
		if (bundle) removeRenamedBundles(bundle, name, log);

		const url = `http://127.0.0.1:${PORT}`;
		const pidFile = path.join(LOG_DIR, `next-dev-${PORT}.pid`);
		stopStaleServer(pidFile, appDir, log);
		if (portTaken(PORT)) throw new Error(`port ${PORT} is in use by another program, so ${PRODUCT_NAME} can't start its server`);
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

		void app.whenReady().then(() => {
			// The shell opens its window at once; its page requests wait here
			// until the server says it is ready, instead of failing to connect.
			const requests = session.defaultSession.webRequest;
			requests.onBeforeRequest({ urls: [`${url}/*`] }, (_details, callback) =>
				ready.then(() => callback({}), () => callback({ cancel: true })),
			);
			void ready.then(() => requests.onBeforeRequest(null), () => {});
			show(notices);
		});
		process.env.LH_DEV_URL = url;
		process.env.LH_DESKTOP_API_SECRET = secret;
		// The shell must get the updated copies of the files this launcher
		// loaded before the update, not Node's cached ones.
		for (const loaded of [product, serverReady]) delete require.cache[loaded];
		require(path.join(appDir, "electron", "main.cjs"));
	} catch (error) {
		fail(error.message, log, notices);
	}
}

/** The PATH his login shell sets (nvm's node, Homebrew's claude): an app
 *  opened from Spotlight gets launchd's bare PATH instead. */
function shellEnvironment(log) {
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const shell = os.userInfo().shell || "/bin/zsh";
	const mark = "__LH_PATH__";
	const result = spawnSync(shell, ["-ilc", `printf '${mark}%s${mark}' "$PATH"`], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] });
	const found = (result.stdout ?? "").split(mark)[1];
	if (found) env.PATH = found;
	else log(`login shell gave no PATH; keeping ${env.PATH}`);
	return env;
}

function run(command, args, cwd, env, log) {
	log(`run: ${command} ${args.join(" ")}`);
	const out = fs.openSync(path.join(LOG_DIR, "launcher.log"), "a");
	try {
		const result = spawnSync(command, args, { cwd, env, stdio: ["ignore", out, out], timeout: 15 * 60_000 });
		if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.error?.message ?? `exit ${result.status}`}). See ${LOG_DIR}`);
	} finally {
		fs.closeSync(out);
	}
}

/** Reinstalls unless the last install that finished was of this very
 *  package-lock.json, so a failed install or a pull made elsewhere heals on
 *  the next launch. npm blocks esbuild's install script and electron ships
 *  none, so both binaries are fetched by hand. */
function installPackagesIfStale(appDir, env, log) {
	const stamp = path.join(appDir, "node_modules", ".lh-launcher-installed");
	const lock = createHash("sha256").update(fs.readFileSync(path.join(appDir, "package-lock.json"))).digest("hex");
	if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === lock) return;
	run("npm", ["ci", "--no-audit", "--no-fund"], appDir, env, log);
	run("node", ["node_modules/esbuild/install.js"], appDir, env, log);
	run("node", ["node_modules/electron/install.js"], appDir, env, log);
	fs.writeFileSync(stamp, lock);
}

/** The .app carries its own copy of Electron and the app's name. When main
 *  moved to another Electron version or renamed the app, rebuild the .app
 *  from the checkout and open the new one. */
function reinstallStaleBundle({ appDir, checkout, bundle, name, env, log }) {
	const wanted = JSON.parse(fs.readFileSync(path.join(appDir, "node_modules", "electron", "package.json"), "utf8")).version;
	const named = `${name}.app`;
	if ((wanted === process.versions.electron && path.basename(bundle) === named) || process.argv.includes("--lh-reinstalled")) return false;
	log(`${path.basename(bundle)} on Electron ${process.versions.electron} -> ${named} on ${wanted}: reinstalling`);
	run("/bin/bash", [path.join(appDir, "scripts", "launcher", "install.sh"), "--checkout", checkout, "--dest", path.dirname(bundle)], appDir, env, log);
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
function stopStaleServer(pidFile, appDir, log) {
	const pid = Number(fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8"));
	fs.rmSync(pidFile, { force: true });
	if (!pid) return;
	const command = spawnSync("/bin/ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).stdout ?? "";
	if (!command.includes(path.join(appDir, "node_modules", "next"))) return;
	log(`stopping the next dev a previous launch left: ${pid}`);
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		/* already gone */
	}
	// Bounded: the group is killed, so this only waits for the kernel to reap it.
	spawnSync("/bin/sh", ["-c", `while kill -0 -${pid} 2>/dev/null; do sleep 0.1; done`], { timeout: 5000 });
}

function portTaken(port) {
	return spawnSync("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).stdout.trim() !== "";
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
