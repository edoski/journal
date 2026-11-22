/** Platform window chrome + packaging policy, without launching Electron. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const mainFile = fileURLToPath(new URL("../electron/main.cjs", import.meta.url));
const mainSource = readFileSync(mainFile, "utf8");
const mainRequire = createRequire(mainFile);

/** Decline the single-instance lock so normal boot never spawns a server.
 * Then call the REAL createWindow with a stub Electron API and inspect its
 * constructor options. No rewritten copy of the production logic. */
function windowOptions(env: Record<string, string> = {}) {
	class FakeWindow {
		constructor(readonly options: unknown) {}
		webContents = { on() {}, setWindowOpenHandler() {} };
		loadURL() {}
		once() {}
	}
	const electron = {
		app: { setName() {}, getPath: () => "/fixture/LearnHarness", setPath() {}, requestSingleInstanceLock: () => false, quit() {} },
		BrowserWindow: FakeWindow,
		session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
	};
	const context = {
		require: (id: string) => id === "electron" ? electron : mainRequire(id),
		process: { argv: [], env, on() {} },
		__dirname: dirname(mainFile),
	};
	runInNewContext(mainSource, context, { filename: mainFile });
	const win = runInNewContext('createWindow("http://127.0.0.1:9000")', context) as FakeWindow;
	// The options originate in a VM realm; normalize prototypes for assertions.
	return JSON.parse(JSON.stringify(win.options));
}

describe("desktop window chrome", () => {
	it("keeps the proven traffic lights in a sandboxed window", () => {
		const options = windowOptions();
		assert.equal(options.titleBarStyle, "hiddenInset");
		assert.deepEqual(options.trafficLightPosition, { x: 16, y: 23 });
		assert.deepEqual(options.webPreferences.additionalArguments, ["--lh-lights-centre=30"], "the renderer gets the lights' centre: 23 + 14 / 2");
		assert.equal(options.webPreferences.contextIsolation, true);
		assert.equal(options.webPreferences.sandbox, true);
		assert.equal(options.webPreferences.nodeIntegration, false);
	});

	it("preload exposes its small API without exposing Node/Electron to the renderer", () => {
		let bridge: Record<string, unknown> = {};
		const context = {
			require: () => ({
				contextBridge: {
					exposeInMainWorld(name: string, api: Record<string, unknown>) {
						assert.equal(name, "lh");
						bridge = api;
					},
				},
				ipcRenderer: { on() {} },
			}),
			// A sandboxed preload's process carries the window's arguments.
			process: { argv: ["electron", "--lh-lights-centre=30"] },
		};
		runInNewContext(readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8"), context);
		assert.deepEqual(Object.keys(bridge).sort(), [
			"expandWindow", "getZoom", "lightsCentre", "notify", "onInUse", "onOpen", "onResume", "onZoom", "pathForFile", "pickFolder",
		]);
		assert.equal(bridge.lightsCentre, 30);
	});
});

describe("desktop packaging policy", () => {
	const yaml = require("js-yaml") as { load(source: string): Record<string, any> };
	const config = yaml.load(readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8"));

	it("configuration is accepted by the INSTALLED electron-builder schema", async () => {
		const { validateConfiguration } = require("app-builder-lib/out/util/config/config.js");
		await validateConfiguration(config, { isEnabled: false });
	});

	it("ships only the Mac arm64 dmg", () => {
		assert.deepEqual(config.mac.target, [
			{ target: "dmg", arch: ["arm64"] },
		]);
		for (const platform of ["win", "nsis", "linux"]) assert.equal(platform in config, false, platform);
		assert.equal(config.publish, null, "no update feed: the fork ships no releases");
	});
});

describe("workflow action versions", () => {
	type Step = { uses?: string; with?: Record<string, unknown> };
	type Workflow = { jobs: Record<string, { steps: Step[] }> };
	const yaml = require("js-yaml") as { load(source: string): Workflow };

	it("the journal CI uses supported Action runtimes without changing the app's Node 26", () => {
		const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"));
		const expected = ["actions/checkout@v7", "actions/setup-node@v7", "actions/setup-python@v6"];
		const observed = new Set<string>();
		for (const job of Object.values(workflow.jobs)) {
			for (const step of job.steps) {
				if (!step.uses) continue;
				assert.ok(expected.includes(step.uses), `unexpected Action reference: ${step.uses}`);
				observed.add(step.uses);
				if (step.uses === "actions/setup-node@v7") {
					assert.equal(step.with?.["node-version"], "26");
					assert.equal(step.with?.cache, "npm");
				}
			}
		}
		assert.deepEqual([...observed].sort(), expected.sort());
	});
});

describe("journal CI standalone job", () => {
	type Step = { run?: string; env?: Record<string, string> };
	type Workflow = { jobs: Record<string, { steps: Step[]; "runs-on": string; strategy?: unknown }> };
	const yaml = require("js-yaml") as { load(source: string): Workflow };
	const job = yaml.load(readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8")).jobs.standalone;

	it("runs the native renderer tests in Electron's Node and boot-smokes the payload under Electron", () => {
		assert.ok(job);
		const native = job.steps.find(step => step.run?.includes("pdf-native-render.test.ts"));
		assert.ok(native?.run?.startsWith("npx electron --import tsx --test "));
		assert.equal(native?.env?.ELECTRON_RUN_AS_NODE, "1");
		assert.ok(job.steps.some(step => step.run === "node scripts/smoke-server.mjs --electron"));
		assert.equal(job["runs-on"], "macos-15");
		assert.equal(job.strategy, undefined, "one Mac leg, no platform matrix");
	});
});

