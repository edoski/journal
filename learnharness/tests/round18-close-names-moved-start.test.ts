/**
 * Round 18, M4 (2 D2, 3 n1): a start planned for today that the session's
 * saves moved left Home, and no close named it. In the Probability review a
 * hinted, then partly right, Random variables answer moved Expectation off
 * 8 Nov; in the Invertible matrices lesson a missed Homomorphisms answer
 * moved Linear maps off 8 Nov. Every save receipt carried the move
 * (`starts_moved`), and both closes named only the review days. A close he
 * asks for with Done for today that names a day names each start his study
 * moved off today, and a turn that never does is held at its end.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newDoneTonightMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";

const TODAY = "2026-11-08";

/** A save receipt as `course_save` returns it (`withDayWords` applied). */
function saved(id: string, starts: Record<string, unknown>): LhMessage {
	const receipt = { revision: 3, changed: true, observations: ["o93"], reviews: {}, ...(Object.keys(starts).length > 0 ? { starts_moved: starts } : {}) };
	return { id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: JSON.stringify(receipt) }], details: null, isError: false, timestamp: 1 } as unknown as LhMessage;
}

const EXPECTATION = {
	expectation: {
		title: "Expectation and linearity",
		starts: "2026-11-15",
		starts_words: "Sunday 15 November",
		moved: { from: TODAY, from_words: "Sunday 8 November", by: "study", day: "today", waits_on: ["Random variables and distributions"] },
	},
};
const LATER = {
	"linear-maps": {
		title: "Linear maps and their matrices",
		starts: "2026-11-10",
		starts_words: "Tuesday 10 November",
		moved: { from: "2026-11-09", from_words: "Monday 9 November", by: "study", day: "today", waits_on: ["Homomorphisms (linear maps)"] },
	},
};

function refusedRules(guard: VoiceGuard, words: string, id = "s1"): string[] {
	const send: ToolCall = { type: "toolCall", id, name: SEND_TO_USER_TOOL, arguments: { message: words } };
	guard.screen(send);
	const decision = (guard as unknown as { decisions: Map<string, { details: { rules?: string[] } } | null> }).decisions.get(id);
	return decision?.details.rules ?? [];
}

const LENS_CLOSE = "Your review stopped at the four-set question, and Inclusion-exclusion comes back tomorrow, Monday 9 November. Binomial distribution comes back on Sunday 15 November and Random variables and distributions on Tuesday 17 November.";

describe("a close names each start his study moved off today (round 18, M4)", () => {
	let pinned: string | undefined;
	beforeEach(() => {
		pinned = process.env.LEARNING_TODAY;
		process.env.LEARNING_TODAY = TODAY;
	});
	afterEach(() => {
		if (pinned === undefined) delete process.env.LEARNING_TODAY;
		else process.env.LEARNING_TODAY = pinned;
	});

	it("refuses the lens's close, which named only the review days", () => {
		const guard = new VoiceGuard([saved("c1", {}), saved("c2", EXPECTATION), newDoneTonightMessage("prober")]);
		assert.ok(refusedRules(guard, LENS_CLOSE).includes("moved-start"));
	});

	it("passes a close that names the moved start, by its title", () => {
		const guard = new VoiceGuard([saved("c2", EXPECTATION), newDoneTonightMessage("prober")]);
		const words = `${LENS_CLOSE.split(". ")[0]}. *Expectation and linearity* now starts on Sunday 15 November, since it waits on Random variables and distributions.`;
		assert.deepEqual(refusedRules(guard, words).filter((r) => r === "moved-start"), []);
	});

	it("asks nothing of a start a later save put back, or of one moved off another day", () => {
		assert.deepEqual(refusedRules(new VoiceGuard([saved("c2", EXPECTATION), saved("c3", {}), newDoneTonightMessage("prober")]), LENS_CLOSE).filter((r) => r === "moved-start"), []);
		assert.deepEqual(refusedRules(new VoiceGuard([saved("c2", LATER), newDoneTonightMessage("teacher")]), LENS_CLOSE).filter((r) => r === "moved-start"), []);
	});

	it("reads a save made in the closing turn itself", async () => {
		const guard = new VoiceGuard([newDoneTonightMessage("teacher")]);
		const call: ToolCall = { type: "toolCall", id: "c9", name: "course_save", arguments: { changes: {} } };
		guard.screen(call);
		const content = (saved("c9", EXPECTATION) as unknown as { content: AgentToolResult<unknown>["content"] }).content;
		const tool: AgentTool<any> = { name: "course_save", label: "course_save", description: "", parameters: {} as never, execute: async () => ({ content, details: null }) };
		await guard.wrap(tool).execute(call.id, call.arguments as never);
		assert.ok(refusedRules(guard, LENS_CLOSE).includes("moved-start"));
	});

	it("leaves a message that names no day alone, and holds a turn that never names the move", () => {
		const guard = new VoiceGuard([saved("c2", EXPECTATION), newDoneTonightMessage("prober")]);
		assert.deepEqual(refusedRules(guard, "The four-set count adds the quadruple intersection back.").filter((r) => r === "moved-start"), []);
		assert.match(guard.beforeEnd() ?? "", /Expectation and linearity was planned for today and now starts Sunday 15 November, since it waits on Random variables and distributions/);
		assert.equal(guard.beforeEnd(), undefined, "held once a turn");
	});

	it("asks nothing of a turn that is not his Done for today", () => {
		const guard = new VoiceGuard([saved("c2", EXPECTATION)]);
		assert.deepEqual(refusedRules(guard, LENS_CLOSE).filter((r) => r === "moved-start"), []);
	});
});

it("every agent's Done for today asks for the starts moved off today (round 18, M4)", async () => {
	const { DONE_TONIGHT_TEXT } = await import("../src/core/contracts/chat.ts");
	for (const [agent, text] of Object.entries(DONE_TONIGHT_TEXT)) assert.match(text, /a start planned for today that his answers moved \(a save's `starts_moved` whose `moved\.from` is today\) is named too/, agent);
});
