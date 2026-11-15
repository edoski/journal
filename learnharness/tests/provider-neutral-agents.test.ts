/**
 * Background agent credential regression: the visual maker and the pdf
 * reader run on the Agent SDK with no credential of the app's own. All
 * credentials here are synthetic; fetch is CLOSED (never delegates).
 */
import assert from "node:assert/strict";
import path from "node:path";
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import {
	createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall,
	type JsonObject, type TranscriptContext, type Usage,
} from "@earendil-works/pi-ai";
import { claudeEngine } from "../src/agent/models.ts";
import { runVisualMaker } from "../src/agent/subagents/visual-maker.ts";
import { runPdfReaderAgent } from "../src/agent/subagents/pdf-reader.ts";
import type { HeadlessApi } from "../src/agent/subagents/headless.ts";
import type { SdkEngine } from "../src/agent/sdk/engine.ts";
import { fakeSdk } from "./helpers/fake-sdk.ts";

const OR_KEY = "dummy-openrouter-MUST-NOT-REACH-other-endpoints";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="white"/></svg>';
const FIXTURE = path.join(import.meta.dirname, "fixtures", "sample-3page.pdf");
/** A copy outside the checkout: a checkout under a protected home folder
 *  (an agent worktree in ~/.t3) is itself off-limits to the file tools. */
const SOURCE = path.join(realpathSync.native(mkdtempSync(path.join(tmpdir(), "lh-pdf-src-"))), "sample-3page.pdf");
copyFileSync(FIXTURE, SOURCE);
process.on("exit", () => rmSync(path.dirname(SOURCE), { recursive: true, force: true }));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64");
const FINAL = "Verified offline output (p. 1). Pages consulted: 1";
const LOOPS = ["visual", "pdf"] as const;
type Loop = typeof LOOPS[number];
type Call = { name: string; args: JsonObject };

// Replacing rather than extending env also isolates secondary tokens (including
// ANTHROPIC_AUTH_TOKEN/OAUTH_TOKEN and CLAUDE_CODE_OAUTH_TOKEN), SDK base-URL
// overrides, cloud credentials, profiles, and LH_IGNORE_ENV_KEYS. No .env loads.
async function isolated<T>(env: Record<string, string>, run: () => Promise<T>): Promise<T> {
	const previous = process.env;
	const fetch = globalThis.fetch;
	globalThis.fetch = async () => { throw new Error("CLOSED: unexpected fetch"); };
	process.env = { NODE_ENV: "test", HOME: "/nonexistent/provider-neutral-test-home", ...env };
	try {
		return await run();
	} finally {
		process.env = previous;
		globalThis.fetch = fetch;
	}
}

function callsFor(loop: Loop, round: number): Call[] {
	if (round === 2) return loop === "visual" ? [{ name: "finish", args: { notes: FINAL } }] : [];
	if (loop === "visual") return round === 0
		? [{ name: "write_svg", args: { svg: SVG } }]
		: [{ name: "render_svg", args: {} }];
	return round === 0
		? [{ name: "pdf_info", args: {} }]
		: [{ name: "pdf_extract", args: { pages: "1" } }, { name: "pdf_render", args: { pages: "1", dpi: 100 } }];
}

function fakeHeadless(renders: string[]): HeadlessApi {
	return {
		available: () => true,
		unavailableReason: () => null,
		runDemo: async () => { throw new Error("unexpected demo"); },
		renderSvg: async (svg) => {
			assert.equal(svg, SVG);
			renders.push("svg");
			return PNG;
		},
		renderPdfPages: async (file, pages, opts) => {
			assert.equal(file, SOURCE);
			assert.deepEqual(pages, [1]);
			assert.equal(opts?.dpi, 100);
			renders.push("pdf:1");
			return [{ page: 1, png: PNG }];
		},
	};
}

async function runLoop(loop: Loop, engine: SdkEngine, signal = new AbortController().signal) {
	const renders: string[] = [];
	const activities: string[] = [];
	const usages: Usage[] = [];
	const opts = {
		engine, headless: fakeHeadless(renders), abortSignal: signal,
		onActivity: (line: string) => activities.push(line),
		onUsage: (usage: Usage) => usages.push(usage),
	};
	const result = loop === "visual"
		? await runVisualMaker({ brief: "A white square, no external resources" }, opts)
		: await runPdfReaderAgent({ path: SOURCE, question: "Read page 1" }, opts);
	return { result, renders, activities, usages };
}

function assertSuccess(loop: Loop, run: Awaited<ReturnType<typeof runLoop>>) {
	if ("svg" in run.result) {
		assert.equal(run.result.svg, SVG, JSON.stringify(run.result));
		assert.equal(run.result.notes, FINAL);
	} else {
		assert.equal(run.result.brief, FINAL);
		assert.equal(run.result.path, SOURCE);
		assert.deepEqual(run.result.pagesRead, [1]);
		assert.deepEqual(run.result.pagesConsulted, [1]);
	}
	assert.deepEqual(run.renders, [loop === "visual" ? "svg" : "pdf:1"]);
	assert.equal(run.usages.length, 3, "one usage callback per successful stream round");
	assert.ok(run.activities.some((line) => line.startsWith(loop === "visual" ? "write_svg:" : "pdf_info:")));
	assert.ok(run.activities.some((line) => line.startsWith(loop === "visual" ? "render_svg:" : "pdf_render:")));
}

/** The scripted rounds twice over (two runs), each request recorded. */
function recordingFake(loop: Loop) {
	const faux = createFauxCore({ tokenSize: { min: 64, max: 64 } });
	faux.setResponses([0, 1, 2, 0, 1, 2].map((round) => {
		const calls = callsFor(loop, round);
		return fauxAssistantMessage(calls.length
			? calls.map((c, i) => fauxToolCall(c.name, c.args, { id: `call_${round}_${i}` }))
			: [fauxText(FINAL)], { stopReason: calls.length ? "toolUse" : "stop" });
	}));
	const requests: TranscriptContext[] = [];
	return { fake: fakeSdk({ model: faux.models[0], streamFn: (model, context, options) => { requests.push(context); return faux.streamSimple(model, context, options); } }), requests };
}

// All global/env cases in this file are deliberately serial.
describe("provider-neutral background agents", { concurrency: false }, () => {
	for (const loop of LOOPS) {
		it(`${loop}: no run carries a credential of the app's own, and each run is a separate unsaved conversation`, async () => {
			await isolated({ OPENROUTER_API_KEY: OR_KEY }, async () => {
				const { fake, requests } = recordingFake(loop);
				const run = await runLoop(loop, fake.engine);
				assertSuccess(loop, run);
				assert.equal(requests.length, 3);
				assert.match(JSON.stringify(requests[2]!.messages), /image\/png/, "the render came back as an image tool result");
				assert.match(JSON.stringify(requests[2]!.messages), /toolResult/);
				const second = await runLoop(loop, fake.engine);
				assertSuccess(loop, second);
				assert.equal(requests.length, 6);
				assert.equal(fake.calls.length, 2, "one Claude Code run per operation");
				for (const options of fake.calls) {
					for (const key of ["env", "apiKey", "getApiKey", "auth", "headers"]) {
						assert.ok(!Object.hasOwn(options, key), `${loop} must not supply ${key}: credentials come only from the account's launch`);
					}
					assert.equal(options.persistSession, false, "a background run keeps no session");
					assert.equal(options.resume, undefined, "a separate operation must not reuse a conversation");
				}
				assert.ok(!JSON.stringify(requests).includes(OR_KEY));
			});
		});

		it(`${loop}: abort still reaches the run and retains the loop's failure semantics`, async () => {
			await isolated({ OPENROUTER_API_KEY: OR_KEY }, async () => {
				const faux = createFauxCore({});
				faux.setResponses([fauxAssistantMessage([fauxText("must not be delivered")])]);
				const controller = new AbortController();
				controller.abort();
				const run = await runLoop(loop, fakeSdk({ model: faux.models[0], streamFn: faux.streamSimple }).engine, controller.signal);
				const failure = "svg" in run.result ? run.result.notes : run.result.brief;
				assert.match(failure ?? "", /crashed — aborted/);
				assert.deepEqual(run.renders, []);
				assert.equal(run.usages.length, 0);
			});
		});
	}

	it("an API-key provider never runs, whatever keys the environment holds", async () => {
		await isolated({ OPENROUTER_API_KEY: OR_KEY, OPENAI_API_KEY: "dummy-openai", ANTHROPIC_API_KEY: "dummy-anthropic", GEMINI_API_KEY: "dummy-google" }, async () => {
			for (const provider of ["openrouter", "openai", "anthropic", "google", "opencode-go"]) {
				assert.throws(() => claudeEngine(provider), /no claude-opus-5-5 on Claude account/, provider);
			}
		});
	});
});
