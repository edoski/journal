/**
 * Round 18, m13 (4 minor 1): with Real Analysis's record unreadable, Next
 * problem opened "No hint was given on the ordered-field problem or the
 * √n/(n+1) problem, so marking them as solved 'with the hint' was my
 * error. Your bound by 1/√n was a complete, right answer, reached on your
 * own." over two cards that still read "With help". The round-17 guard
 * knew only "re-mark", "dispute" and "change the marks". And the fixed
 * map's reply, "Splitting on whether n is even or odd is what made it
 * work", gave no verdict though its save had failed: the problem's
 * conclude never ran through the guard (`guards` left it out), so the
 * failure owed nothing, and its first draft "Right, with one nudge." was
 * refused as grading a right answer. Replayed from lens 4's session.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { NEXT_PROBLEM_TEXT } from "../src/core/contracts/chat.ts";

const LENS = "No hint was given on the ordered-field problem or the $\\sqrt{n}/(n+1)$ problem, so marking them as solved \"with the hint\" was my error. Your bound by $1/\\sqrt{n}$ was a complete, right answer, reached on your own.";
let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};
const problem = (): ToolCall => ({ type: "toolCall", id: `p-${++n}`, name: "problem", arguments: { statement: "Prove $\\sqrt{n}/(n+1) \\to 0$.", mode: "recall", topics: ["sequences"], modelSolution: "Bound by $1/\\sqrt{n}$." } });
const concluded = (call: ToolCall): LhMessage => ({ role: "toolResult", toolCallId: call.id, toolName: "conclude", content: [{ type: "text", text: "Problem concluded." }], isError: false, timestamp: 1 }) as unknown as LhMessage;

/** The set's last problem concluded, then his Next problem. */
function nextProblem(): VoiceGuard {
	const p = problem();
	const c: ToolCall = { type: "toolCall", id: `c-${++n}`, name: "conclude", arguments: { outcome: "solvedWithHints", result: "partial", response: "bound" } };
	return new VoiceGuard([
		newUserMessage("Practice sequences and the limit of a sequence, exam-style."),
		assistant([p]),
		{ id: `t-${++n}`, role: "custom", customType: "practice-thinking", content: "Your thinking:\nI think $\\sqrt{n}/(n+1) < 1/\\sqrt{n}$, which tends to 0.", display: false, details: { problemCallId: p.id }, timestamp: 1 } as LhMessage,
		assistant([c]),
		concluded(c),
		{ id: `nx-${++n}`, role: "custom", customType: "practice-next", content: NEXT_PROBLEM_TEXT, display: false, details: {}, timestamp: 2 } as LhMessage,
	], undefined, false, true);
}

/** His fixed map on a problem, the turn that grades it. */
function fixedWork(): VoiceGuard {
	const p = problem();
	return new VoiceGuard([
		newUserMessage("Practice sequences"),
		assistant([p]),
		{ id: `t-${++n}`, role: "custom", customType: "practice-thinking", content: "Your thinking:\nnone, it never hits negatives. fix: f(2k) = 2k + 1 and f(2k+1) = -(2k + 1)", display: false, details: { problemCallId: p.id }, timestamp: 1 } as LhMessage,
	], undefined, false, true);
}

/** A tool run through the guard as the teacher agent runs it: wrapped only
 *  when the guard says it guards it. */
async function run(guard: VoiceGuard, name: string, args: Record<string, unknown>, result: { text: string; details?: unknown; isError?: boolean }): Promise<void> {
	const call: ToolCall = { type: "toolCall", id: `r-${++n}`, name, arguments: args as ToolCall["arguments"] };
	guard.screen(call);
	const tool = { name, label: name, description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: result.text }], details: result.details ?? null, ...(result.isError ? { isError: true } : {}) }) } as unknown as AgentTool<never>;
	await (guard.guards(name) ? guard.wrap(tool) : tool).execute(call.id, args as never, undefined, undefined);
}

describe("an earlier mark he never disputed is never raised (round 18, m13)", () => {
	it("Next problem's words on two seeded marks are refused, sentence by sentence", () => {
		assert.ok(rules(nextProblem(), send(LENS)).includes("undisputed"));
		assert.ok(rules(nextProblem(), send("Your bound by $1/\\sqrt{n}$ was a complete, right answer, reached on your own.")).includes("undisputed"));
		assert.ok(rules(nextProblem(), send("No hint was given on the ordered-field problem.")).includes("undisputed"));
		assert.ok(voiceBreaks("Marking them as solved with the hint was my error.").some((b) => b.rule === "own-words"));
		assert.ok(voiceBreaks("I found two mistakes of mine from earlier.").some((b) => b.rule === "own-words"));
	});

	it("words that pose the next problem pass", () => {
		assert.deepEqual(rules(nextProblem(), send("This one is on countable sets.")), []);
	});

	it("after a re-mark refused for want of a dispute, the turn tells him nothing of it", async () => {
		const guard = fixedWork();
		await run(guard, "course_save", { changes: { observations: [{ topics: ["sequences"], result: "correct", help: "none", corrects: ["o40"], text: "Bounded it" }] } }, { text: "Nothing was saved or read. observations[0].corrects: he did not dispute o40", isError: true });
		assert.ok(rules(guard, send("Your bound earlier was right, reached on your own.")).includes("undisputed"));
	});

	it("his own question about a mark may be answered", () => {
		const guard = new VoiceGuard([newUserMessage("Practice sequences"), assistant([send("Here is one.")]), newUserMessage("why is the -x < 0 card marked with help?")], undefined, false, true);
		assert.ok(!rules(guard, send("It stays marked with help unless you dispute it from its card.")).includes("undisputed"));
	});
});

describe("a problem whose save failed owes its verdict, opening the reply (round 18, m13)", () => {
	const unsaved = { text: "Problem concluded.\n\nThe attempt was not saved ([Errno 13] Permission denied).", details: { unsaved: [{ topics: ["cardinality"], result: "correct" }] } };

	it("the conclude runs through the guard", () => {
		assert.ok(fixedWork().guards("conclude"));
	});

	it("lens 4's reply with no verdict is refused, and the draft that opened on it passes", async () => {
		const guard = fixedWork();
		await run(guard, "conclude", { outcome: "solvedWithHints", result: "correct", response: "alternating map", verdict: "Your final map is a bijection." }, unsaved);
		assert.ok(rules(guard, send("Splitting on whether $n$ is even or odd is what made it work, since each half of $\\mathbb{N}$ then covers one sign.")).includes("verdict-words"));
		assert.deepEqual(rules(guard, send("Right, with one nudge. The move that made it work was splitting on whether $n$ is even or odd, so one half of $\\mathbb{N}$ covers each sign.")), []);
	});

	it("a verdict word late in the reply is no verdict", async () => {
		const guard = fixedWork();
		await run(guard, "conclude", { outcome: "solvedWithHints", result: "correct", response: "alternating map", verdict: "Right." }, unsaved);
		assert.ok(rules(guard, send("Splitting on parity is what made it work, and the map is right.")).includes("verdict-words"));
	});

	it("a turn that ends with no verdict is told to say it", async () => {
		const guard = fixedWork();
		await run(guard, "conclude", { outcome: "solvedWithHints", result: "correct", response: "alternating map", verdict: "Right." }, unsaved);
		assert.match(guard.beforeEnd() ?? "", /verdict in words/);
	});

	it("the prompt says it, and the record refuses a re-mark with what not to say", () => {
		const prompt = courseRecordPrompt("practice", { arcs: true });
		assert.match(prompt, /even one you judge your own slip, so never "marking it with the hint was my error"/);
	});
});

describe("his own question whether he was right (round 18, m13)", () => {
	it("is answered", () => {
		const guard = new VoiceGuard([newUserMessage("Practice sequences"), assistant([send("Here is one.")]), newUserMessage("was I right about the bound last time?")], undefined, false, true);
		assert.deepEqual(rules(guard, send("Yes, your bound by $1/\\sqrt{n}$ was right.")).filter((r) => r === "undisputed"), []);
	});
});
