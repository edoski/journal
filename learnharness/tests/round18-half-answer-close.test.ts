/**
 * Round 18, m15 (4 minor 4; 3 n4 in part): Done for today with a half
 * answer closed on "Your half answer in the Linear maps and their matrices
 * lesson is waiting for you there. Because that lesson is unfinished, Any
 * matrix represents a linear map moved from Monday 9 November to Tuesday
 * 10 November, and later starts moved too." "There" is the lesson he is
 * in; the title after a comma reads as a broken sentence; "later starts
 * moved too" gives nothing to act on. Lens 3's "Your half answer to the
 * wheel question is waiting for you" named no lesson. The prompt's own
 * words were "his half answer waiting for him there". Replayed from lens
 * 4's session and its save receipt.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { titleAfterComma, VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { DONE_TONIGHT_TEXT } from "../src/core/contracts/chat.ts";
import { LEFT_DRAFT_TEXT } from "../src/core/question-core.ts";

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const rules = (guard: VoiceGuard, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};

const RECEIPT = JSON.stringify({ revision: 51, changed: true, observations: [], saved: [], reviews: {}, reviewed: [], levels: {}, focus: "linear-maps-lesson", due_count: 0, notes: [], starts_moved: {
	"matrix-represents-map": { title: "Any matrix represents a linear map", starts: "2026-11-10", starts_words: "Tuesday 10 November", moved: { from: "2026-11-09", by: "study", from_words: "Monday 9 November" } },
	"matrix-sum-scalar": { title: "Sums and scalar products of matrices", starts: "2026-11-21", starts_words: "Saturday 21 November", moved: { from: "2026-11-09", by: "study", from_words: "Monday 9 November" } },
} });

/** The Linear maps lesson closed by Done for today over a half answer, after its save. */
async function closing(): Promise<VoiceGuard> {
	const recall: ToolCall = { type: "toolCall", id: `q-${++n}`, name: "recall", arguments: { question: "Which matrix represents $h$?", correctAnswer: "…" } };
	const guard = new VoiceGuard([
		newUserMessage("Linear maps and their matrices"),
		assistant([recall]),
		{ role: "toolResult", toolCallId: recall.id, toolName: "recall", content: [{ type: "text", text: "Dismissed." }], details: { kind: "explain", dismissed: true, reason: "tonight", draftKept: LEFT_DRAFT_TEXT }, isError: false, timestamp: 1 } as unknown as LhMessage,
		{ id: `d-${++n}`, role: "custom", customType: "done-tonight", content: DONE_TONIGHT_TEXT.prober, display: false, details: {}, timestamp: 2 } as LhMessage,
	], undefined, false, true);
	const save: ToolCall = { type: "toolCall", id: `c-${++n}`, name: "course_save", arguments: { changes: { tasks: { "linear-maps-lesson": { title: "Linear maps and their matrices lesson" } } } } };
	guard.screen(save);
	const tool = { name: "course_save", label: "course_save", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: RECEIPT }], details: null }) } as unknown as AgentTool<never>;
	await guard.wrap(tool).execute(save.id, save.arguments as never, undefined, undefined);
	return guard;
}

describe("the half-answer close's words (round 18, m15)", () => {
	it("lens 4's close is refused for each of its three slips", async () => {
		const broke = rules(await closing(), send("Your half answer in the Linear maps and their matrices lesson is waiting for you there. Because that lesson is unfinished, Any matrix represents a linear map moved from Monday 9 November to Tuesday 10 November, and later starts moved too."));
		for (const rule of ["half-answer", "title-comma", "vague-moves"]) assert.ok(broke.includes(rule), `${rule} in ${broke.join()}`);
	});

	it("lens 3's close names no session for the half answer", async () => {
		assert.ok(rules(await closing(), send("Your half answer to the wheel question is waiting for you. Your next Probability study is tomorrow, Monday 9 November.")).includes("half-answer"));
	});

	it("a close that names the lesson, sets off the title and names the rest passes", async () => {
		assert.deepEqual(rules(await closing(), send("Your half answer to the first question waits in your Linear maps and their matrices lesson. Starting “Any matrix represents a linear map” moves to Tuesday 10 November, and the rest are on your calendar.")), []);
	});

	it("titles in a list, or opening a sentence, read as they are", () => {
		const titles = ["Invertible matrices", "Homomorphisms", "Kernel and rank-nullity"];
		assert.equal(titleAfterComma("Invertible matrices, Homomorphisms and Kernel and rank-nullity come back tomorrow too.", titles), null);
		assert.equal(titleAfterComma("Homomorphisms comes back on Wednesday.", titles), null);
		// A day's items as the close is told them (`day_items`: "<title> review", "<title> starts").
		assert.equal(titleAfterComma("Tomorrow: Kernel and rank-nullity review, Homomorphisms review, Invertible matrices starts.", titles), null);
		assert.equal(titleAfterComma("Since this lesson is open, Homomorphisms waits.", titles), "Homomorphisms");
	});

	it("the close's instructions name the session and never say there", () => {
		assert.doesNotMatch(DONE_TONIGHT_TEXT.teacher, /waiting for him there/);
		assert.match(DONE_TONIGHT_TEXT.teacher, /waiting in this session by its name/);
		assert.match(LEFT_DRAFT_TEXT, /waits in your Invertible matrices lesson/);
	});
});
