/**
 * LearnHarness — the Electron shell (wrapper milestone, 2026-09-17).
 *
 * What this process is and is not:
 *   IS:  a thin launcher + security guard around the app's real server —
 *        `next build`'s standalone server.js (Next 16), spawned as a child
 *        on 127.0.0.1 with the LH_DATA_DIR seam.
 *   NOT: a host for any app logic. Everything — teacher turns, lesson
 *        digests, course maps — runs in the Next server, unchanged.
 *
 * Pattern (fact-checked 2026-09-17 against current Electron 44 / Next 16
 * docs — see .memory release-strategy + electron-wrapper notes):
 *   - spawn via process.execPath + ELECTRON_RUN_AS_NODE=1 (Electron's
 *     bundled Node 24; the runAsNode fuse must stay enabled);
 *   - the server dir ships UNPACKED via extraResources (asar archives are
 *     read-only and native .node/dylib can't dlopen from one);
 *   - all mutable state under userData (never inside the .app bundle —
 *     translocated apps are read-only);
 *   - no API key exists: model calls run only on the user's Claude plan,
 *     through their own `claude` CLI.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, powerMonitor, session, shell } = require("electron");
const { waitForServer } = require("./server-ready.cjs");
const { desktopAPIHeaders } = require("./desktop-api.cjs");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

// Mirrors SIDEBAR_AUTOCLOSE in components/sidebar.tsx — keep in sync (the
// renderer owns the number; this is the IPC widen target).
const SIDEBAR_AUTOCLOSE = 928;

const { PRODUCT_NAME } = require("./product.cjs");

// APP NAME → userData (owner, 2026-10-10): the Application Support dir is
// exactly "LearnHarness" in dev AND packaged. Packaged Electron would
// otherwise derive it from package.json "name" (now lowercase
// "learnharness"), and productName metadata alone doesn't reach app.name.
// Must run before the LH_DEV_URL suffix below — dev becomes
// "LearnHarness-dev".
app.setName(PRODUCT_NAME);
const DATA_DIR = () => path.join(app.getPath("userData"), "data");

/** The packaged standalone server (extraResources → Resources/server).
 *  In dev LH_DEV_URL short-circuits everything: no spawn, no packaging —
 *  the window points at the running `next dev` server (full HMR). */
function serverEntry() {
	// extraResources ships the whole .next payload under server/standalone/
	// (copied from .next with an explicit filter — see electron-builder.yml).
	return path.join(process.resourcesPath, "server", "standalone", "server.js");
}

// ─── Single instance: two instances would fight over the data dir ─────────
// ─── Browser-service helper (Wave E stage 3, owner 2026-10-10) ────────
// The render engines for agent jobs: PDFs and SVGs rasterize natively
// (pdfjs+Skia, resvg — no browser); DEMOS execute JS and need one. The
// app's own Chromium serves that via this helper — the server spawns
//   <this binary> --browser-service
// and connects over CDP (system Chrome stays the fallback). Chromium picks
// the port and prints "DevTools listening on ws://…" on stderr, which the
// server reads. Lifetime: parent IPC disconnect/death = quit.
// MUST run before the single-instance lock — a helper is a second
// instance of this very binary, and before the LH_DEV_URL redirect — the
// helper owns no user data at all.
if (process.argv.includes("--browser-service")) {
	(async () => {
		try {
			// Refuse to start a helper no parent owns.
			if (!process.channel || !process.connected) throw new Error("browser-service requires connected parent IPC");
			process.once("disconnect", () => app.quit());
			app.dock?.hide();
			// Must land before app-ready for Chromium to pick it up.
			app.commandLine.appendSwitch("remote-debugging-port", "0");
			await app.whenReady();
			// The page target CDP clients drive; hidden, and no
			// window-all-closed handler is installed here.
			const win = new BrowserWindow({ show: false });
			await win.loadURL("about:blank");
		} catch (err) {
			console.error("browser-service failed:", err);
			app.exit(1);
		}
	})();
} else {
	// Dev shell (LH_DEV_URL) runs BESIDE the packaged app, not instead of it:
	// its own userData so (a) the single-instance lock — checked below — doesn't
	// silently kill it, and (b) it never reads/writes the real app's
	// localStorage, auth.json, or logs. Must run before the lock check.
	if (process.env.LH_DEV_URL) {
		app.setPath("userData", `${app.getPath("userData")}-dev`);
	}

	// The whole normal boot — lock included — lives in this else: a helper is
	// a SECOND instance of this very binary on purpose (the running app owns
	// the lock), so it must never reach this check.
	if (!app.requestSingleInstanceLock()) {
		app.quit();
	} else {
		app.on("second-instance", () => {
			const win = BrowserWindow.getAllWindows()[0];
			if (win) {
				if (win.isMinimized()) win.restore();
				win.focus();
			}
		});
		main();
	}
}

let serverProcess = null;
// Per-launch request capability, never renderer state.
let desktopAPISecret = null;
let reopenWindow = null;
const trustedAppWindows = new Set();

// A GUI shell must never die to a stray exception (EPIPE dialogs, a race
// in an event handler): the window + child server are the product, and
// anything main-side is recoverable by logging it. Log-and-continue.
process.on("uncaughtException", (err) => {
	try {
		log(`uncaught: ${err?.stack ?? err}`);
	} catch {
		/* nothing left to write to */
	}
});

/** A free TCP port (listen(0) → the kernel assigns one). The close→spawn
 *  race is theoretical; localhost ports are rarely contended, and a failed
 *  spawn surfaces in the health check with the child's stderr in the log. */
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

function log(line) {
	const stamp = new Date().toISOString();
	// The stdout write is guarded (EPIPE hardening, 2026-10-10): a packaged
	// app launched with a consumer-owned pipe (a launcher that exits, a
	// piped run) must not die on its next log line when the pipe breaks.
	// The file below stays the durable channel.
	try {
		console.log(`[lh ${stamp}] ${line}`);
	} catch {
		/* stdout gone — userData/logs/main.log still carries it */
	}
	// Belt and braces: also append to userData/logs so a misbehaving child
	// can be diagnosed after the window is gone. Best effort only.
	try {
		const dir = path.join(app.getPath("userData"), "logs");
		fs.mkdirSync(dir, { recursive: true });
		fs.appendFileSync(path.join(dir, "main.log"), `[${stamp}] ${line}\n`);
	} catch {
		/* best effort */
	}
}

function startServer(port) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			// Next's native title setter otherwise checks this Node-mode
			// process in as a foreground app.
			["--require", path.join(process.resourcesPath, "server-title-guard.cjs"), serverEntry()],
			{
				cwd: path.dirname(serverEntry()),
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "1",
					NODE_ENV: "production",
					PORT: String(port),
					HOSTNAME: "127.0.0.1", // the server defaults to 0.0.0.0 — never
					LH_DATA_DIR: DATA_DIR(),
					LH_DESKTOP_SERVER: "1",
					LH_DESKTOP_API_SECRET: desktopAPISecret,
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		serverProcess = child;
		const fwd = (buf) => buf.toString().trimEnd().split("\n").forEach((l) => l && log(`server: ${l}`));
		child.stdout.on("data", fwd);
		child.stderr.on("data", fwd);
		child.on("exit", (code, signal) => {
			log(`server exited (code=${code} signal=${signal})`);
			serverProcess = null;
		});
		resolve(child);
	});
}

function killServer() {
	if (!serverProcess) return;
	const child = serverProcess;
	serverProcess = null;
	child.kill("SIGTERM");
	setTimeout(() => {
		try {
			child.kill("SIGKILL");
		} catch {
			/* already gone */
		}
	}, 3000);
}

/** The traffic lights' top-left corner in the window, in points, and each
 *  light's drawn diameter. Whole points: AppKit draws the lights on whole
 *  points (a y of 22.5 drew them at 23). Measured in the running app on
 *  16 Nov 2026: 14pt lights 9pt apart, the first at x 16 to 30, y 23 to 37,
 *  so their centre is y + LIGHT_SIZE / 2 = 30. The lights stay physical
 *  under zoom; the renderer gets that centre (--lh-lights-centre) and
 *  centres the folded sidebar's open button on it (app/globals.css). */
const TRAFFIC_LIGHTS = { x: 16, y: 23 };
const LIGHT_SIZE = 14;

/** Security posture (all defaults asserted explicitly; the guards are the
 *  checklist's own recommendations for localhost-app shells):
 *  - deny-by-default permission handler allowing only our loopback origin
 *    (Electron auto-approves by default, we do not);
 *  - will-navigate pinned to the app origin; window.open always denied —
 *    external links go to the real browser via shell.openExternal. */
function createWindow(url) {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		title: PRODUCT_NAME,
		// Merged chrome (owner, 2026-09-17): the system title bar is gone;
		// the app's own header bands ARE the title bar, the traffic lights
		// float over the sidebar's top band (TRAFFIC_LIGHTS, above).
		// Dragging comes from the renderer's .lh-drag bands (app/globals.css).
		titleBarStyle: "hiddenInset",
		trafficLightPosition: TRAFFIC_LIGHTS,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			preload: path.join(__dirname, "preload.cjs"),
			// The lights' centre, for the renderer's --lh-lights-centre.
			additionalArguments: [`--lh-lights-centre=${TRAFFIC_LIGHTS.y + LIGHT_SIZE / 2}`],
		},
		// Live-resize + first-paint flash (owner, 2026-09-17): during a resize
		// the native window surface changes size before Chromium's compositor
		// has a frame at the new size, and the gap shows the window's NATIVE
		// background — Electron's default is white, glaring on a dark app.
		// The app background (#141414) fills the lag instead. `show: false` +
		// ready-to-show is the same treatment for first paint: the window
		// appears only once the page has actually rendered.
		backgroundColor: "#141414",
		show: false,
		// Narrow-window behavior (owner, 2026-09-17): 640px is the floor —
		// below it even a wrapped chrome row gets cramped and the chat header
		// (lights gutter 92 + toggle + title) runs out of room. The sidebar
		// auto-closes below 928 = 640 + 288 (sidebar) in the renderer
		// (components/sidebar.tsx, SIDEBAR_AUTOCLOSE); its "lh:expand-window"
		// IPC widens the window back to that threshold.
		minWidth: 640,
		minHeight: 600,
	});

	trustedAppWindows.add(win);
	win.once("closed", () => trustedAppWindows.delete(win));
	const allowedOrigin = () => new URL(url).origin;
	// Deny-by-default; the ONLY grants are clipboard-sanitized-write and
	// local-fonts. The copy affordances in the transcript (md-blocks copy
	// corners) call navigator.clipboard.writeText(), which
	// Chromium only honors with that permission (chrome-melt tweaks wave,
	// 2026-09-19; before this grant every copy silently rejected). Still
	// loopback-origin only — Electron's default is auto-approve-everything,
	// and we do not ship that.
	// "local-fonts": the appearance section's reading-font picker (2026-09-26).
	const allowedPermissions = new Set(["clipboard-sanitized-write", "local-fonts"]);
	const fromOwnOrigin = (origin, permission) =>
		origin === allowedOrigin() && allowedPermissions.has(permission);
	session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
		const requestOrigin = details.requestingUrl ? new URL(details.requestingUrl).origin : null;
		callback(fromOwnOrigin(requestOrigin, permission));
	});
	session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => {
		return fromOwnOrigin(origin, permission);
	});

	win.webContents.on("will-navigate", (event, target) => {
		if (new URL(target).origin !== allowedOrigin()) {
			event.preventDefault();
			void shell.openExternal(target);
		}
	});
	win.webContents.setWindowOpenHandler(({ url: target }) => {
		void shell.openExternal(target);
		return { action: "deny" };
	});

	void win.loadURL(url);
	// Zoom truth reaches the renderer for EVERY load (reload, nav): the
	// renderer's --lh-zoom must never go stale. The fallback catcher below
	// covers ⌘= / layout variants the menu's ⌘Plus may not claim — menu-
	// claimed keys never reach before-input-event, so exactly one of the
	// two applies any given zoom keypress.
	win.webContents.on("did-finish-load", () => {
		win.webContents.send("lh:zoom", win.webContents.getZoomFactor());
	});
	win.webContents.on("before-input-event", (event, input) => {
		if (input.type !== "keyDown" || !(input.meta || input.control)) return;
		if (input.key === "=" || input.key === "+") zoomStep(win, +1);
		else if (input.key === "-") zoomStep(win, -1);
		else if (input.key === "0") applyZoom(win, 1);
		else return;
		event.preventDefault();
	});

	win.once("ready-to-show", () => win.show());
	return win;
}

/* ── Zoom (owner round 7, 2026-10-05): ⌘±/⌘0 as an OWNED ladder ──────────
 * The stock zoomIn/zoomOut roles change zoomLevel silently — the renderer
 * never learns the factor, and the native traffic lights (physical-fixed,
 * hiddenInset) drift out of relation to the scaled chrome: the graph
 * button rides away from them zoomed in, content slides under them
 * zoomed out. Here zoom is explicit: a factor ladder, applied through
 * setZoomFactor, and broadcast to the renderer ("lh:zoom" — it publishes
 * --lh-zoom so gutter lengths can divide by it and stay PHYSICAL-
 * constant). The traffic lights themselves stay at their construction
 * position (TRAFFIC_LIGHTS — Electron 44 has NO runtime setter, only
 * the BrowserWindow option), which is HIG-correct anyway: native lights
 * hug the window corner while the web chrome compensates around them.
 * Vertical note: at large factors the taller bands' content centers
 * drift below the fixed lights — accepted (the alternative, moving the
 * lights, is impossible without rebuilding the window). */
const ZOOM_LADDER = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

function zoomStep(win, dir) {
	const current = win.webContents.getZoomFactor();
	const next =
		dir > 0
			? ZOOM_LADDER.find((f) => f > current + 0.001) ?? ZOOM_LADDER[ZOOM_LADDER.length - 1]
			: [...ZOOM_LADDER].reverse().find((f) => f < current - 0.001) ?? ZOOM_LADDER[0];
	applyZoom(win, next);
}

function applyZoom(win, factor) {
	factor = Math.min(2, Math.max(0.75, factor)); // ladder clamps; ⌘0 = 1
	win.webContents.setZoomFactor(factor);
	win.webContents.send("lh:zoom", factor);
}

/** macOS needs an application menu with the Edit roles — without one,
 *  Cmd+C/V/A do nothing in the renderer. Everything else stays minimal. */
function installMenu() {
	const template = [
		{
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{ label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				// OWNED zoom (see applyZoom): the roles change zoomLevel
				// silently; these broadcast the factor and re-seat the
				// traffic lights. The renderer's --lh-zoom depends on
				// hearing every change.
				{
					label: "Actual Size",
					accelerator: "CommandOrControl+0",
					click: () => applyZoom(BrowserWindow.getAllWindows()[0], 1),
				},
				{
					label: "Zoom In",
					accelerator: "CommandOrControl+Plus",
					click: () => zoomStep(BrowserWindow.getAllWindows()[0], +1),
				},
				{
					label: "Zoom Out",
					accelerator: "CommandOrControl+-",
					click: () => zoomStep(BrowserWindow.getAllWindows()[0], -1),
				},
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
		{ role: "windowMenu" },
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ── Study notifications (Edo, 19 Nov 2026: "VERY sparingly") ─────────────
 * The renderer decides what to say, in Home's words
 * (components/desktop-notice-bridge.tsx); the shell only shows it, at most
 * once: today's plan once a day (the id names the day, kept in userData so
 * a relaunch never repeats it), work he started once per job, and each only
 * while no window of the app is focused: he is already looking at the app. macOS's own permission and Focus
 * apply. Every notice shown or held is logged (userData/logs/main.log). */

/** The day's plan already shown, by its id ("plan:2026-11-19"). */
function noticesFile() {
	return path.join(app.getPath("userData"), "notices.json");
}

function shownPlan() {
	try {
		return JSON.parse(fs.readFileSync(noticesFile(), "utf8")).plan ?? null;
	} catch {
		return null;
	}
}

/** Work notices shown in this run; a job finishes once, so a relaunch never repeats one. */
const shownNotices = new Set();
/** Notifications on screen: held so their click handlers outlive garbage collection. */
const liveNotices = new Set();

/** A click opens the place the notice names, in the app's window. */
function openNoticePlace(href, url) {
	const win = [...trustedAppWindows].find((w) => !w.isDestroyed());
	if (!win) {
		createWindow(new URL(href, url).toString());
		return;
	}
	if (win.isMinimized()) win.restore();
	win.show();
	win.focus();
	win.webContents.send("lh:open", href);
}

function showNotice(notice, url) {
	const { Notification } = require("electron");
	const { id, title, body, href, away } = notice ?? {};
	if (![id, title, body, href].every((v) => typeof v === "string") || !href.startsWith("/") || href.startsWith("//")) return;
	const plan = id.startsWith("plan:");
	if (shownNotices.has(id) || (plan && shownPlan() === id)) return log(`notice held: ${id} (already shown)`);
	if (away && BrowserWindow.getFocusedWindow()) return log(`notice held: ${id} (a window is focused)`);
	if (!Notification.isSupported()) return log(`notice held: ${id} (notifications unsupported)`);
	const shown = new Notification({ title, body });
	liveNotices.add(shown);
	shown.on("click", () => openNoticePlace(href, url));
	shown.on("close", () => liveNotices.delete(shown));
	shown.show();
	shownNotices.add(id);
	if (plan) {
		try {
			fs.writeFileSync(noticesFile(), JSON.stringify({ plan: id }));
		} catch (err) {
			log(`notices.json: ${err}`);
		}
	}
	log(`notice shown: ${id} "${title}" — ${body} → ${href}`);
}

/** The renderer's offers, from the app's own windows only, and the moments
 *  the app comes back into use: the Mac waking or unlocking. */
function installNotices(url) {
	const origin = new URL(url).origin;
	ipcMain.on("lh:notify", (event, notice) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win || !trustedAppWindows.has(win) || new URL(event.senderFrame?.url ?? "about:blank").origin !== origin) return;
		showNotice(notice, url);
	});
	const inUse = () => {
		for (const win of trustedAppWindows) if (!win.isDestroyed()) win.webContents.send("lh:in-use");
	};
	powerMonitor.on("resume", inUse);
	powerMonitor.on("unlock-screen", inUse);
}

async function main() {
	// macOS convention: the app stays resident, reactivated from the Dock.
	// Without a listener Electron quits when the last window closes.
	app.on("window-all-closed", () => {});

	// The child must not outlive us — cover every quit path.
	app.on("before-quit", killServer);
	process.on("exit", killServer);
	process.on("SIGHUP", killServer);

	await app.whenReady();
	// A machine that slept through midnight: the windows check the day again.
	powerMonitor.on("resume", () => {
		for (const win of BrowserWindow.getAllWindows()) win.webContents.send("lh:resume");
	});

	// Dev mode: point at a running `next dev` server (LH_DEV_URL) — no
	// spawn, no packaging, full HMR. The rest of this shell still applies
	// (guards, menu, single instance).
	const devUrl = process.env.LH_DEV_URL;
	const url = devUrl ?? `http://127.0.0.1:${await freePort()}`;
	// A dev server started with a capability (scripts/launcher) checks it like
	// the packaged one; plain `npm run desktop:dev` runs without one.
	desktopAPISecret = devUrl ? (process.env.LH_DESKTOP_API_SECRET ?? null) : randomBytes(32).toString("hex");
	if (desktopAPISecret) {
		const ownedOrigin = new URL(url).origin;
		// All URLs, not only /api: remove the header again on external redirects.
		session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
			callback({ requestHeaders: desktopAPIHeaders(details, ownedOrigin, desktopAPISecret, [...trustedAppWindows]) });
		});
	}
	if (!devUrl) {
		log(`starting server: ${serverEntry()}`);
		log(`data dir: ${DATA_DIR()}`);
		const server = await startServer(new URL(url).port);
		await waitForServer(server, url);
		log(`server up: ${url}`);
	} else {
		log(`dev mode: ${devUrl}`);
	}

	installMenu();

	// Sidebar-at-narrow-window (owner, 2026-09-17): the renderer auto-closes
	// the sidebar below SIDEBAR_AUTOCLOSE (928px); opening it again at that
	// width asks the window to widen instead — the layout never has to
	// accommodate a narrow window + open sidebar. Top-left stays fixed, the
	// window grows right. No-op when already wide.
	// The renderer's first paint can race did-finish-load — it asks for
	// the current factor itself (mirrors "lh:zoom" pushes).
	ipcMain.handle("lh:zoom:get", (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.getZoomFactor() ?? 1);
	// Context's Link a folder: the system folder picker; null when cancelled.
	ipcMain.handle("lh:pick-folder", async (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		const options = { properties: ["openDirectory"], buttonLabel: "Link" };
		const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
		return picked.canceled ? null : (picked.filePaths[0] ?? null);
	});
	ipcMain.on("lh:expand-window", (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win) return;
		const { x, y, width, height } = win.getBounds();
		const target = SIDEBAR_AUTOCLOSE;
		if (width < target) win.setBounds({ x, y, width: target, height });
	});
	reopenWindow = () => createWindow(url);
	installNotices(url);
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) reopenWindow();
	});
	createWindow(url);
	log(`window open: ${url}`);
}