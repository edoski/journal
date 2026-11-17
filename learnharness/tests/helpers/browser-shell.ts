/** The app's frame in a real Chrome (puppeteer-core and the system Chrome):
 *  tests/helpers/app-shell-page.tsx bundled with esbuild, the app's
 *  stylesheet compiled for every class the bundle carries, served from a
 *  local server. A page opens as one of three windows: a plain browser, T3
 *  Code's preview (an Electron browser with no LearnHarness bridge), or the
 *  Mac app (its preload's bridge, `window.lh`, there before the page runs). */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { resolveChromeExecutablePath } from "../../src/agent/subagents/headless.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const main = readFileSync(`${root}electron/main.cjs`, "utf8");
const lights = main.match(/const TRAFFIC_LIGHTS = \{ x: ([\d.]+), y: ([\d.]+) \};/);
const lightSize = Number(main.match(/const LIGHT_SIZE = ([\d.]+);/)?.[1]);
/** The traffic lights' centre in the Mac app, from electron/main.cjs. */
export const LIGHTS_CENTRE = Number(lights?.[2]) + lightSize / 2;

/** T3 Code's preview: Electron's Chrome, as its user agent says. */
const T3_PREVIEW_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) t3code/0.0.0 Chrome/140.0.0.0 Electron/38.0.0 Safari/537.36";

export type Window = "browser" | "t3-preview" | "mac-app";

export interface Shell {
	open(window: Window, options?: { sidebar?: "open" | "folded"; reducedMotion?: boolean }): Promise<Page>;
	close(): Promise<void>;
}

/** `entry`, the page to bundle (the app's frame by default), and `ready`,
 *  the selector its first frame shows. */
export async function startShell({ entry = "tests/helpers/app-shell-page.tsx", ready = '[data-testid="sidebar"]' }: { entry?: string; ready?: string } = {}): Promise<Shell> {
	const bundle = await build({
		entryPoints: [`${root}${entry}`],
		bundle: true,
		write: false,
		format: "esm",
		platform: "browser",
		jsx: "automatic",
		tsconfig: `${root}tsconfig.json`,
		define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
		loader: { ".css": "empty" },
		logLevel: "error",
	});
	const js = bundle.outputFiles[0]!.text;
	const classes = new Scanner({}).scanFiles([{ content: js, extension: "js" }]);
	const compiler = await compile(readFileSync(`${root}app/globals.css`, "utf8"), { base: `${root}app/`, onDependency() {} });
	const css = optimize(compiler.build(classes)).code;
	const html = '<!doctype html><html lang="en" class="dark"><head><link rel="stylesheet" href="/shell.css"></head><body class="min-h-dvh antialiased"><div id="root"></div><script type="module" src="/shell.js"></script></body></html>';
	const server: Server = createServer((req, res) => {
		const path = new URL(req.url ?? "/", "http://x").pathname;
		const [type, body] = path === "/" ? ["text/html", html] : path === "/shell.js" ? ["text/javascript", js] : path === "/shell.css" ? ["text/css", css] : [null, null];
		if (type === null) {
			// The sidebar's reads: no server, so each fails as an offline app's would.
			res.writeHead(404).end();
			return;
		}
		res.writeHead(200, { "content-type": type }).end(body);
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const executablePath = resolveChromeExecutablePath();
	if (!executablePath) throw new Error("No Chrome: install Google Chrome or set CHROME_PATH");
	const browser: Browser = await puppeteer.launch({ executablePath, headless: true, args: ["--force-device-scale-factor=1"] });

	return {
		async open(window, { sidebar = "folded", reducedMotion = false } = {}) {
			const page = await browser.newPage();
			await page.setViewport({ width: 1512, height: 982 });
			// tsx names a test's functions with an `__name` helper, which a
			// function sent to page.evaluate carries into the page.
			await page.evaluateOnNewDocument("globalThis.__name = (fn) => fn");
			if (window !== "browser") await page.setUserAgent({ userAgent: T3_PREVIEW_UA });
			if (window === "mac-app") {
				await page.evaluateOnNewDocument((centre: number) => {
					(globalThis as unknown as { lh: unknown }).lh = { expandWindow() {}, onZoom: () => () => {}, getZoom: async () => 1, lightsCentre: centre };
				}, LIGHTS_CENTRE);
			}
			await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
			await page.goto(`${origin}/?open=${sidebar === "open" ? 1 : 0}`, { waitUntil: "load" });
			await page.waitForSelector(ready);
			// The provider's mount effects: the Mac app's class, then motion on.
			await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
			return page;
		},
		async close() {
			await browser.close();
			await new Promise((done) => server.close(done));
		},
	};
}
