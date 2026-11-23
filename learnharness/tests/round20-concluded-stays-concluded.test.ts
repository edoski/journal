/**
 * Round 20, M4 (c) (4 minor 1): Rank practice, a fixed answer. "Model
 * solution" showed at 17.9 s, vanished when the turn ended at 19.9 s and
 * came back with the marks at 22.9 s; in between the dock showed the whole
 * answered problem with "Work here, think out loud." The Claude Code run
 * streams each tool result as its own message with no id (sdk/agent.ts
 * `append`), and the window dropped every id-less message, so a conclude
 * read as concluded only through the stream's executions, which end with
 * the stream. The window now keeps those results in its tail by their
 * call, as it keeps `turn_end`'s batch, until the record's copy lands.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import { activeProblemOf, type LhMessage } from "../src/core/native-messages.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

const sse = (...events: unknown[]) => events.map((e) => (e === "[DONE]" ? "data: [DONE]\n\n" : `data: ${JSON.stringify(e)}\n\n`)).join("");

const POSE = "toolu_problem_rank";
const CONCLUDE = "toolu_conclude_rank";
const posed: LhMessage[] = [
	{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: POSE, name: "problem", arguments: { statement: "Find a basis of the column space.", mode: "recall" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage,
	{ id: "r1", role: "toolResult", toolCallId: POSE, toolName: "problem", content: [{ type: "text", text: "Problem posed" }], details: null, isError: false, timestamp: 2 } as unknown as LhMessage,
	{ id: "u1", role: "user", content: "oh, column 3 then", timestamp: 3 } as unknown as LhMessage,
];

/** The run's wire for the fixed answer, as sdk/agent.ts emits it: the
 *  conclude call, its result as an id-less message, the closing words. */
function wire(): string {
	const call = { role: "assistant", content: [{ type: "toolCall", id: CONCLUDE, name: "conclude", arguments: { outcome: "solved", solutionReveal: "Columns 1 and 3 of A." } }], stopReason: "toolUse" };
	const result = { role: "toolResult", toolCallId: CONCLUDE, toolName: "conclude", content: [{ type: "text", text: "Concluded." }], details: null, isError: false, timestamp: 4 };
	const words = { role: "assistant", content: [{ type: "text", text: "Columns 1 and 3 are the pivot columns." }], stopReason: "stop" };
	return sse(
		{ type: "agent_start" },
		{ type: "message_start", message: call },
		{ type: "message_end", message: call },
		{ type: "tool_execution_end", toolCallId: CONCLUDE, toolName: "conclude", isError: false, result: { content: result.content, details: null } },
		{ type: "message_start", message: result },
		{ type: "message_end", message: result },
		{ type: "message_start", message: words },
		{ type: "message_end", message: words },
		{ type: "agent_end", messages: [] },
		"[DONE]",
	);
}

describe("a concluded problem once the turn's stream has ended", () => {
	it("stays concluded, with its Model solution drawn, before the record is read again", async () => {
		globalThis.fetch = (async (url: RequestInfo | URL) => {
			if (String(url).endsWith("/stream")) return new Response(wire(), { status: 200 });
			throw new Error(`unexpected fetch: ${String(url)}`);
		}) as typeof fetch;
		const m = new SessionModel({ chatId: "chat_x", initialMessages: posed });
		assert.notEqual(activeProblemOf(m.getState().nativeMessages), null, "the problem is open before the turn");
		await m.resumeStream(false);
		assert.equal(m.status, "ready", "the stream has ended");
		assert.equal(activeProblemOf(m.getState().nativeMessages), null, "the dock never re-shows the answered problem");
		const conclude = m.getState().messages.flatMap((v) => v.parts).find((p) => p.type === "tool-conclude");
		assert.equal(conclude?.state, "output-available", "the conclude still reads as ended, so its mark and Model solution stay");
	});

	it("takes the record's copy in place of its own once the record is read", async () => {
		globalThis.fetch = (async (url: RequestInfo | URL) => {
			if (String(url).endsWith("/stream")) return new Response(wire(), { status: 200 });
			throw new Error(`unexpected fetch: ${String(url)}`);
		}) as typeof fetch;
		const m = new SessionModel({ chatId: "chat_x", initialMessages: posed });
		await m.resumeStream(false);
		const kept = m.getState().nativeMessages.filter((x) => x.role === "toolResult" && x.toolCallId === CONCLUDE);
		assert.equal(kept.length, 1);
		const stamped = { ...kept[0]!, id: "r2" } as LhMessage;
		m.adoptRecord([...posed, stamped]);
		const after = m.getState().nativeMessages.filter((x) => x.role === "toolResult" && x.toolCallId === CONCLUDE);
		assert.deepEqual(after.map((x) => x.id), ["r2"], "one result, the record's");
	});
});
