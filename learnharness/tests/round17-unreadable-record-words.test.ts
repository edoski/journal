/**
 * Round 17, m18 (4 minor 2, 4 minor 5 in part): with Real Analysis's
 * record unreadable, his fixed bijection got "Because ℕ runs one way and
 * 3ℤ runs both ways, any bijection between them must alternate signs. I
 * can't change those two card marks myself, but disputing them from the
 * cards gets them re-marked." It gave no verdict, though his card could
 * show no mark, and it raised two seeded marks he never disputed. Its
 * draft opened "A correction to what I said earlier", about a turn end he
 * never saw. The voice now refuses all three, and the prompt says so.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { voiceBreaks } from "../src/core/voice-check.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";

const LENS = "Because $\\mathbb{N}$ runs one way and $3\\mathbb{Z}$ runs both ways, any bijection between them must alternate signs. I can't change those two card marks myself, but disputing them from the cards gets them re-marked.";
const AFTER = "The two cards from earlier, for $-x < 0$ and $\\sqrt{n}/(n+1) \\to 0$, keep their marks unless you dispute them from the cards.";
let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};

/** A practice turn opening on his fixed work. */
function practice(words = "fix: f(n) = 3n/2 for n even, f(n) = -3(n-1)/2 for n odd"): VoiceGuard {
	const problem: ToolCall = { type: "toolCall", id: `p-${++n}`, name: "problem", arguments: { statement: "Show that $3\\mathbb{Z}$ is countable.", mode: "recall", topics: ["cardinality"], modelSolution: "Alternate signs." } };
	return new VoiceGuard([newUserMessage("Practice sequences"), assistant([problem]), { id: `t-${++n}`, role: "custom", customType: "practice-thinking", content: `Your thinking:\n${words}`, display: false, details: { problemCallId: problem.id }, timestamp: 1 } as LhMessage]);
}

/** Runs a conclude through the guard's wrap, with the result the record gives. */
async function conclude(guard: VoiceGuard, details: unknown): Promise<void> {
	const tool = { name: "conclude", label: "conclude", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: "The attempt was not saved." }], details }) } as unknown as AgentTool<never>;
	await guard.wrap(tool).execute(`c-${++n}`, { result: "correct", outcome: "solvedWithHints", verdict: "Right." } as never, undefined, undefined);
}

describe("words while the record can't be read (round 17, m18)", () => {
	it("a mark he never disputed is never raised, in either reply the lens saw", () => {
		assert.ok(rules(practice(), send(LENS)).includes("undisputed"));
		assert.ok(rules(practice("the record works again, can you save my answers now?"), send(AFTER)).includes("undisputed"));
	});

	it("his own question about a mark, or his dispute, may be answered", () => {
		assert.ok(!rules(practice("is the mark on the -x < 0 card wrong?"), send("That mark stands unless you dispute it from its card.")).includes("undisputed"));
		assert.ok(!voiceBreaks("A remark on the bound: it holds for every $n$.").some((b) => b.rule === "own-words"));
	});

	it("after a save that failed, the reply opens on its verdict in words", async () => {
		const guard = practice();
		await conclude(guard, { unsaved: [{ topics: ["cardinality"], result: "correct" }] });
		assert.ok(rules(guard, send("Because $\\mathbb{N}$ runs one way and $3\\mathbb{Z}$ runs both ways, any bijection between them must alternate signs.")).includes("verdict-words"));
		assert.ok(!rules(guard, send("Right, and each branch of your map is one-to-one.")).includes("verdict-words"));
	});

	it("a turn that would end with no verdict is told to say it", async () => {
		const guard = practice();
		await conclude(guard, { unsaved: [{ topics: ["cardinality"], result: "correct" }] });
		assert.match(guard.beforeEnd() ?? "", /verdict in words/);
	});

	it("a save that went through owes no words", async () => {
		const guard = practice();
		await conclude(guard, null);
		assert.ok(!rules(guard, send("Any bijection from $\\mathbb{N}$ onto $3\\mathbb{Z}$ must alternate signs.")).includes("verdict-words"));
	});

	it("a pointer to its own earlier words is refused", () => {
		assert.ok(voiceBreaks("A correction to what I said earlier: I can't change those marks.").some((b) => b.rule === "own-words"));
		assert.ok(voiceBreaks("As for what I said earlier, the bound holds.").some((b) => b.rule === "own-words"));
	});

	it("the course prompt says both rules", () => {
		const prompt = courseRecordPrompt("practice", { arcs: true });
		assert.match(prompt, /Never raise a mark he has not disputed, nor how to dispute one/);
		assert.match(prompt, /\*\*A save that fails\.\*\* While the record cannot be read, his answer's card shows no mark/);
	});
});
