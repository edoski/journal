/**
 * Round 19, M2's status half (1 N1): after marking his prediction the
 * tutor's lesson turn stopped empty, with no question and no close, steps
 * still ahead. The lesson read finished, so it left Home, the sidebar and
 * its page's Now. It is left where it stopped: "Left off today".
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-silent-stall-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LEARNING_TODAY = "2026-11-08";
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { sessionState } = await import("../components/nav/session-state.ts");
after(() => {
	delete process.env.LEARNING_TODAY;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const at = () => Date.parse("2026-11-08T10:00:00Z") + ++n * 1000;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse") => ({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: at() });
const call = (name: string, args: unknown, result: unknown = { ok: true }) => {
	const id = `c${++n}`;
	const ask = assistant([{ type: "toolCall", id, name, arguments: args }], "toolUse");
	return [ask, { id: `r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], details: result, isError: false, timestamp: ask.timestamp }];
};
const answered = (questionText: string, text: string) => ({ kind: "explain", questionText, answers: [{ text }], answeredAt: "2026-11-08T10:00:00Z" });
const LA = { workspace: "/s/la", title: "Linear Algebra" };
const TREE = { nodes: [{ id: "eigen-predict", title: "Guess first" }, { id: "eigen-spectrum", title: "A 2×2 spectrum" }], edges: [{ from: "eigen-predict", to: "eigen-spectrum" }], version: 1 as const };

function lessonEndingWith(last: unknown) {
	const created = chatStore.createChat("Eigenvalues and eigenvectors", LA, ["eigen"]);
	chatStore.saveMessages(created.id, [
		newUserMessage("Eigenvalues and eigenvectors"),
		...call("probe_done", { assessment: { strands: [{ strand: "Eigenvalues", assessment: "new" }], summary: "Teach from a guess." } }),
		...call("plan_init", { mermaid: "graph TD\n  eigen-predict[Guess first] --> eigen-spectrum[A 2×2 spectrum]" }),
		...call("explain", { type: "predict", nodeId: "eigen-predict", question: "Which lines does A keep?", correctAnswer: "The lines through (1,1) and (1,-1)." }, answered("Which lines does A keep?", "The two axes, each stretched by 2")),
		...call("course_save", { changes: { observations: [{ topics: ["eigen"], text: "Predicted the axes are kept", result: "incorrect", help: "none", sure: "guess", predicted: true }] } }),
		...call("send_to_user", { message: "Not right: A(1,0) = (2,1), so the x-axis is not kept." }),
		last,
	] as never);
	chatStore.saveTree(created.id, TREE);
	return { ...chatStore.listChats().find((c) => c.id === created.id)!, busy: false };
}

describe("a lesson turn that stopped with no words, no question and no close, steps ahead, is left where it stopped (round 19, M2)", () => {
	it("reads Left off today, not finished", () => {
		const lesson = lessonEndingWith(assistant([], "stop"));
		assert.equal(lesson.ended, "left");
		assert.equal(sessionState(lesson), "left");
	});

	it("a sign-off in its own words still ends it", () => {
		assert.equal(lessonEndingWith(assistant([{ type: "text", text: "Good place to stop. Practice comes next, in a day or two." }], "stop")).ended, "closed");
	});
});
