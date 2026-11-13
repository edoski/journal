/**
 * The practice dock's requests (Hint, Show me, Explain instead) reach the
 * practice agent as the request they are, never as an answer, and an
 * Explain instead before any work records no attempt.
 */

import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";

import { ChatInputError, inputAppends, parseChatInput } from "../src/core/input-events.ts";
import { PRACTICE_PROBLEM_TOOL, newThinkingMessage, newPracticeRequestMessage, type LhMarkerMessage, type LhMessage } from "../src/core/native-messages.ts";
import { concludeTool, createPracticeGate } from "../src/agent/tools/practice.ts";
import { PracticeDock } from "../components/practice-dock.tsx";
import { RequestCard } from "../components/practice-cards.tsx";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
} as const;

function posed(): LhMessage[] {
	const pose: LhMessage & AssistantMessage = {
		id: "msg_a1",
		role: "assistant",
		content: [{ type: "toolCall", id: "call_p1", name: PRACTICE_PROBLEM_TOOL, arguments: { statement: "Find the rank.", mode: "recall", topics: ["rank"], modelSolution: "Rank 2." } }],
		timestamp: 1,
		...STAMPS,
	};
	const ack: LhMessage & ToolResultMessage = {
		id: "msg_r1", role: "toolResult", toolCallId: "call_p1", toolName: PRACTICE_PROBLEM_TOOL,
		content: [{ type: "text", text: "Problem posed" }], details: null, isError: false, timestamp: 2,
	};
	return [pose, ack];
}

describe("the practice dock's requests", () => {
	it("a Hint press becomes a request marker the agent reads as a request, not a thinking submission", () => {
		const input = parseChatInput({ type: "request", problemCallId: "call_p1", request: "hint", text: "  rows 1 and 3 look related " });
		const [marker] = inputAppends({ messages: posed(), kind: "practice" }, input) as LhMarkerMessage[];
		assert.equal(marker!.customType, "practice-request");
		assert.deepEqual(marker!.details, { problemCallId: "call_p1", request: "hint", text: "rows 1 and 3 look related" });
		assert.match(marker!.content, /^\[HINT\].*not an answer/s);
		assert.match(marker!.content, /rows 1 and 3 look related/);
		assert.doesNotMatch(marker!.content, /Your thinking|Confidence:/);
	});

	it("each of the three requests names itself to the agent", () => {
		for (const [request, head] of [["hint", "[HINT]"], ["show", "[SHOW ME]"], ["explain", "[EXPLAIN INSTEAD]"]] as const) {
			const [marker] = inputAppends({ messages: posed(), kind: "practice" }, { type: "request", problemCallId: "call_p1", request }) as LhMarkerMessage[];
			assert.ok(marker!.content.startsWith(head), `${request} → ${head}`);
		}
	});

	it("an unknown request or one with no active problem is refused", () => {
		assert.throws(() => parseChatInput({ type: "request", problemCallId: "call_p1", request: "answer" }), ChatInputError);
		assert.throws(() => inputAppends({ messages: [], kind: "practice" }, { type: "request", problemCallId: "call_p1", request: "hint" }), ChatInputError);
	});
});

function recorder(messages: LhMessage[]) {
	const saves: unknown[] = [];
	const course = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: { run: async (_w: string, call: { verb: string; changes?: unknown }) => { saves.push(call.changes); return { ok: true, json: {} }; } },
	};
	const ctx = { chatId: "c1", chatStore: { getChat: () => ({ messages, kind: "practice" }) } };
	return { tool: concludeTool(createPracticeGate(ctx), { ctx, course: course as never }), saves };
}

const MOVED_ON = { outcome: "movedOn", verdict: "He asked to be taught.", rung: null, missClass: null, retest: false, result: "incorrect", response: "(none)" } as const;

describe("concluding after Explain instead", () => {
	it("records no attempt when he asked to be taught before any work", async () => {
		const { tool, saves } = recorder([...posed(), newPracticeRequestMessage("call_p1", "explain")]);
		const result = await tool.execute("c1", MOVED_ON as never);
		assert.equal(result.isError, undefined);
		assert.deepEqual(saves, []);
		assert.match((result.content[0] as { text: string }).text, /No attempt recorded/);
	});

	it("still records the attempt when he had submitted work first", async () => {
		const { tool, saves } = recorder([...posed(), newThinkingMessage("call_p1", "rank 3", "neutral"), newPracticeRequestMessage("call_p1", "explain")]);
		await tool.execute("c1", MOVED_ON as never);
		assert.equal(saves.length, 1);
	});
});

describe("the problem box and the transcript", () => {
	it("the Proposed problem box offers Hint, Show me and Explain instead beside Submit", () => {
		const html = renderToStaticMarkup(
			<PracticeDock problemCallId="call_p1" input={{ statement: "Find the rank." }} expanded onExpand={() => {}} onSubmit={() => {}} onRequest={() => {}} variant="proposed" />,
		);
		for (const [id, label] of [["hint", "Hint"], ["show", "Show me"], ["explain", "Explain instead"]]) {
			assert.match(html, new RegExp(`data-testid="practice-request-${id}"[^>]*>(?:<svg.*?</svg>)?${label}<`));
		}
		assert.match(html, /data-testid="practice-send"/);
	});

	it("a request reads in the transcript as what he asked for, with his work", () => {
		const html = renderToStaticMarkup(<RequestCard data={{ problemCallId: "call_p1", request: "hint", text: "rows 1 and 3" }} variant="proposed" />);
		assert.match(html, /You asked for a hint/);
		assert.match(html, /rows 1 and 3/);
	});
});
