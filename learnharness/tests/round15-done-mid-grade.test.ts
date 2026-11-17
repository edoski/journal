/**
 * Round 15, M4 (4 major 3; supersedes round-14 m25): ⌘⇧D 2.5 s after a
 * sent answer. The app dropped the problem as `dismissed` and told the
 * tutor nothing was recorded; the tutor then saved o44 (correct,
 * `transfer`, no `sure`) as "his-message". The chat read "Left for next
 * time" with no mark, and the topic page listed o44 (`36`, `36b`, `112`).
 *
 * The cut grading turn left an empty reply (`stopReason: "stop"`, no
 * content) before its aborted one, and the fold that keeps a sent answer
 * for grading read that empty reply as the turn's end. A reply with no
 * words and no call answered nothing, so the answer is graded through
 * `conclude` with his Guessing; and a save of a problem the app dropped is
 * refused.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	answeredQuestionsOf,
	HIS_MESSAGE,
	newProblemDismissedMarker,
	newThinkingMessage,
	newUserMessage,
	workAwaitingGradeOf,
	type LhMessage,
} from "../src/core/native-messages.ts";
import { tonightAppends } from "../src/core/input-events.ts";
import { saveCourse, type CourseToolContext } from "../src/agent/tools/course.ts";

const POSE = "toolu_pose";
const asked = newUserMessage("next problem please") as LhMessage;
const pose = { id: "a_pose", role: "assistant", content: [{ type: "toolCall", id: POSE, name: "problem", arguments: { statement: "What is $\\operatorname{rank} B$, and why?", mode: "recall", topics: ["rank"], modelSolution: "2" } }], stopReason: "toolUse", timestamp: 1 } as unknown as LhMessage;
const posed = { id: "r_pose", role: "toolResult", toolCallId: POSE, toolName: "problem", content: [{ type: "text", text: "Problem posed" }], isError: false, timestamp: 2 } as unknown as LhMessage;
const work = newThinkingMessage(POSE, "column 3 = column 1 + 2*column 2, so rank B = 2", "guessing") as LhMessage;
/** What lens 4's record holds after the cut grade (messages 34 and 35). */
const emptyStop = { id: "a_empty", role: "assistant", content: [], stopReason: "stop", timestamp: 3 } as unknown as LhMessage;
const emptyAborted = { id: "a_aborted", role: "assistant", content: [], stopReason: "aborted", timestamp: 4 } as unknown as LhMessage;
const thinkingOnly = { id: "a_think", role: "assistant", content: [{ type: "thinking", thinking: "Columns 1 and 2 are independent…" }], stopReason: "stop", timestamp: 3 } as unknown as LhMessage;

test("a sent answer whose grade was cut, leaving empty replies, is still owed its grade at Done for today (round 15, M4)", () => {
	for (const cut of [[emptyStop, emptyAborted], [thinkingOnly, emptyAborted], [emptyStop]]) {
		const record = [asked, pose, posed, work, ...cut];
		assert.equal(workAwaitingGradeOf(record, POSE), true, JSON.stringify(cut.map((m) => (m as { stopReason?: string }).stopReason)));
		const appends = tonightAppends({ messages: record, kind: "practice" });
		const kinds = appends.map((m) => (m as { customType?: string }).customType);
		assert.ok(!kinds.includes("problem-dismissed"), "the answer he sent is not dropped");
		assert.ok(appends.some((m) => typeof (m as { content?: unknown }).content === "string" && ((m as { content: string }).content).startsWith("[UNGRADED WORK]")), "the closing turn grades it through conclude, with his confidence");
	}
	const replied = { id: "a_said", role: "assistant", content: [{ type: "text", text: "Right: column 3 is a combination of the first two." }], stopReason: "stop", timestamp: 5 } as unknown as LhMessage;
	assert.equal(workAwaitingGradeOf([asked, pose, posed, work, replied], POSE), false, "a reply that said something did answer it");
});

test("a save of a problem the app dropped is refused: \"his-message\" stands for nothing of it (round 15, M4)", async () => {
	const dropped = [asked, pose, posed, work, newProblemDismissedMarker(POSE) as LhMessage];
	const answers = answeredQuestionsOf(dropped);
	assert.equal(answers.get(HIS_MESSAGE)?.dropped, true);
	const writes: unknown[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/w", title: "Linear Algebra" },
		records: { run: async (_w: string, verb: { verb: string; changes?: unknown }) => { writes.push(verb); return { ok: true, json: { saved: ["o44"] } }; } } as unknown as CourseToolContext["records"],
		arcs: false,
		answers,
	};
	const saved = await saveCourse(ctx, { observations: [{ question: HIS_MESSAGE, topics: ["rank"], text: "Found the rank of a 4×3 matrix", result: "correct", help: "none", transfer: true }] });
	assert.equal(saved.ok, false);
	assert.match(saved.ok ? "" : saved.message, /dropped with nothing recorded/);
	assert.deepEqual(writes, [], "nothing reaches the record");

	// His message after the dropped problem is an answer in words again.
	const later = [...dropped, newUserMessage("it's 2, because column 3 = column 1 + 2 column 2") as LhMessage];
	assert.equal(answeredQuestionsOf(later).get(HIS_MESSAGE)?.dropped, undefined);
});
