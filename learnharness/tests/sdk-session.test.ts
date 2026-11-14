import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	CONTINUE_TEXT,
	nextChatSession,
	owedMessages,
	sdkInputBlocks,
	sessionResume,
	type ChatSession,
} from "../src/core/sdk-session.ts";
import { concludedByDismissalPair, newAnswerResult, newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { newCompactionMarker } from "../src/core/compaction.ts";

const reply = (id: string, calls: { id: string; name: string }[] = [], stopReason: "stop" | "toolUse" | "error" | "aborted" = calls.length ? "toolUse" : "stop"): LhMessage => ({
	id, role: "assistant", api: "anthropic-messages", provider: "claude-subscription", model: "claude-opus-5-5",
	content: calls.length ? calls.map((c) => ({ type: "toolCall" as const, id: c.id, name: c.name, arguments: {} })) : [{ type: "text", text: "Sure." }],
	stopReason, timestamp: 0,
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
} as LhMessage);
const result = (id: string, toolCallId: string, toolName: string): LhMessage => ({ id, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], isError: false, timestamp: 0 } as LhMessage);
const user = (text: string): LhMessage => ({ ...newUserMessage(text), id: `u_${text}` } as LhMessage);

describe("what a turn owes the lesson's session", () => {
	it("a new lesson owes everything; a resumed one owes what came after the synced point", () => {
		const first = user("teach me");
		assert.deepEqual(owedMessages([first], undefined), [first]);
		const record = [first, reply("a1"), user("next")];
		assert.deepEqual(owedMessages(record, { id: "s", synced: "a1" })!.map((m) => m.id), ["u_next"]);
	});

	it("a record holding model output its session never saw cannot continue", () => {
		assert.equal(owedMessages([user("hi"), reply("a1"), user("again")], undefined), null, "a lesson from before sessions");
		assert.equal(owedMessages([user("hi"), reply("a1")], { id: "s", synced: "gone" }), null, "a synced point the record lacks");
	});

	it("a failed first turn starts over with a fresh session, its failure set aside", () => {
		const session: ChatSession = { id: "s", synced: null, cut: true };
		assert.deepEqual(sessionResume(session), {}, "no anchor: nothing to resume");
		assert.deepEqual(owedMessages([user("hi"), reply("f", [], "error")], session)!.map((m) => m.id), ["u_hi", "f"]);
	});

	it("a cut turn resumes at its anchor", () => {
		assert.deepEqual(sessionResume({ id: "s", synced: "a1", anchor: "x", cut: true }), { resume: "s", at: "x" });
		assert.deepEqual(sessionResume({ id: "s", synced: "a1", anchor: "x" }), { resume: "s" });
	});
});

describe("the owed messages as one user message", () => {
	it("learner words pass as they are; an answer is tagged with the call it answers", () => {
		const answer = newAnswerResult("call-1", "explain", { kind: "explain", questionText: "Why?", options: [], answers: [], text: "Because.", answeredAt: "t" });
		const blocks = sdkInputBlocks([answer, user("and also")]);
		assert.equal(blocks.length, 2);
		assert.match((blocks[0] as { text: string }).text, /^<answer tool="explain" call="call-1">\n\{"question":"call-1".*"text":"Because\."/s);
		assert.deepEqual(blocks[1], { type: "text", text: "and also" });
	});

	it("held model output, UI-only markers and the record's compaction markers give nothing", () => {
		const marker = newCompactionMarker("summary", { firstKeptMessageId: "", tokensBefore: 1, at: "t" });
		assert.deepEqual(sdkInputBlocks([reply("a1", [{ id: "c", name: "course_show" }]), result("r", "c", "course_show"), marker as LhMessage]), []);
	});

	it("an app-made conclude reads as a note, never as the model's own call", () => {
		const [call, ack] = concludedByDismissalPair("prob-1");
		const blocks = sdkInputBlocks([call, ack]);
		assert.equal(blocks.length, 1);
		assert.match((blocks[0] as { text: string }).text, /^<app_note tool="conclude" outcome="dismissed" problem="prob-1">/);
	});

	it("nothing owed sends the continue line", () => {
		assert.equal(CONTINUE_TEXT, "Continue from where you stopped.");
	});
});

describe("the session map after a turn", () => {
	const record = [user("hi"), reply("a1", [{ id: "c1", name: "course_show" }]), result("r1", "c1", "course_show"), reply("a2", [], "error")];

	it("a finished turn holds everything up to the record's end", () => {
		assert.deepEqual(nextChatSession(undefined, { id: "s", anchor: "x", held: "all" }, record), { id: "s", synced: "a2", anchor: "x" });
	});

	it("a failed turn that kept tool results holds through the last one, and is cut", () => {
		assert.deepEqual(nextChatSession({ id: "s", synced: null }, { id: "s", anchor: "y", held: { through: "c1" } }, record), { id: "s", synced: "r1", anchor: "y", cut: true });
	});

	it("a failed turn that kept nothing keeps the previous point, and is cut", () => {
		assert.deepEqual(nextChatSession({ id: "s", synced: "a0", anchor: "z" }, { id: "s", held: "none" }, record), { id: "s", synced: "a0", anchor: "z", cut: true });
		assert.deepEqual(nextChatSession(undefined, { id: "s2", held: "none" }, record), { id: "s2", synced: null, cut: true });
	});
});
