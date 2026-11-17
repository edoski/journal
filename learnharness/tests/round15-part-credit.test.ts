/**
 * Round 15, m24 (4 free): on C, his first try had (c) dim ker right, yet o45
 * credited only rank (partial), and Kernel was credited only "with help" in
 * o46. The conclude's first try named `brokeAt: rank` with `partial`, and
 * brokeAt charges one topic and credits no other, so the right part (c)
 * went uncredited, past round 14's per-part results. A problem whose
 * labelled parts went differently now takes parts, and each topic gets the
 * result of the part that tests it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { conclusionProblem, practiceObservations, statementParts, type PracticeConclusion } from "../src/core/practice-attempts.ts";

const statement = "Let $C$ be the matrix below.\n\n**(a)** Find $\\operatorname{rank} C$ and its pivot columns.\n\n**(b)** Choose columns of $C$ itself that form a basis of $\\operatorname{im} C$.\n\n**(c)** Find $\\dim \\ker C$.";
const pose = { statement, topics: ["rank", "kernel"] };
const fixed = { outcome: "solvedWithHints", result: "correct", response: "Pivot columns 1 and 3, rank 2; columns 1 and 4; dim ker C = 2", rung: "R1" } as const;

test("a multi-part first try with one topic's part right credits that topic on its own (round 15, m24)", () => {
	assert.deepEqual(statementParts(statement), ["(a)", "(b)", "(c)"]);
	// What the round-15 conclude sent.
	const brokeAt = { ...fixed, firstTry: { result: "partial", response: "rank 2 with pivot columns 1 and 2; columns 1 and 2; dim ker C = 2", sure: "confident", brokeAt: "rank" } } as PracticeConclusion;
	assert.match(conclusionProblem(brokeAt, pose.topics, statement) ?? "", /firstTry\.brokeAt charges the miss to one topic and credits no other.*give parts instead/);
	// What it sends once refused.
	const parts = { ...fixed, firstTry: { result: "partial", response: brokeAt.firstTry!.response, sure: "confident", parts: [{ part: "(a)", topics: ["rank"], result: "incorrect" }, { part: "(c)", topics: ["kernel"], result: "correct" }] } } as PracticeConclusion;
	assert.equal(conclusionProblem(parts, pose.topics, statement), null);
	const observations = practiceObservations(pose, parts, "confident");
	const firstTry = observations.filter((o) => o.help === "none");
	assert.deepEqual(firstTry.map((o) => [o.topics, o.result]), [[["rank"], "incorrect"], [["kernel"], "correct"]], "Kernel is credited on his first try, unaided");
	assert.equal(firstTry.find((o) => (o.topics as string[]).includes("kernel"))!.sure, "confident");
});

test("brokeAt still charges a problem with no labelled parts, and a labelled one whose every part failed", () => {
	const combined = { outcome: "solvedWithHints", result: "correct", response: "2", rung: "R1", firstTry: { result: "partial", response: "3", sure: null, brokeAt: "rank" } } as PracticeConclusion;
	assert.equal(conclusionProblem(combined, pose.topics, "Find $\\dim \\ker C$ from $\\operatorname{rank} C$."), null);
	const allWrong = { outcome: "solvedWithHints", result: "correct", response: "2", rung: "R1", firstTry: { result: "incorrect", response: "3", sure: null, brokeAt: "rank" } } as PracticeConclusion;
	assert.equal(conclusionProblem(allWrong, pose.topics, statement), null);
});
