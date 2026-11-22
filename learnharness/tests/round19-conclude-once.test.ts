/**
 * Round 19, M3 (4 major 1), the conclude half: an Eigen practice answer was
 * saved (o134), then the server was killed before the turn's transcript was
 * written. After the restart his "hello? did that go through?" reached a
 * turn whose record still held the problem open, so `conclude` ran again and
 * saved o135, a duplicate without his confidence. A problem's save is now
 * kept under its pose the moment the engine takes it, and a conclude of a
 * problem already saved saves nothing: it closes the problem and hands the
 * tutor the first save's receipt, so his card shows the one mark.
 *
 * Round 19, m3 (4 minor 2): o133 to o136 were right answers whose record
 * text was the problem's statement ("Let G = (1 2; 3 2). Find the
 * eigenvalues…"), so the topic's Earlier listed statements. Every answer's
 * record says what he did, a right answer's included.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { newThinkingMessage, newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { concludeTool, createPracticeGate, type PracticeToolContext } from "../src/agent/tools/practice.ts";
import { concludedSavesOf } from "../src/core/practice-attempts.ts";
import { markLinks } from "../src/core/answer-marks.ts";
import type { CourseToolContext } from "../src/agent/tools/course.ts";

const POSE = "p_h";
const statement = "Let $H = \\begin{pmatrix} 3 & 1 \\\\ -1 & 1 \\end{pmatrix}$. Find the eigenvalues of $H$.";
const pose = { id: "a_pose", role: "assistant", content: [{ type: "toolCall", id: POSE, name: "problem", arguments: { statement, mode: "recall", topics: ["eigen"], modelSolution: "$(\\lambda-2)^2 = 0$, so $\\lambda = 2$ twice." } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const posed = { id: "r_pose", role: "toolResult", toolCallId: POSE, toolName: "problem", content: [{ type: "text", text: "Problem posed" }], isError: false, timestamp: 2 } as unknown as LhMessage;
const work = newThinkingMessage(POSE, "trace 4, det 4, so (λ-2)^2: λ = 2 twice", "confident") as LhMessage;

const conclusion = {
	outcome: "solved" as const,
	verdict: "Right: $\\lambda = 2$, twice.",
	rung: null,
	missClass: null,
	retest: false,
	result: "correct" as const,
	response: "$\\lambda = 2$, twice",
	record: "Found the repeated eigenvalue $\\lambda = 2$ from trace and determinant",
};

/** One lesson's record on disk: its messages as the last turn wrote them,
 *  and the save links kept the moment the engine took each save. */
function lesson(messages: LhMessage[]) {
	const chat: { messages: LhMessage[]; answerSaves: Record<string, string[]> } = { messages, answerSaves: {} };
	const ctx: PracticeToolContext = { chatId: "eigen", chatStore: { getChat: () => chat } };
	const writes: unknown[] = [];
	let next = 134;
	const course: CourseToolContext = {
		course: { workspace: "/la", title: "Linear Algebra" },
		records: { run: async (_w: string, verb: { verb: string; changes?: { observations?: unknown[] } }) => {
			writes.push(verb.changes);
			return { ok: true, json: { saved: (verb.changes?.observations ?? []).map(() => `o${next++}`) } };
		} } as unknown as CourseToolContext["records"],
		arcs: false,
		onSaved: (links) => {
			for (const { question, observation } of links) chat.answerSaves[question] = [...(chat.answerSaves[question] ?? []), observation];
		},
	};
	return { chat, ctx, course, writes };
}

const textOf = (result: { content: { type: string; text?: string }[] }) => result.content.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("");

test("a problem saved before a kill is never saved again by the turn after the restart (round 19, M3)", async () => {
	const { chat, ctx, course, writes } = lesson([newUserMessage("next problem") as LhMessage, pose, posed, work]);

	// The turn that saves, then dies before its transcript is written.
	const first = await concludeTool(createPracticeGate(ctx), { ctx, course }).execute("c_first", conclusion as never);
	assert.ok(!(first as { isError?: boolean }).isError, textOf(first));
	assert.equal(writes.length, 1, "the answer is saved once");
	assert.deepEqual(concludedSavesOf(chat, POSE), ["o134"], "the save is kept under the problem it answers");

	// After the restart: the record still holds the problem open, and his
	// next message reaches a fresh turn.
	chat.messages = [...chat.messages, newUserMessage("hello? did that go through? ") as LhMessage];
	const gate = createPracticeGate(ctx);
	assert.equal(gate.problemActive, true, "the record never got the first conclude");
	const again = await concludeTool(gate, { ctx, course }).execute("c_again", { ...conclusion, response: "hello? did that go through?" } as never);
	assert.ok(!(again as { isError?: boolean }).isError, "the problem closes, so the next one can be posed");
	assert.equal(writes.length, 1, "nothing new reaches the record: one observation, o134");
	assert.equal(gate.problemActive, false);
	const said = textOf(again);
	assert.match(said, /already/i, "the tutor reads that it was saved before");
	assert.match(said, /Course record: \{"saved":\["o134"\]\}\s*$/, "the receipt names the first save, so the card shows its mark");

	// The transcript with the second conclude: its card shows o134 alone.
	const concluded: LhMessage[] = [
		...chat.messages,
		{ id: "a_again", role: "assistant", content: [{ type: "toolCall", id: "c_again", name: "conclude", arguments: conclusion }], stopReason: "toolUse", timestamp: 9 } as unknown as LhMessage,
		{ id: "r_again", role: "toolResult", toolCallId: "c_again", toolName: "conclude", content: again.content, details: again.details, isError: false, timestamp: 10 } as unknown as LhMessage,
	];
	assert.deepEqual(markLinks({ messages: concluded, answerSaves: chat.answerSaves }), { c_again: ["o134"] });
});

test("a right answer's record line says what he did, never the problem (round 19, m3)", async () => {
	for (const record of [undefined, statement, `  ${statement.toUpperCase()} `]) {
		const { ctx, course, writes } = lesson([newUserMessage("next problem") as LhMessage, pose, posed, work]);
		const sent = { ...conclusion, ...(record === undefined ? { record: undefined } : { record }) };
		if (record === undefined) delete (sent as { record?: string }).record;
		const result = await concludeTool(createPracticeGate(ctx), { ctx, course }).execute("c1", sent as never);
		assert.ok((result as { isError?: boolean }).isError, `refused with record ${JSON.stringify(record)}`);
		assert.match(textOf(result), /record/);
		assert.equal(writes.length, 0, "nothing is saved");
	}
	const { ctx, course, writes } = lesson([newUserMessage("next problem") as LhMessage, pose, posed, work]);
	await concludeTool(createPracticeGate(ctx), { ctx, course }).execute("c1", conclusion as never);
	const saved = (writes[0] as { observations: { text: string }[] }).observations;
	assert.deepEqual(saved.map((o) => o.text), [conclusion.record]);
});
