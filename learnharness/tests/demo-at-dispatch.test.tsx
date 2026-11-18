/**
 * A demo shows the moment it is built, where the tutor called for it
 * (round 13, 3 N1 and 2 M2): the Invertible and Poisson demos finished
 * while his question was open, so their delivery waited for his answer,
 * and nothing showed while the reply pointed at "the demo" and the
 * question relied on it. The result is the lesson's to show, not the
 * tutor's to read first: the call's own place draws it from the job as
 * soon as the job is done, and the delivered result draws there too,
 * never a second time below.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { DemoCard } from "../components/artifacts/demo-card.tsx";
import { VisualCard } from "../components/artifacts/visual-card.tsx";
import { SubagentSteerCard } from "../components/artifacts/steer-card.tsx";
import { JobsContext } from "../components/jobs-context.ts";
import { projectView } from "../src/core/view.ts";
import { buildSubagentSteer, type JobRecord } from "../src/core/contracts.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (id: string, content: unknown[], stopReason: "stop" | "toolUse") => ({ id, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: 1 }) as unknown as LhMessage;
const toolResult = (id: string, callId: string, toolName: string, text: string, details: unknown = {}) =>
	({ id, role: "toolResult", toolCallId: callId, toolName, content: [{ type: "text", text }], details, isError: false, timestamp: 1 }) as unknown as LhMessage;

const DEMO = { title: "The unit square under a 2×2 map", html: "<!doctype html><html><head></head><body><button>Reset</button></body></html>", tested: true as const };
const demoJob = (over: Partial<JobRecord> = {}): JobRecord =>
	({ id: "jd", kind: "demo", chatId: "c", toolCallId: "cd", status: "done", activity: "finished", createdAt: "2026-11-16T07:00:00Z", updatedAt: "2026-11-16T07:01:00Z", result: DEMO, delivery: { kind: "result", status: "pending" }, ...over }) as JobRecord;
const demoPart = { type: "tool-demo", state: "output-available", toolCallId: "cd", input: { title: DEMO.title, brief: "b" }, output: "Dispatched (job jd)." };

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

describe("a finished demo shows at once, where the tutor called for it (3 N1, 2 M2)", () => {
	it("draws the demo at its call as soon as the job is done, while its delivery still waits on his open question", () => {
		const doc = documentFor(<JobsContext.Provider value={[demoJob()]}><DemoCard part={demoPart as never} /></JobsContext.Provider>);
		assert.ok(doc.querySelector('[data-testid="inline-demo"]') !== null, "the demo is on screen without a further message of his");
		assert.ok(doc.querySelector('[data-testid="dispatch-card"]') === null, "no working line once it is built");
	});

	it("keeps the working line while the demo is being built", () => {
		const doc = documentFor(<JobsContext.Provider value={[demoJob({ status: "running", result: undefined, delivery: undefined })]}><DemoCard part={demoPart as never} /></JobsContext.Provider>);
		assert.equal(doc.querySelector('[data-testid="dispatch-card"]')?.textContent, "Building a demo…");
		assert.ok(doc.querySelector('[data-testid="inline-demo"]') === null, "nothing drawn before it is built");
	});

	it("draws a finished figure at its call the same way", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
		const job = { ...demoJob(), id: "jv", kind: "visual", toolCallId: "cv", result: { svg } } as JobRecord;
		const part = { type: "tool-visual", state: "output-available", toolCallId: "cv", input: { brief: "b" }, output: "Dispatched (job jv)." };
		const doc = documentFor(<JobsContext.Provider value={[job]}><VisualCard part={part as never} /></JobsContext.Provider>);
		assert.ok(doc.querySelector('[data-testid="inline-visual"]') !== null, "the figure is on screen");
	});

	it("draws a delivered demo at its call from the record, and nothing where its result was read", () => {
		const record = [
			assistant("a1", [
				{ type: "toolCall", id: "cd", name: "demo", arguments: { title: DEMO.title, brief: "b" } },
				{ type: "toolCall", id: "s1", name: "send_to_user", arguments: { message: "A zero determinant means no area is left." } },
				{ type: "toolCall", id: "q1", name: "explain", arguments: { type: "check", question: "Give a nonzero vector L sends to 0, and why?", correctAnswer: "(3,2)" } },
			], "toolUse"),
			toolResult("r0", "cd", "demo", "Dispatched (job jd)."),
			toolResult("r1", "s1", "send_to_user", "Delivered."),
			toolResult("r2", "q1", "explain", "(3,2)", { kind: "explain", questionText: "Give a nonzero vector L sends to 0, and why?", answers: ["(3,2)"] }),
			buildSubagentSteer({ id: "jd", kind: "demo", toolCallId: "cd" }, DEMO) as unknown as LhMessage,
			assistant("a2", [{ type: "toolCall", id: "s2", name: "send_to_user", arguments: { message: "Right." } }], "toolUse"),
		];
		const view = projectView(record);
		const call = view.flatMap((m) => m.parts).find((p) => p.type === "tool-demo");
		const placed = call?.artifact as { messageId?: string; data?: { kind?: string } } | undefined;
		assert.equal(placed?.messageId, "steer_jd", "the call carries the delivered result");
		assert.equal(placed?.data?.kind, "demo");
		const doc = documentFor(<JobsContext.Provider value={[]}><DemoCard part={call as never} /></JobsContext.Provider>);
		assert.ok(doc.querySelector('[data-testid="inline-demo"]') !== null, "drawn at the call before the job list loads");
		const steer = view.find((m) => m.id === "steer_jd");
		assert.ok(steer, "the result keeps its place in the record");
		assert.equal(renderToStaticMarkup(<SubagentSteerCard message={steer} figures="inline" />), "", "and draws nothing there: one demo, never two");
	});

	it("still draws a result whose call is not in the record where it was read", () => {
		const steer = buildSubagentSteer({ id: "jd", kind: "demo", toolCallId: "gone" }, DEMO) as unknown as LhMessage;
		const view = projectView([steer]);
		const doc = documentFor(<SubagentSteerCard message={view[0]!} figures="inline" />);
		assert.ok(doc.querySelector('[data-testid="inline-demo"]') !== null);
	});
});
