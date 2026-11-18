/**
 * Round 15, 2 D2 (M5): Rank practice, a nudge, then Ask, then a right
 * answer. The engine held the first try and the fix, but the First try /
 * Then card and its Dispute were missing when the turn ended, and showed
 * after a reload. A save of his answers keeps its links with the lesson
 * the moment the engine takes it, so its mark reads while the turn runs;
 * a problem's conclude kept none, and its card waited for the turn's end
 * to read the transcript's receipt, which took 1.5 and 2.1 s under load
 * (lens 2's server log). The conclude now keeps its links under its own
 * call the same way, and while the turn runs the marks read takes a kept
 * link for a call the transcript does not hold yet: the card shows as soon
 * as the engine holds the attempts, before the tutor's closing words end
 * the turn.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerMarksOf, markLinks } from "../src/core/answer-marks.ts";
import { saveCourse, type CourseToolContext } from "../src/agent/tools/course.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

const CONCLUDE = "toolu_conclude_rank";
const said = (id: string, text: string): LhMessage => ({ id, role: "user", content: [{ type: "text", text }], timestamp: 3 }) as LhMessage;

describe("a problem's mark while its turn runs", () => {
	it("the conclude hands the lesson its attempts' ids under its own call, as a save of his answers does", async () => {
		const kept: { question: string; observation: string }[][] = [];
		const ctx: CourseToolContext = {
			course: { workspace: "/study/la", title: "Linear Algebra" },
			records: { run: async () => ({ ok: true, json: { observations: ["o39", "o40"], saved: ["o39", "o40"], notes: [] } }) } as unknown as CourseToolContext["records"],
			arcs: false,
			onSaved: (links) => kept.push(links),
		};
		const attempt = (result: string) => ({ topics: ["kernel"], text: "dim ker A", response: "x", help: "none", result });
		const saved = await saveCourse(ctx, { observations: [attempt("incorrect"), attempt("correct")] }, { id: CONCLUDE, seen: false });
		assert.equal(saved.ok, true);
		assert.deepEqual(kept, [[{ question: CONCLUDE, observation: "o39" }, { question: CONCLUDE, observation: "o40" }]]);
	});

	it("while the turn runs, the kept links mark the conclude the transcript does not hold yet: First try, then Then", () => {
		// The lesson's record mid-turn: his answer is there, the turn's conclude not yet.
		const record = { messages: [said("u_right", "x has 4 entries, so dim ker A = 4 - 2 = 2")], answerSaves: { [CONCLUDE]: ["o39", "o40"] } };
		const links = markLinks(record, { running: true });
		assert.deepEqual(links, { [CONCLUDE]: ["o39", "o40"] });
		const shown = {
			o39: { kind: "attempt", result: "incorrect", grade: "missed", help: "none", topics: ["kernel"], sure: "confident" },
			o40: { kind: "attempt", result: "correct", grade: "helped", help: "R4", topics: ["kernel"] },
		};
		const mark = answerMarksOf(links, shown)[CONCLUDE]!;
		assert.deepEqual(
			mark.rows.map((r) => [r.label, r.result, r.helped]),
			[
				["First try", "incorrect", false],
				["Then", "correct", true],
			],
		);
	});

	it("once the turn has ended, a kept link to a call the lesson does not hold marks nothing", () => {
		const record = { messages: [said("u_right", "dim ker A = 2")], answerSaves: { [CONCLUDE]: ["o39", "o40"] } };
		assert.deepEqual(markLinks(record), {});
		assert.deepEqual(markLinks(record, { running: false }), {});
	});
});
