/**
 * Round 17, M7 (3 N1): in the Invertible lesson he set the R and S check
 * aside to ask the tutor something. The tutor answered, then posed a new
 * check on the same step, "Three 3 × 3 matrices satisfy UVW = I…". The
 * transcript took it for the SR check asked again, drew only "Your turn,
 * on the question above", and filed his SR answer under the UVW question
 * he never saw; once that call was answered, its re-pose stamped his real
 * UVW answer "Its solution was shown just before this answer".
 *
 * The record is lens 3's own (messages 78 to 87 of
 * chat_mwmj0h21_08817332): a question is asked again only when it is the
 * same check, its words or its committed answer, never another check on
 * the same step.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { askedAgain, reaskedFrom } from "../components/lesson/prose/prose-question-data.ts";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { answeredQuestionsOf, type LhMessage } from "../src/core/native-messages.ts";
import { projectView } from "../src/core/view.ts";

const record = JSON.parse(readFileSync(new URL("./fixtures/round17/ask-then-new-check.json", import.meta.url), "utf8")) as LhMessage[];
const SR = "toolu_01PEvZhoPU6deuvmEmpaWhmS";
const UVW = "toolu_01Mu2QxyA21ryQicPxQLMXGB";

/** The transcript's question parts, as chat.tsx reads them. */
function questionParts(messages: ReturnType<typeof projectView>) {
	return messages.flatMap((m) => (m.parts as Array<{ type: string; toolCallId?: string; input?: unknown; output?: unknown; state?: string }>).filter((p) => p.type === "tool-explain"));
}

describe("a new check posed after an Ask (round 17, M7)", () => {
	it("holds the real record: the SR check set aside, then UVW on the same step", () => {
		const parts = questionParts(projectView(record));
		assert.deepEqual(
			parts.map((p) => p.toolCallId),
			[SR, UVW],
		);
		const [sr, uvw] = parts.map((p) => p.input as { nodeId: string; type: string; question: string });
		assert.equal(sr!.nodeId, uvw!.nodeId, "the same step");
		assert.equal(sr!.type, uvw!.type, "the same type");
	});

	it("draws the new check's words under Your turn, while it waits and once he answered it", () => {
		const waiting = projectView(record.slice(0, -1));
		assert.ok(!askedAgain(waiting).has(UVW), "UVW is not the SR check asked again");
		assert.equal(reaskedFrom(waiting, UVW), null, "his SR draft is not carried into UVW");
		const uvw = questionParts(waiting).find((p) => p.toolCallId === UVW)!;
		const open = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId={UVW} input={uvw.input} open repeat={askedAgain(waiting).has(UVW)} />);
		assert.match(open, /UVW = I/, "its words are on screen");
		assert.doesNotMatch(open, /on the question above/);
		const answered = projectView(record);
		assert.ok(!askedAgain(answered).has(UVW), "drawn in full once answered too");
	});

	it("files his answer under the question he saw, with no help from a shown solution", () => {
		const answer = answeredQuestionsOf(record).get(UVW);
		assert.ok(answer, "his answer names the UVW call");
		assert.equal(answer.seenBefore, false, "UVW's solution was never shown before he answered it");
		assert.ok(!answeredQuestionsOf(record).has(SR), "the SR check was set aside, not answered");
	});
});

/** Both halves of M7 on the one record: P3's Ask guard and this page. */
describe("the Ask guard and the page agree on a new check after an Ask (round 17, M7)", () => {
	it("the guard holds the new check once, lets it through when the tutor insists, and the page then shows it and files his answer under it", async () => {
		const { VoiceGuard } = await import("../src/agent/voice-guard.ts");
		// The turn that answers his Ask: built from the record up to his message.
		const guard = new VoiceGuard(record.slice(0, 5), undefined, false, true);
		const calls = (i: number) => record[i]!.content as Array<{ type: string; id: string }>;
		const call = calls(7).find((b) => b.id === UVW) as never;
		const held = (c: { id: string }) => (guard as unknown as { decisions: Map<string, unknown> }).decisions.get(c.id) ?? null;
		guard.screen(calls(5)[0] as never);
		guard.screen(call);
		assert.ok(held(call) !== null, "the first new check after the Ask is held: the open one comes back word for word");
		const again = { ...(call as object), id: `${UVW}-again` } as never;
		guard.screen(again);
		assert.equal(held(again), null, "the hold is once a turn, so the new check goes through when the tutor sends it again");
		const waiting = projectView(record.slice(0, -1));
		assert.ok(!askedAgain(waiting).has(UVW), "the page draws it in its own words");
		assert.equal(answeredQuestionsOf(record).get(UVW)?.seenBefore, false, "and files his answer under it, with no help");
	});
});
