/**
 * A practice answer's mark stays beside the answer when Done for today
 * comes while it is being graded (round 14, 4 aspect 6; the remainder of
 * round 13's major 2). ⌘⇧D 2.5 s after "column 3 = column 1 + column 2…,
 * so rank A = 2" at Guessing: the close turn concluded the problem, and its
 * "Right · On your own · Guessing" and Model solution sat under the Done
 * for today line, away from the answer (`36b`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { LhMessage } from "../src/core/native-messages.ts";
import { inputAppends } from "../src/core/input-events.ts";
import { newThinkingMessage, PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, SEND_TO_USER_TOOL } from "../src/core/native-messages.ts";
import { projectView } from "../src/core/view.ts";
import { marksBeforeDone } from "../components/lesson/marks-before-done.ts";
import { partKey } from "../components/lesson/roadmap-facts.ts";

const STAMPS = {
	api: "faux", provider: "test", model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
} as const;
const assistant = (id: string, content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "toolUse"): LhMessage =>
	({ id, role: "assistant", content, timestamp: 1, ...STAMPS, stopReason }) as LhMessage;
const ack = (toolCallId: string, toolName: string): LhMessage =>
	({ id: `r_${toolCallId}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details: null, isError: false, timestamp: 2 }) as LhMessage;

const posed = [
	assistant("a_p1", [{ type: "toolCall", id: "call_p1", name: PRACTICE_PROBLEM_TOOL, arguments: { statement: "What is rank $A$, and why?", mode: "recall", modelSolution: "Column 3 is the sum of the first two, so the rank is 2." } }]),
	ack("call_p1", PRACTICE_PROBLEM_TOOL),
	newThinkingMessage("call_p1", "column 3 = column 1 + column 2, and after elimination rows 2-4 all become multiples of (0,1,1), so rank A = 2", "guessing"),
];

/** Where the transcript draws each problem's close: its message and part,
 *  and whether it comes before or after the Done for today line. */
function closes(record: LhMessage[]) {
	const view = projectView(record);
	const { before, moved } = marksBeforeDone(view);
	const line = view.findIndex((m) => m.parts.some((p) => p.type === "data-done-tonight"));
	const drawn: string[] = [];
	view.forEach((m, mi) => {
		if (mi === line) {
			for (const _ of before.get(mi) ?? []) drawn.push("mark");
			drawn.push("line");
		}
		m.parts.forEach((p, pi) => {
			if (p.type === "tool-conclude" && !moved.has(partKey(mi, pi))) drawn.push("mark");
			else if (p.type === "text") drawn.push("words");
		});
	});
	return drawn;
}

describe("the mark of an answer graded after Done for today (round 14, 4 aspect 6)", () => {
	it("is drawn above the Done for today line, beside the answer, with the closing words under the line", () => {
		const done = inputAppends({ messages: posed, kind: "practice" }, { type: "tonight" });
		const close = [
			assistant("a_close", [
				{ type: "toolCall", id: "c1", name: PRACTICE_CONCLUDE_TOOL, arguments: { outcome: "solved", result: "correct", help: "none" } },
				{ type: "toolCall", id: "s1", name: SEND_TO_USER_TOOL, arguments: { message: "Your rank review comes back on Thursday 12 November." } },
			]),
			ack("c1", PRACTICE_CONCLUDE_TOOL),
			ack("s1", SEND_TO_USER_TOOL),
			assistant("a_end", [], "stop"),
		];
		const drawn = closes([...posed, ...done, ...close]);
		assert.deepEqual(drawn.slice(drawn.indexOf("mark")), ["mark", "line", "words"], drawn.join(" "));
	});

	it("leaves a close with no Done for today where it is", () => {
		const close = [assistant("a_c", [{ type: "toolCall", id: "c1", name: PRACTICE_CONCLUDE_TOOL, arguments: { outcome: "solved", result: "correct", help: "none" } }]), ack("c1", PRACTICE_CONCLUDE_TOOL)];
		assert.equal(marksBeforeDone(projectView([...posed, ...close])).before.size, 0);
	});
});
