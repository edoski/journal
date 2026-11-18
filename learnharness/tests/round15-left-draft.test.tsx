/**
 * Round 15, 3 m1 and 4 minor 6 (m25): in a lesson, the half answer typed
 * before Done for today was lost. "Left for next time" stood empty above
 * the close, the box emptied, and reopening from Sessions brought nothing
 * back, while the topic page's Resume and the Today card did: the draft
 * rode one browser slot per course, taken once and replaced by any later
 * carry in the course. Done for today now keeps it with the lesson, on the
 * question it was left on: the line shows it, and the question asked again
 * opens with it however he comes back (every way back opens the same
 * record). The tutor never reads it. A practice problem's unsent work is
 * dropped (Edo's ruling), so its line says the problem was set aside,
 * never an empty "Left for next time".
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { compactAnswerForModel, parseChatInput, type QuestionAnswerData } from "../src/core/index.ts";
import { tonightAppends } from "../src/core/input-events.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { leftDraftAt, leftDraftOf, formToKept } from "../components/lesson/kept-drafts.ts";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { ProseConclude } from "../components/lesson/prose/prose-practice.tsx";

const STAMPS = { api: "faux", provider: "test", model: "test-model", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "toolUse" } as const;
const QUESTION = "Is F invertible? Say why.";
const asked: LhMessage[] = [{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { type: "check", nodeId: "invertible", question: QUESTION, correctAnswer: "No: det F = 0" } }], timestamp: 1, ...STAMPS } as unknown as LhMessage];

describe("Done for today keeps his half answer with the question it was left on", () => {
	it("takes it in the input, and keeps it on that question's dismissal", () => {
		const input = parseChatInput({ type: "tonight", draft: { toolCallId: "q1", text: "det F = 0, so", confidence: "guessing" } });
		assert.deepEqual(input, { type: "tonight", draft: { toolCallId: "q1", text: "det F = 0, so", confidence: "guessing" } });
		assert.deepEqual(parseChatInput({ type: "tonight", draft: { toolCallId: "q1", text: "   " } }), { type: "tonight" }, "nothing typed, nothing kept");
		const appended = tonightAppends({ messages: asked }, input.type === "tonight" ? input.draft : undefined);
		const left = appended.find((m) => m.role === "toolResult" && m.toolCallId === "q1") as { details: QuestionAnswerData } | undefined;
		assert.deepEqual(left?.details.draft, { text: "det F = 0, so", confidence: "guessing" });
		assert.equal(left?.details.reason, "tonight");
	});

	it("never shows it to the tutor", () => {
		const left = { kind: "explain", questionText: QUESTION, answers: [], dismissed: true, reason: "tonight", draft: { text: "det F = 0, so" }, answeredAt: "" } as QuestionAnswerData;
		assert.doesNotMatch(JSON.stringify(compactAnswerForModel(left)), /det F/);
	});

	it("reads a box's words as the half answer, and finds it on the question it was left on", () => {
		assert.deepEqual(leftDraftOf({ form: formToKept({ selection: { selected: new Set(), otherSelected: false }, thinking: "", other: "", text: "det F = 0, so", confidence: "guessing" }) }), { text: "det F = 0, so", confidence: "guessing" });
		assert.equal(leftDraftOf({ text: "  " }), null);
		const view = [{ parts: [{ toolCallId: "q1", output: { dismissed: true, reason: "tonight", draft: { text: "det F = 0, so" } } }] }, { parts: [{ toolCallId: "q2" }] }];
		assert.deepEqual(leftDraftAt(view, "q1"), { text: "det F = 0, so" });
		assert.equal(leftDraftAt(view, "q2"), null);
	});
});

describe("Left for next time", () => {
	const card = (askedBelow: boolean, draft?: { text: string }) =>
		renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="q1" input={{ type: "check", nodeId: "n", question: QUESTION, correctAnswer: "x" }} output={{ kind: "explain", questionText: QUESTION, answers: [], dismissed: true, reason: "tonight", ...(draft ? { draft } : {}), answeredAt: "" } as never} open={false} askedBelow={askedBelow} />);

	it("shows his half answer inside it, asked again below or not", () => {
		for (const below of [false, true]) {
			const html = card(below, { text: "det F = 0, so" });
			assert.match(html, /data-testid="left-draft"[\s\S]*Left for next time[\s\S]*det F = 0, so/, `asked again below: ${below}`);
		}
	});

	it("with nothing typed, shows nothing: a bare label kept nothing (round 16, m16)", () => {
		for (const below of [false, true]) {
			assert.doesNotMatch(card(below), /left-draft|Left for next time/, `asked again below: ${below}`);
		}
		assert.match(card(false), /Is F invertible\? Say why\./, "the question stays as asked");
	});

	it("a practice problem Done for today closed says it was set aside, never an empty Left for next time", () => {
		const html = renderToStaticMarkup(<ProseConclude toolCallId="c1" input={{ outcome: "dismissed" }} output={{ reason: "tonight" }} reveal="" />);
		assert.match(html, /Problem set aside for today/);
		assert.doesNotMatch(html, /Left for next time/);
	});
});
