/** Offline integration contracts at the provider boundary: real shared image
 * processing, faux model streams, synthetic rasters, and fake headless I/O.
 * No real browser, provider, learner data, or ambient credentials are used. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import * as photon from "@silvia-odwyer/photon-node";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxText,
	fauxToolCall,
	type FauxResponseStep,
	type ImageContent,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import type { SdkEngine } from "../src/agent/models.ts";
import { fakeEngine, type ScriptedModel } from "./helpers/fake-sdk.ts";
import type { ModelImageResizeOptions } from "../src/agent/image-processing/index.ts";
import type { HeadlessApi } from "../src/agent/subagents/headless.ts";

// Install storage/auth seams BEFORE importing the agent composition root.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-agent-image-paths-"));
const originalEnv = process.env;
const originalFetch = globalThis.fetch;
fs.mkdirSync(path.join(scratch, "home"));
process.env = {
	...(originalEnv.NODE_TEST_CONTEXT ? { NODE_TEST_CONTEXT: originalEnv.NODE_TEST_CONTEXT } : {}),
	...(originalEnv.NODE_OPTIONS ? { NODE_OPTIONS: originalEnv.NODE_OPTIONS } : {}),
	NODE_ENV: "test",
	HOME: path.join(scratch, "home"),
	LH_DATA_DIR: path.join(scratch, "data"),
};
globalThis.fetch = async () => { throw new Error("CLOSED: unexpected network request"); };
after(() => {
	process.env = originalEnv;
	globalThis.fetch = originalFetch;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { runPdfReaderAgent } = await import("../src/agent/subagents/pdf-reader.ts");
const { runVisualMaker } = await import("../src/agent/subagents/visual-maker.ts");

const PDF = path.join(import.meta.dirname, "fixtures", "sample-3page.pdf");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4800" height="120" viewBox="0 0 4800 120"><rect width="4800" height="120" fill="white"/></svg>';
const CUSTOM_RESIZE = { maxWidth: 320, maxHeight: 200 };

function png(width: number, height: number): Buffer {
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");
	context.fillStyle = "#336699";
	context.fillRect(0, 0, width, height);
	return canvas.toBuffer("image/png");
}

function dimensions(image: ImageContent): { width: number; height: number } {
	const decoded = photon.PhotonImage.new_from_byteslice(Buffer.from(image.data, "base64"));
	try {
		return { width: decoded.get_width(), height: decoded.get_height() };
	} finally { decoded.free(); }
}

function images(context: TranscriptContext): ImageContent[] {
	return context.messages.flatMap((message) => Array.isArray(message.content)
		? message.content.filter((part): part is ImageContent => part.type === "image")
		: []);
}

function text(context: TranscriptContext): string {
	return context.messages.map((message) => typeof message.content === "string"
		? message.content
		: message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n")).join("\n");
}

function scripted(steps: FauxResponseStep[], resize?: ModelImageResizeOptions, vision = true) {
	const faux = createFauxCore({ tokenSize: { min: 64, max: 64 } });
	faux.setResponses(steps);
	const base = faux.getModel();
	const model: SdkEngine["model"] = {
		...base,
		input: vision ? ["text", "image"] : ["text"],
		...(resize ? { inputLimits: { ...base.inputLimits, images: { ...base.inputLimits?.images, resize } } } : {}),
	};
	const requests: TranscriptContext[] = [];
	const scriptedModel: ScriptedModel = {
		model,
		streamFn: (model, context, options) => {
			// Snapshot the actual provider-facing context, not mutable agent state.
			requests.push(structuredClone(context));
			return faux.streamSimple(model, context, options);
		},
	};
	return { engine: fakeEngine(scriptedModel), requests };
}

function fakeHeadless(rendered: Buffer | ((page: number) => Buffer)) {
	const svgCalls: string[] = [];
	const pdfCalls: number[][] = [];
	const headless: HeadlessApi = {
		available: () => true,
		unavailableReason: () => null,
		runDemo: async () => { throw new Error("unexpected browser execution"); },
		renderSvg: async (svg) => {
			svgCalls.push(svg);
			return typeof rendered === "function" ? rendered(1) : rendered;
		},
		renderPdfPages: async (_file, pages) => {
			pdfCalls.push([...pages]);
			return pages.map((page) => ({ page, png: typeof rendered === "function" ? rendered(page) : rendered }));
		},
	};
	return { headless, svgCalls, pdfCalls };
}

function assertProcessedImage(context: TranscriptContext, expected: { width: number; height: number }, raw: Buffer): void {
	const parts = images(context);
	assert.equal(parts.length, 1, "exactly one successful image reaches the faux provider");
	assert.deepEqual(dimensions(parts[0]!), expected);
	assert.ok(Buffer.byteLength(parts[0]!.data, "utf8") < 4.5 * 1024 * 1024);
	assert.notEqual(parts[0]!.data, raw.toString("base64"), "the oversized raw raster is never sent");
	assert.match(text(context), /\[Image: original \d+x\d+, displayed at \d+x\d+\. Multiply coordinates by/);
}

test("PDF reader preserves both processed image outputs from multiple render calls in one batch", async () => {
	const wide = png(4800, 120);
	const tall = png(120, 4800);
	const { headless, pdfCalls } = fakeHeadless((page) => page === 1 ? wide : tall);
	const { engine, requests } = scripted([
		fauxAssistantMessage([
			fauxToolCall("pdf_render", { pages: "1", dpi: 150 }, { id: "batch-render-1" }),
			fauxToolCall("pdf_render", { pages: "2", dpi: 150 }, { id: "batch-render-2" }),
		], { stopReason: "toolUse" }),
		fauxAssistantMessage([fauxText("Both rendered pages are visible (p. 1, p. 2). Pages consulted: 1, 2")]),
	]);
	const result = await runPdfReaderAgent({ path: PDF, question: "Compare the two figures." }, { engine, headless });
	assert.equal(requests.length, 2);
	assert.deepEqual(pdfCalls, [[1], [2]]);
	const visible = requests[1]!;
	const parts = images(visible);
	assert.equal(parts.length, 2, "the second render call must not overwrite the first call's images");
	assert.deepEqual(parts.map(dimensions), [{ width: 2000, height: 50 }, { width: 50, height: 2000 }]);
	for (let i = 0; i < parts.length; i++) {
		assert.ok(parts[i]!.data.length < 4.5 * 1024 * 1024);
		assert.notEqual(parts[i]!.data, [wide, tall][i]!.toString("base64"));
	}
	const renders = visible.messages.slice(-2);
	assert.deepEqual(renders.map((message) => message.role), ["toolResult", "toolResult"], "each render call's pages ride its own tool result");
	assert.deepEqual(renders.map((message) => (message.content as { type: string; text?: string }[]).filter((part) => part.type === "text").map((part) => part.text!.split("\n")[0])), [
		["Rendered 1 page(s) at 150 DPI, in order. Read the images carefully (equations, diagrams, layout).", "Page 1"],
		["Rendered 1 page(s) at 150 DPI, in order. Read the images carefully (equations, diagrams, layout).", "Page 2"],
	]);
	assert.deepEqual(renders.map((message) => (message.content as { type: string }[]).filter((part) => part.type === "image").length), [1, 1]);
	assert.deepEqual(result.pagesRead, [1, 2]);
	assert.deepEqual(result.pagesConsulted, [1, 2]);
});

for (const [label, resize, expected] of [
	["native defaults", undefined, { width: 2000, height: 50 }],
	["active-model overrides", CUSTOM_RESIZE, { width: 320, height: 8 }],
] as const) {
	test(`PDF reader sends processed renders using ${label}; failed page is not counted`, async () => {
		const bytes = png(4800, 120);
		const { headless, pdfCalls } = fakeHeadless((page) => page === 1 ? bytes : Buffer.from("invalid rendered page"));
		const { engine, requests } = scripted([
			fauxAssistantMessage([fauxToolCall("pdf_render", { pages: "1-2", dpi: 150 }, { id: "render-1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxText("The visible figure is on page 1 (p. 1). Pages consulted: 1")]),
		], resize);
		const result = await runPdfReaderAgent({ path: PDF, question: "Inspect the page figure." }, { engine, headless });
		assert.equal(requests.length, 2);
		assert.deepEqual(pdfCalls, [[1, 2]]);
		assertProcessedImage(requests[1]!, expected, bytes);
		assert.match(text(requests[1]!), /Page 2: \[Image omitted:/);
		assert.deepEqual(result.pagesRead, [1]);
		assert.deepEqual(result.pagesConsulted, [1]);
		assert.match(result.brief, /visible figure/);
		const render = requests[1]!.messages.at(-1)!;
		assert.equal(render.role, "toolResult", "processed page images ride the render's tool result");
		assert.equal((render.content as { type: string }[]).filter((part) => part.type === "image").length, 1);
	});

	for (const gated of [false, true]) {
		test(`visual maker ${gated ? "finish-gate" : "explicit render_svg"} path processes images using ${label}`, async () => {
			const bytes = png(4800, 120);
			const { headless, svgCalls } = fakeHeadless(bytes);
			const steps: FauxResponseStep[] = gated ? [
				fauxAssistantMessage([
					fauxToolCall("write_svg", { svg: SVG }, { id: "write-1" }),
					fauxToolCall("finish", { notes: "Premature notes without inspection." }, { id: "finish-1" }),
				], { stopReason: "toolUse" }),
				fauxAssistantMessage([fauxToolCall("render_svg", {}, { id: "render-1" })], { stopReason: "toolUse" }),
				fauxAssistantMessage([fauxToolCall("finish", { notes: "Confirmed after inspecting the final render." }, { id: "finish-2" })], { stopReason: "toolUse" }),
			] : [
				fauxAssistantMessage([
					fauxToolCall("write_svg", { svg: SVG }, { id: "write-1" }),
					fauxToolCall("render_svg", {}, { id: "render-1" }),
				], { stopReason: "toolUse" }),
				fauxAssistantMessage([fauxText("Confirmed after inspecting the render.")]),
			];
			const { engine, requests } = scripted(steps, resize);
			const result = await runVisualMaker({ brief: "One precise synthetic figure." }, { engine, headless });
			assert.equal(requests.length, gated ? 3 : 2);
			assert.deepEqual(svgCalls, [SVG]);
			assertProcessedImage(requests.at(-1)!, expected, bytes);
			assert.equal(result.svg, SVG);
			assert.match(result.notes!, /^Confirmed after inspecting/);
			const render = requests.at(-1)!.messages.at(-1)!;
			assert.equal(render.role, "toolResult", "the render reaches the model as the render call's result");
			assert.match(text({ messages: [render] } as TranscriptContext), /Here is the current render of your SVG/);
			if (gated) {
				assert.deepEqual(images(requests[1]!), [], "premature finish did not see an image yet");
				assert.match(text(requests[1]!), /you have not looked at a render of the SVG as it now stands/);
			}
		});
	}
}

for (const gated of [false, true]) {
	test(`visual maker ${gated ? "finish-gate" : "explicit render_svg"} processing failure never verifies or delivers the SVG`, async () => {
		const { headless, svgCalls } = fakeHeadless(Buffer.from("corrupt render"));
		const steps: FauxResponseStep[] = [
			fauxAssistantMessage([
				fauxToolCall("write_svg", { svg: SVG }, { id: "write-1" }),
				fauxToolCall("render_svg", {}, { id: "render-1" }),
				...(gated ? [fauxToolCall("finish", { notes: "Unverified notes." }, { id: "finish-1" })] : []),
			], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxText("Unverified claim that the picture is correct.")]),
		];
		const { engine, requests } = scripted(steps);
		const activity: string[] = [];
		const result = await runVisualMaker({ brief: "One synthetic figure." }, { engine, headless, onActivity: (line) => activity.push(line) });
		assert.equal(requests.length, 2);
		assert.ok(requests.every((request) => images(request).length === 0));
		assert.equal(result.svg, "");
		assert.match(result.notes!, /^FAILED:/);
		assert.ok(!activity.some((line) => line.includes("inspecting")), "a failed image is never marked inspected");
		assert.equal(svgCalls.length, 1);
		assert.match(text(requests[1]!), /RENDER ERROR.*Image omitted:/);
		if (gated) assert.match(text(requests[1]!), /you have not looked at a render of the SVG as it now stands/, "finish refuses after a failed render");
	});
}
