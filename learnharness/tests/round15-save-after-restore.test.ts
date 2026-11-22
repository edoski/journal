/**
 * Round 15, M3 (4 major 2; regresses round 14's M2 guard): Real Analysis'
 * record was unreadable while he answered the series problem wrongly, then
 * right after the nudge. The conclude carried his first try and the fixed
 * answer, but could not write them. Once the record read again, the tutor
 * sent the conclude's own pair with course_save, and the guard refused it
 * twice ("one answer is one observation with one result", then "…never
 * save it again"); only the first try was saved (o7), the fix was lost, and
 * the reply said "together with your fix to 1/e" (`73`, `73b`).
 *
 * A failed conclude now keeps its observations, and a save naming it writes
 * exactly that pair, first try and fix, whatever the tutor sends for it.
 * Two results for one answer of any other kind are still refused.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { answeredQuestionsOf, newThinkingMessage, newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { concludeTool, createPracticeGate } from "../src/agent/tools/practice.ts";
import { saveCourse, type CourseToolContext } from "../src/agent/tools/course.ts";

const POSE = "p_series";
const statement = "Does $\\sum_{n\\ge1} \\left(\\frac{n}{n+1}\\right)^{n^2}$ converge?";
const pose = { id: "a_pose", role: "assistant", content: [{ type: "toolCall", id: POSE, name: "problem", arguments: { statement, mode: "recall", topics: ["root-test"], modelSolution: "Root test: the limit is 1/e < 1." } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const posed = { id: "r_pose", role: "toolResult", toolCallId: POSE, toolName: "problem", content: [{ type: "text", text: "Problem posed" }], isError: false, timestamp: 2 } as unknown as LhMessage;
const first = newThinkingMessage(POSE, "the limit is e, so it diverges", "confident") as LhMessage;
const nudge = { id: "a_nudge", role: "assistant", content: [{ type: "text", text: "Look again at the limit of $(n/(n+1))^n$." }], stopReason: "stop", timestamp: 3 } as unknown as LhMessage;
const fix = newThinkingMessage(POSE, "oh, it's 1/e, so it converges", "confident") as LhMessage;
const record: LhMessage[] = [newUserMessage("series practice") as LhMessage, pose, posed, first, nudge, fix];

const CONCLUDE = "c_series";
const conclusion = {
	outcome: "solvedWithHints" as const,
	verdict: "Right after the nudge: the limit is 1/e.",
	rung: "R1" as const,
	missClass: "execution" as const,
	retest: false,
	result: "correct" as const,
	response: "The limit is $1/e < 1$, so it converges",
	record: "Found the limit $1/e < 1$ by the root test after the nudge",
	firstTry: { result: "incorrect" as const, response: "The limit is $e$, so it diverges", sure: "confident" as const, record: "Took the limit of the base alone as $e$" },
};

function course(run: (verb: { verb: string; changes?: unknown }) => Promise<unknown>, answers?: CourseToolContext["answers"], onSaved?: CourseToolContext["onSaved"]): CourseToolContext {
	return { course: { workspace: "/ra", title: "Real Analysis" }, records: { run: (_workspace: string, verb: { verb: string; changes?: unknown }) => run(verb) } as unknown as CourseToolContext["records"], arcs: false, answers, onSaved };
}

test("a save after a conclude that failed on an unreadable record writes its first try and its fix (round 15, M3)", async () => {
	// The conclude, while the record can't be read.
	const unreadable = course(async () => ({ ok: false, kind: "io", message: "macOS won't let the app open its files" }));
	const tool = concludeTool(createPracticeGate({ chatId: "c", chatStore: { getChat: () => ({ messages: record }) } }), { ctx: { chatId: "c", chatStore: { getChat: () => ({ messages: record }) } }, course: unreadable });
	const result = await tool.execute(CONCLUDE, conclusion as never);
	const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
	assert.match(text, /The attempt was not saved/);
	const concluded: LhMessage[] = [
		...record,
		{ id: "a_conc", role: "assistant", content: [{ type: "toolCall", id: CONCLUDE, name: "conclude", arguments: conclusion }], stopReason: "toolUse", timestamp: 4 } as unknown as LhMessage,
		{ id: "r_conc", role: "toolResult", toolCallId: CONCLUDE, toolName: "conclude", content: result.content, details: result.details, isError: false, timestamp: 5 } as unknown as LhMessage,
		newUserMessage("the record works again, can you save my answers now?") as LhMessage,
	];

	// The record reads again: each way the tutor sends it, the pair is saved.
	const answers = answeredQuestionsOf(concluded);
	const sends = [
		{ observations: [
			{ question: CONCLUDE, topics: ["root-test"], text: "Took the limit of the base alone as $e$", response: "e, diverges", help: "none", result: "incorrect", sure: "confident" },
			{ question: CONCLUDE, topics: ["root-test"], text: statement, response: "1/e, converges", help: "R1", result: "correct", sure: "confident" },
		] },
		{ observations: [{ question: CONCLUDE, topics: ["root-test"], text: "Took the limit of the base alone as $e$", result: "incorrect", help: "none" }] },
	];
	for (const changes of sends) {
		const written: unknown[] = [];
		const links: { question: string; observation: string }[] = [];
		const restored = course(async (verb) => { written.push(verb.changes); return { ok: true, json: { saved: ["o7", "o8"] } }; }, answers, (l) => links.push(...l));
		const saved = await saveCourse(restored, changes);
		assert.equal(saved.ok, true, saved.ok ? "" : saved.message);
		const observations = (written[0] as { observations: Record<string, unknown>[] }).observations;
		assert.deepEqual(observations.map((o) => o.result), ["incorrect", "correct"], "his first try, then his fix");
		assert.equal(observations[0]!.sure, "confident");
		assert.ok(observations.every((o) => !("question" in o)), "the app's own field never reaches the engine");
		assert.deepEqual(links, [{ question: CONCLUDE, observation: "o7" }, { question: CONCLUDE, observation: "o8" }], "his answer's card shows both rows: First try, then Then");
	}
});

test("one answer of a question is still one observation with one result (round 14, M2)", async () => {
	const question = { id: "a_q", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { question: "rank?" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
	const answered = { id: "r_q", role: "toolResult", toolCallId: "q1", toolName: "explain", content: [{ type: "text", text: "2" }], details: { text: "2", confidence: "confident" }, isError: false, timestamp: 2 } as unknown as LhMessage;
	const answers = answeredQuestionsOf([newUserMessage("go") as LhMessage, question, answered]);
	assert.ok(answers.get("q1"), "the question's answer is known");
	const written: unknown[] = [];
	const saved = await saveCourse(course(async (verb) => { written.push(verb); return { ok: true, json: { saved: [] } }; }, answers), {
		observations: [
			{ question: "q1", topics: ["rank"], text: "Found the rank", result: "incorrect", help: "none" },
			{ question: "q1", topics: ["rank"], text: "Found the rank", result: "correct", help: "none" },
		],
	});
	assert.equal(saved.ok, false);
	assert.match(saved.ok ? "" : saved.message, /one answer is one observation with one result/);
	assert.deepEqual(written, []);
});
