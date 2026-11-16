import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import { serverExecute } from "../tool-execute.ts";
import type { SdkEngine } from "../models.ts";
import { runSubagent } from "../sdk/task.ts";
import type { DemoResult } from "../../core/contracts.ts";
import { getHeadless, type DemoRunResult, type HeadlessApi } from "./headless.ts";
import { healToolRecord } from "../tools/heal.ts";
import { withDemoBase } from "../../core/demo-frame.ts";

/**
 * The demo-builder sub-agent (vision §2 interactive demos + §2.5 "sub-agents
 * verify; they never one-shot"): given a brief it writes a self-contained
 * single-file HTML/JS demo, TESTS IT HEADLESSLY (run_demo), and iterates
 * fix → re-run until clean — before anything reaches the lesson.
 *
 * Shape: a ToolLoopAgent with two executable tools (write_demo / run_demo) —
 * the engine is injectable (tests use a scripted faux engine) and the headless
 * API is injectable (tests use a fake; production uses the app's own
 * Chromium browser service, system Chrome as fallback).
 *
 * Failure semantics (decided in the W6 brief): `tested: true` means "the
 * verify loop ran"; on failure the result is { title, html: "", tested: true,
 * notes: "FAILED: <reason>" } — the card renders the failure note, no iframe.
 * The job wrapper treats html === "" as failure and marks the job error.
 */

export interface DemoBuilderInput {
	title: string;
	brief: string;
}

export interface DemoBuilderOptions {
	/** The engine (tests pass a scripted fake). */
	engine: SdkEngine;
	headless?: HeadlessApi;
	/** Max agent steps (each write/run/fix is one step). Default 24 ≈ 6 cycles. */
	maxSteps?: number;
	/** Live activity-line callback (updates the job record). */
	onActivity?: (line: string) => void;
	/** Kills the run mid-model-call (2026-09 real-kill abort semantics). */
	abortSignal?: AbortSignal;
	/** Money channel: one call per agent step, folded into JobRecord.usage. */
	onUsage?: (usage: Usage) => void;
}

const INSTRUCTIONS = `You are a demo builder — a specialist sub-agent inside a learning application. You
receive a brief for ONE interactive teaching instrument and deliver a single self-contained HTML document
that runs it. You never see the lesson; the brief is everything you know.

Runtime contract (the document runs in a sandboxed iframe, sandbox="allow-scripts", opaque origin):
- Single file. Vanilla JS + Canvas 2D or SVG. CDN imports (e.g. a plotting or math library) are allowed
  when they genuinely help — but prefer dependency-free; you own the failure if a CDN import fails.
- NO localStorage, sessionStorage, or document.cookie — the sandbox makes them throw.
- The parent sizes the iframe to the document height automatically; just build normal flowing layout.
  Make the demo fill the width and size its own height sensibly.

Build quality:
- The demo must directly serve the brief: every control named in the brief must exist and do the thing.
- Controls need labels; sliders/inputs need current-value readouts. A learner should operate it unguided.
- Show only what the brief asks it to show: add no readout, header line or footer of your own, and never print a formula or computed result the brief does not ask for (a learner finds those himself).
- Smooth enough interaction; requestAnimationFrame for animation, not setInterval when it matters.
- A clean light page. The document starts with the app's base stylesheet (shadcn's button variants in its
  light tokens): a plain <button> is the outline button, class="primary" the filled one, class="secondary"
  the soft one. Use them as they are; never restyle a button's colours. run_demo fails a control whose
  words do not read against what lies under it.
- One screen: the whole demo, controls and readouts included, is seen at once in a frame about 700px wide
  and 600px tall, with no scrolling.
- Maths reads as he writes it on paper: a matrix by its columns ("columns (a, c) and (b, d)") or its entries'
  names, never as code ("[[a, b], [c, d]]"); run_demo fails maths written as code.
- Labels say what each control and readout is. No helper lines, footers or instructions under the demo
  ("Hover a bar to see…", "Resets when n changes…").

THE HOUSE RULE — never deliver untested:
1. Call write_demo with the complete HTML document.
2. Call run_demo. It loads the file in a headless browser, waits ~2s, and reports console errors, uncaught
   errors (window.onerror), and failed requests. Optionally pass a probe: a JS expression evaluated in
   the page (e.g. "typeof window.simulate === 'function'" or a state assertion) to check deeper.
3. If run_demo reports problems, FIX the document and call write_demo again, then run_demo again.
   Iterate until run_demo reports PASSED.
4. Only then finish. Your final message is 1-3 sentences of NOTES for the teacher (what the demo shows,
   its controls, what to try) — NEVER the HTML itself.

Never claim success you did not see: a PASSED run_demo is the only definition of done.`;

interface BuilderState {
	html: string | null;
	/** The html that the last run_demo tested (null = never tested). */
	testedHtml: string | null;
	lastResult: DemoRunResult | null;
}

const writeDemoInput = Type.Object({
	html: Type.String({ description: "The complete HTML document: <!doctype html>…</html>, all JS inline." }),
});

const runDemoInput = Type.Object({
	probe: Type.Optional(
		Type.String({
			description:
				"Optional JS expression evaluated in the page after settling, e.g. \"document.querySelectorAll('input').length\".",

		}),
	),
});

export function createDemoBuilderTools(
	state: BuilderState,
	headless: HeadlessApi,
	onActivity?: (line: string) => void,
): Record<string, AgentTool<any>> {
	return healToolRecord({
		write_demo: {
			name: "write_demo",
			label: "write_demo",
			description:
				"Write the complete self-contained HTML document for the demo (overwrites any previous version). " +
				"Always follow with run_demo to test it headlessly.",
			parameters: writeDemoInput,
			execute: serverExecute("write_demo", writeDemoInput, async ({ html }) => {
				if (!html || html.trim().length === 0) return "ERROR: empty document — write the full HTML.";
				state.html = html;
				onActivity?.(`write_demo: ${(html.length / 1024).toFixed(1)} KB`);
				return `Saved (${html.length} bytes). Now call run_demo to test it — never deliver untested.`;
			}),
		},
		run_demo: {
			name: "run_demo",
			label: "run_demo",
			description:
				"Headlessly execute the current demo in a browser and report console errors, uncaught errors, and failed requests. " +
				"Optionally pass a probe expression to assert on page state.",
			parameters: runDemoInput,
			execute: serverExecute("run_demo", runDemoInput, async ({ probe }) => {
				if (!state.html) return "ERROR: nothing to run — call write_demo first.";
				const reason = headless.unavailableReason();
				if (reason) return `HEADLESS UNAVAILABLE: ${reason}`;
				let result: DemoRunResult;
				try {
					// The test runs the document as his app shows it, on the base (`withDemoBase`).
					result = await headless.runDemo(withDemoBase(state.html), probe ? { probe } : undefined);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					onActivity?.("run_demo: browser error");
					return `HEADLESS ERROR (retrying may help): ${msg}`;
				}
				state.testedHtml = state.html;
				state.lastResult = result;
				onActivity?.(
					result.ok ? "run_demo: clean" : `run_demo: ${summarizeCounts(result)}`,
				);
				return formatRunResult(result);
			}),
		},
	});
}

function summarizeCounts(result: DemoRunResult): string {
	const counts = [
		result.consoleErrors.length > 0 ? `${result.consoleErrors.length} console error${result.consoleErrors.length === 1 ? "" : "s"}` : null,
		result.pageErrors.length > 0 ? `${result.pageErrors.length} page error${result.pageErrors.length === 1 ? "" : "s"}` : null,
		result.failedRequests.length > 0 ? `${result.failedRequests.length} failed request${result.failedRequests.length === 1 ? "" : "s"}` : null,
		(result.unreadable?.length ?? 0) > 0 ? `${result.unreadable!.length} unreadable control${result.unreadable!.length === 1 ? "" : "s"}` : null,
		(result.codeNotation?.length ?? 0) > 0 ? `maths written as code` : null,
	].filter(Boolean);
	return counts.length > 0 ? counts.join(", ") : "ok";
}

function formatRunResult(result: DemoRunResult): string {
	if (result.ok) {
		const probe =
			result.probeResult !== undefined
				? ` Probe result: ${JSON.stringify(result.probeResult) ?? "undefined"}.`
				: "";
		return `PASSED: no console errors, no uncaught errors, no failed requests, every control readable, no maths written as code.${probe} If you are satisfied, finish with your notes; otherwise keep improving and re-test.`;
	}
	const sections: string[] = [`FAILED: ${summarizeCounts(result)}.`];
	if (result.consoleErrors.length > 0)
		sections.push(`Console errors:\n${result.consoleErrors.slice(0, 10).map((e) => `- ${e}`).join("\n")}`);
	if (result.pageErrors.length > 0)
		sections.push(`Uncaught errors:\n${result.pageErrors.slice(0, 10).map((e) => `- ${e}`).join("\n")}`);
	if (result.failedRequests.length > 0)
		sections.push(`Failed requests:\n${result.failedRequests.slice(0, 10).map((r) => `- ${r}`).join("\n")}`);
	if (result.unreadable?.length)
		sections.push(`Unreadable controls (their words against what lies under them; 4.5:1 is the least):\n${result.unreadable.slice(0, 10).map((r) => `- ${r}`).join("\n")}\nLeave a button's colours to the page's base (a plain <button>, class="primary" or class="secondary"), or set its text colour with its background.`);
	if (result.codeNotation?.length)
		sections.push(`Maths written as code in its words:\n${result.codeNotation.slice(0, 5).map((r) => `- ${r}`).join("\n")}\nWrite a matrix as he reads it: by its columns ("columns (a, c) and (b, d)") or its entries' names, never as a nested list.`);
	sections.push("Fix the document (write_demo) and re-test (run_demo).");
	return sections.join("\n");
}

/** Short summary of a run for failure notes. */
function failureSummary(result: DemoRunResult | null): string {
	if (!result) return "never tested";
	const details = [...result.consoleErrors, ...result.pageErrors, ...result.failedRequests, ...(result.unreadable ?? []), ...(result.codeNotation ?? [])].slice(0, 5);
	return details.length > 0 ? `${summarizeCounts(result)} — ${details.join(" | ")}` : summarizeCounts(result);
}

export async function runDemoBuilder(input: DemoBuilderInput, opts: DemoBuilderOptions): Promise<DemoResult> {
	const headless = opts.headless ?? getHeadless();
	const title = input.title.trim() || "Interactive demo";
	const brief = input.brief.trim() || "(no brief)";
	const notes = (text: string) => (text.trim() ? text.trim() : undefined);

	const reason = headless.unavailableReason();
	if (reason) {
		return { title, html: "", tested: true, notes: `FAILED: ${reason}` };
	}

	const state: BuilderState = { html: null, testedHtml: null, lastResult: null };

	const prompt = [
		`Demo title: ${title}`,
		`Brief (all you know about the lesson — this comes from the teacher, verbatim):`,
		brief,
		"",
		"Build the demo, test it with run_demo, iterate until PASSED, then finish with your notes.",
	].join("\n");

	let finalText = "";
	try {
		const result = await runSubagent(Object.values(createDemoBuilderTools(state, headless, opts.onActivity)), {
			engine: opts.engine,
			systemPrompt: INSTRUCTIONS,
			prompt,
			maxTurns: opts.maxSteps ?? 24,
			abortSignal: opts.abortSignal,
			onUsage: (usage) => opts.onUsage?.(usage),
			onToolStart: (toolName) => opts.onActivity?.(toolName),
		});
		finalText = result.text;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { title, html: "", tested: true, notes: `FAILED: the builder crashed — ${msg}` };
	}

	// The model produced nothing.
	if (!state.html) {
		return {
			title,
			html: "",
			tested: true,
			notes: `FAILED: the builder never wrote a demo.${finalText ? ` (${finalText.slice(0, 300)})` : ""}`,
		};
	}

	// The verify gate: the delivered html must have a clean headless run —
	// even when the model claims success or forgets the final run_demo.
	if (state.testedHtml !== state.html || !state.lastResult?.ok) {
		opts.onActivity?.("final verification");
		let verify: DemoRunResult;
		try {
			verify = await headless.runDemo(withDemoBase(state.html));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { title, html: "", tested: true, notes: `FAILED: final verification crashed — ${msg}` };
		}
		state.lastResult = verify;
		if (!verify.ok) {
			return {
				title,
				html: "",
				tested: true,
				notes: `FAILED: the demo never passed headless verification (${failureSummary(verify)}).`,
			};
		}
	}

	return { title, html: state.html, tested: true, notes: notes(finalText) };
}
