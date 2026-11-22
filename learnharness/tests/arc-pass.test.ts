/**
 * The grouping pass: its pure checks and merges, its ledger, and its runs on
 * the real engine with a scripted model (the edge step's saves on a re-read
 * record, a cut the engine refuses going back to the agent, and a course
 * whose ledger is not `new` never running live).
 */

import { fakeEngine } from "./helpers/fake-sdk.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";
import { LEARNING_ENGINE } from "../config.ts";
import {
	againstCut,
	ARC_PASS_MIN_TOPICS,
	arcPassChanges,
	arcPassProblems,
	doubtNote,
	EDGES_REASON,
	edgeChanges,
	edgeDiffs,
	edgeProblems,
	passDue,
	pathBasis,
	readingProblems,
	withReadings,
	mergeReadings,
	breakLoops,
	loopRulingProblems,
	withoutImplied,
	stripPrefixes,
	type ArcPassLedger,
	type ArcPassView,
	type ArcSubmit,
	type EdgeSubmit,
	type SortAnswer,
	majorityMisses,
	purposeAnswerProblems,
	purposeProblems,
	withdrawal,
	purposeQuiz,
	sortAnswerProblems,
	sortMisses,
	sortProblems,
	standingMisses,
	withoutWithdrawn,
	sortQuiz,
	withProposed,
	addCandidates,
	kindAdmits,
	kindProblems,
	type KindVerdict,
} from "../src/core/arc-pass.ts";
import { duplicateOf, type ViewTopic } from "../src/core/course-map-build.ts";
import { ARC_KINDS_INSTRUCTIONS, createArcPass, type TranscriptEntry } from "../src/agent/subagents/arc-former.ts";
import { createMaterialTools, measureMaterial } from "../src/agent/tools/material.ts";
import { mapRuns } from "../src/agent/subagents/course-map-builder.ts";
import type { SdkEngine } from "../src/agent/models.ts";
import { arcPassLedgersAt } from "../src/store/arc-pass-ledgers.ts";
import { createCourseRecords } from "../src/store/course-records.ts";
import type { ArcPassLedgers } from "../src/core/ports.ts";
import { realEngineMissing } from "./helpers/real-engine.ts";

const topic = (title: string, needs: string[] = [], over: Partial<ViewTopic> = {}): ViewTopic => ({ title, needs, contrasts: [], refs: [], aliases: [], ...over });

const view = (topics: Record<string, ViewTopic>, over: Partial<ArcPassView> = {}): ArcPassView => ({
	topics,
	order: Object.keys(topics),
	basis: null,
	exam: {},
	sources: ["book"],
	taken: [],
	arcs: [],
	topicArc: {},
	examArcs: [],
	studied: [],
	held: [],
	currentArc: null,
	examDate: null,
	...over,
});

const CALC = {
	limits: topic("Limits"),
	continuity: topic("Continuity", ["limits"]),
	derivative: topic("The derivative", ["limits"]),
	chain: topic("Chain rule", ["derivative"]),
	riemann: topic("Riemann sums", ["limits", "chain"]),
};

const arc = (handle: string, title: string, topics: string[], over: Partial<ArcSubmit["arcs"][number]> = {}) => ({
	handle,
	title,
	question: `What is ${title}?`,
	purpose: `Use ${title}.`,
	refs: [{ source: "book", locator: `Chapter on ${title}` }],
	topics,
	...over,
});

describe("the edge step", () => {
	const all: EdgeSubmit = {
		verdicts: [
			{ topic: "continuity", need: "limits", keep: true, reason: "continuity is defined by a limit" },
			{ topic: "derivative", need: "limits", keep: true, reason: "the derivative is a limit" },
			{ topic: "chain", need: "derivative", keep: true, reason: "it differentiates a composition" },
			{ topic: "riemann", need: "limits", keep: true, reason: "the integral is a limit of sums" },
			{ topic: "riemann", need: "chain", keep: false, reason: "a Riemann sum can be worked without ever differentiating" },
		],
		add: [{ topic: "chain", need: "continuity", reason: "test add" }],
	};

	const READ = { ...CALC, riemann: topic("Riemann sums", ["limits", "chain"], { refs: [{ source: "book", locator: "5.1" }] }) };

	it("takes an answer that judges every stored edge once, each with its reason", () => {
		assert.equal(edgeProblems(all, view(READ)), null);
	});

	it("keeps every need of a topic with no refs in a course with material: its material cannot be read to drop one", () => {
		assert.match(edgeProblems(all, view(CALC))!, /"riemann" has no refs, so its material cannot be read to answer the test against: keep "riemann" needs "chain"/);
		assert.equal(edgeProblems(all, view(CALC, { sources: [] })), null, "a course with no material judges by meaning");
	});

	it("refuses an answer that skips an edge, judges one twice or gives no reason", () => {
		const problems = edgeProblems({ verdicts: [all.verdicts[0]!, all.verdicts[0]!, { ...all.verdicts[1]!, reason: " " }], add: [] }, view(READ))!;
		assert.match(problems, /twice/);
		assert.match(problems, /gives no reason/);
		assert.match(problems, /no verdict for "chain" needs "derivative", "riemann" needs "limits", "riemann" needs "chain"/);
	});

	it("refuses an added edge that is stored already, names no topic, or closes a loop", () => {
		const stored = edgeProblems({ ...all, add: [{ topic: "chain", need: "derivative", reason: "x" }] }, view(READ))!;
		assert.match(stored, /stored already/);
		assert.match(edgeProblems({ ...all, add: [{ topic: "chain", need: "ghost", reason: "x" }] }, view(READ))!, /both must be topics/);
		assert.match(edgeProblems({ ...all, add: [{ topic: "limits", need: "chain", reason: "x" }] }, view(READ))!, /form a loop/);
	});

	it("saves per-topic diffs against the record read at save time: a need added meanwhile stays", () => {
		const diffs = edgeDiffs(all);
		const now = view({ ...CALC, riemann: topic("Riemann sums", ["limits", "chain", "continuity"]) });
		const merged = edgeChanges(diffs, now)!;
		assert.deepEqual(merged.changes.topics, { riemann: { needs: ["limits", "continuity"] }, chain: { needs: ["derivative", "continuity"] } });
		assert.deepEqual(merged.changes.arc_change, {
			reason: EDGES_REASON,
			edges: merged.applied.map(({ topic, need, change, reason }) => ({ topic, need, change, reason })),
		}, "the save logs each applied change, with its reason, as one edges event");
		assert.deepEqual(
			merged.applied.map((d) => `${d.change} ${d.topic}<-${d.need}`),
			["drop riemann<-chain", "add chain<-continuity"],
		);
	});

	it("skips a drop of an edge already gone and an add that would now close a loop", () => {
		const now = view({ ...CALC, riemann: topic("Riemann sums", ["limits"]), continuity: topic("Continuity", ["limits", "chain"]) });
		const merged = edgeChanges(edgeDiffs(all), now);
		assert.equal(merged, null);
	});
});

describe("the readers", () => {
	const JUDGED: EdgeSubmit = {
		verdicts: [
			{ topic: "continuity", need: "limits", keep: true, reason: "defined by a limit" },
			{ topic: "derivative", need: "limits", keep: false, reason: "judged implied" },
			{ topic: "chain", need: "derivative", keep: true, reason: "differentiates compositions" },
			{ topic: "riemann", need: "limits", keep: true, reason: "a limit of sums" },
			{ topic: "riemann", need: "chain", keep: false, reason: "a Riemann sum needs no derivative" },
		],
		add: [],
	};

	it("a drop takes both checks: the judge's drop stands only when the topic's reader found no step using it, and a reader that did not finish keeps every need", () => {
		const readings = new Map([
			["derivative", { uses: [{ need: "limits", step: "the derivative is the limit of the difference quotient" }] }],
			["riemann", null],
		]);
		const { submit } = withReadings(JUDGED, readings, view(CALC));
		assert.deepEqual(submit.verdicts.filter((v) => !v.keep), [], "neither drop stands");
		assert.match(submit.verdicts.find((v) => v.topic === "derivative")!.reason, /^kept: the topic's reader found a step that uses it: the derivative is the limit/);
		assert.match(submit.verdicts.find((v) => v.topic === "riemann" && v.need === "chain")!.reason, /did not finish, and a drop takes both checks/);
		const agreed = withReadings(JUDGED, new Map([["derivative", { uses: [] }], ["riemann", { uses: [{ need: "limits", step: "a limit of sums" }] }]]), view(CALC));
		assert.deepEqual(agreed.submit.verdicts.filter((v) => !v.keep).map((v) => `${v.topic}<-${v.need}`), ["derivative<-limits", "riemann<-chain"], "both drops stand when the readers agree");
	});

	it("adds every use a reader found that the graph lacks, after the judge's adds and in path order; one that would close a loop is set aside", () => {
		const topics = { ...CALC, riemann: topic("Riemann sums", ["limits"]) };
		const judged = { verdicts: JUDGED.verdicts.filter((v) => v.need !== "chain"), add: [{ topic: "riemann", need: "continuity", reason: "the judge's add" }] };
		const readings = new Map([
			["riemann", { uses: [{ need: "limits", step: "stored already" }] }],
			["chain", { uses: [{ need: "continuity", step: "the inner function is continuous" }] }],
			["limits", { uses: [{ need: "chain", step: "a loop" }] }],
		]);
		const { submit, loops } = withReadings(judged, readings, view(topics));
		assert.deepEqual(submit.add.map((a) => `${a.topic}<-${a.need}: ${a.reason}`), ["riemann<-continuity: the judge's add", "chain<-continuity: the inner function is continuous"]);
		assert.deepEqual(loops, [
			{
				use: { topic: "limits", need: "chain", reason: "a loop" },
				path: [
					{ topic: "chain", need: "derivative", reason: "differentiates compositions", stored: true },
					{ topic: "derivative", need: "limits", reason: "judged implied; kept: the topic's reader did not finish, and a drop takes both checks", stored: true },
				],
			},
		], "the loop names the kept edges that lead from the use's need back to its topic");
		assert.equal(edgeProblems(submit, view(topics, { sources: [] })), null, "the merged answer passes the edge step's own checks");
	});

	it("sets aside an add the rest of the settled graph already implies, whatever order the adds come in", () => {
		const readings = new Map([
			["chain", { uses: [{ need: "continuity", step: "the inner function is continuous" }] }],
			["riemann", { uses: [{ need: "chain", step: "substitution" }, { need: "continuity", step: "a continuous integrand" }, { need: "derivative", step: "differentiates the antiderivative" }] }],
		]);
		const { submit, implied } = withoutImplied(withReadings(JUDGED, readings, view(CALC)).submit, view(CALC));
		assert.deepEqual(submit.add.map((a) => `${a.topic}<-${a.need}`), ["chain<-continuity"], "riemann already reaches both through chain");
		assert.deepEqual(implied.map((a) => `${a.topic}<-${a.need}`), ["riemann<-continuity", "riemann<-derivative"]);
		const reordered = view({ riemann: CALC.riemann, chain: CALC.chain, continuity: CALC.continuity, derivative: CALC.derivative, limits: CALC.limits });
		const reversed = withoutImplied(withReadings(JUDGED, new Map([...readings].reverse()), reordered).submit, reordered);
		assert.deepEqual(reversed.submit.add.map((a) => `${a.topic}<-${a.need}`), ["chain<-continuity"], "the same set in another order");
	});

	it("never breaks a loop at a stored edge its topic's readers found too: two checks hold it", () => {
		const judged: EdgeSubmit = { verdicts: JUDGED.verdicts.map((v) => ({ ...v, keep: true })), add: [] };
		const readings = new Map([
			["derivative", { uses: [{ need: "limits", step: "the derivative is a limit" }] }],
			["limits", { uses: [{ need: "derivative", step: "a limit worked by differentiating" }] }],
		]);
		const { loops } = withReadings(judged, readings, view(CALC));
		assert.deepEqual(loops[0]!.path, [{ topic: "derivative", need: "limits", reason: "judged implied", stored: true, fixed: true }]);
		assert.match(loopRulingProblems([{ loop: 1, topic: "derivative", need: "limits", reason: "x" }], loops)!, /stored and its topic's readers found it too, so the loop cannot break there/);
		assert.equal(loopRulingProblems([{ loop: 1, topic: "limits", need: "derivative", reason: "x" }], loops), null);
	});

	it("breaks each loop where the loop check rules: at the use, at an added edge, or at a stored edge, which it drops with its reason", () => {
		const judged: EdgeSubmit = { verdicts: JUDGED.verdicts.map((v) => ({ ...v, keep: true })), add: [{ topic: "continuity", need: "derivative", reason: "continuity is checked by differentiating" }] };
		const loops = [
			{ use: { topic: "derivative", need: "continuity", reason: "differentiable functions are continuous" }, path: [{ topic: "continuity", need: "derivative", reason: "continuity is checked by differentiating", stored: false }] },
			{ use: { topic: "limits", need: "chain", reason: "a limit computed by the chain rule" }, path: [{ topic: "chain", need: "derivative", reason: "x", stored: true }, { topic: "derivative", need: "limits", reason: "x", stored: true }] },
		];
		assert.match(loopRulingProblems([{ loop: 1, topic: "riemann", need: "limits", reason: "x" }], loops)!, /L1 has no edge "riemann" needs "limits"[\s\S]*L2 missing/);
		const rulings = [
			{ loop: 1, topic: "continuity", need: "derivative", reason: "a continuity exercise never differentiates" },
			{ loop: 2, topic: "limits", need: "chain", reason: "limits are worked before any derivative" },
		];
		assert.equal(loopRulingProblems(rulings, loops), null);
		const { submit, aside } = breakLoops(judged, loops, rulings, view(CALC));
		assert.deepEqual(submit.add.map((a) => `${a.topic}<-${a.need}`), ["derivative<-continuity"], "the use comes in, the added edge it ruled against goes");
		assert.deepEqual(aside.map((a) => `${a.topic}<-${a.need}`), ["continuity<-derivative", "limits<-chain"]);
		const stored = breakLoops({ verdicts: judged.verdicts, add: [] }, [loops[1]!], [{ loop: 1, topic: "derivative", need: "limits", reason: "the exercise only cites the limit's value" }], view(CALC));
		assert.deepEqual(stored.submit.verdicts.find((v) => v.topic === "derivative")!, { topic: "derivative", need: "limits", keep: false, loop: true, reason: "dropped: it closes a loop, and the loop check found the exercise only cites the limit's value" });
		assert.deepEqual(stored.submit.add.map((a) => `${a.topic}<-${a.need}`), ["limits<-chain"]);
		assert.deepEqual(breakLoops(judged, loops, [], view(CALC)).aside.map((a) => `${a.topic}<-${a.need}`), ["derivative<-continuity", "limits<-chain"], "a loop with no ruling leaves its use aside");
	});

	it("a topic's readers are heard as one: every use any of them found, once, and none only when no reader finished", () => {
		assert.deepEqual(
			mergeReadings([{ uses: [{ need: "limits", step: "first" }] }, null, { uses: [{ need: "limits", step: "second" }, { need: "chain", step: "only here" }] }]),
			{ uses: [{ need: "limits", step: "first" }, { need: "chain", step: "only here" }] },
		);
		assert.equal(mergeReadings([null, null]), null);
		const judged: EdgeSubmit = { verdicts: [{ topic: "riemann", need: "chain", keep: false, reason: "judged false" }], add: [] };
		const heard = withReadings(judged, new Map([["riemann", mergeReadings([{ uses: [] }, { uses: [{ need: "chain", step: "substitution" }] }])]]), view(CALC));
		assert.equal(heard.submit.verdicts[0]!.keep, true, "a drop needs every reader's agreement");
	});

	it("a reading names other topics of the course, each once, each with its step", () => {
		const problems = readingProblems({ uses: [{ need: "ghost", step: "x" }, { need: "chain", step: "x" }, { need: "limits", step: " " }, { need: "limits", step: "y" }] }, "chain", view(CALC))!;
		assert.match(problems, /"ghost" is no topic/);
		assert.match(problems, /"chain" is the topic you read/);
		assert.match(problems, /"limits" gives no step/);
		assert.match(problems, /"limits" is listed twice/);
		assert.equal(readingProblems({ uses: [{ need: "derivative", step: "differentiates the outer function" }] }, "chain", view(CALC)), null);
	});
});

describe("the kind check", () => {
	const JUDGED: EdgeSubmit = {
		verdicts: [{ topic: "riemann", need: "chain", keep: false, reason: "a Riemann sum needs no derivative" }],
		add: [{ topic: "chain", need: "continuity", reason: "the judge's add" }],
	};

	it("sorts each use a reader found and each of the judge's adds that the stored graph lacks, once, in path order, with every step given for it", () => {
		const readings = new Map([
			["riemann", [{ uses: [{ need: "chain", step: "stored already" }, { need: "continuity", step: "a continuous integrand" }] }, null]],
			["chain", [{ uses: [{ need: "continuity", step: "the reader's step" }, { need: "limits", step: "a limit inside" }] }, { uses: [{ need: "continuity", step: "the reader's step" }, { need: "continuity", step: "the second reader's step" }] }]],
		]);
		assert.deepEqual(
			addCandidates(JUDGED, readings, view(CALC)).map((a) => `${a.topic}<-${a.need}: ${a.reason}`),
			["chain<-continuity: the reader's step / the second reader's step / the judge's add", "chain<-limits: a limit inside", "riemann<-continuity: a continuous integrand"],
		);
	});

	it("takes an answer that sorts every candidate once into a known kind, each with its reason", () => {
		const candidates = [{ topic: "chain", need: "continuity", reason: "x" }, { topic: "riemann", need: "continuity", reason: "y" }];
		const ok: KindVerdict[] = [{ topic: "chain", need: "continuity", kind: "definition", reason: "r" }, { topic: "riemann", need: "continuity", kind: "property", reason: "r" }];
		assert.equal(kindProblems(ok, candidates), null);
		const problems = kindProblems([ok[0]!, ok[0]!, { topic: "limits", need: "chain", kind: "guess" as KindVerdict["kind"], reason: " " }], candidates)!;
		assert.match(problems, /sorted twice/);
		assert.match(problems, /"limits" needs "chain" is no candidate/);
		assert.match(problems, /"guess" is no kind/);
		assert.match(problems, /gives no reason/);
		assert.match(problems, /sort every candidate: "riemann" needs "continuity" missing/);
	});

	it("admits only a candidate whose step makes a prerequisite; a reader's use of any kind still keeps a stored edge; a check that did not finish admits every one", () => {
		const readings = new Map([
			["riemann", { uses: [{ need: "chain", step: "a substitution exercise" }, { need: "continuity", step: "a continuous integrand" }] }],
			["chain", { uses: [{ need: "continuity", step: "the inner function is continuous" }] }],
		]);
		const kinds: KindVerdict[] = [
			{ topic: "chain", need: "continuity", kind: "placement", reason: "taught just before" },
			{ topic: "riemann", need: "continuity", kind: "method", reason: "the sum samples a continuous integrand" },
			{ topic: "riemann", need: "chain", kind: "other exercise", reason: "the substitution exercise belongs to another topic" },
		];
		const heard = withReadings(JUDGED, readings, view(CALC), kindAdmits(kinds));
		assert.deepEqual(heard.submit.add.map((a) => `${a.topic}<-${a.need}`), ["riemann<-continuity"]);
		assert.deepEqual(heard.refused.map((a) => `${a.topic}<-${a.need}`), ["chain<-continuity"], "the judge's add and the reader's same use go once");
		assert.equal(heard.submit.verdicts[0]!.keep, true, "the stored edge stays: its reader found a step that uses it");
		assert.deepEqual(withReadings(JUDGED, readings, view(CALC), kindAdmits(null)).submit.add.map((a) => `${a.topic}<-${a.need}`), ["chain<-continuity", "riemann<-continuity"]);
	});

	it("refuses a use only a one-off brings in: one example or an odd exercise or two, while the topic's method and standard exercises are worked without it", () => {
		const readings = new Map([["riemann", { uses: [{ need: "continuity", step: "one example samples a continuous integrand" }] }]]);
		const oneOff: KindVerdict[] = [{ topic: "riemann", need: "continuity", kind: "one-off", reason: "only Example 5.4 uses it" }];
		const heard = withReadings(JUDGED, readings, view(CALC), kindAdmits(oneOff));
		assert.ok(!heard.submit.add.some((a) => a.topic === "riemann"), "a one-off is no prerequisite");
		assert.ok(heard.refused.some((a) => `${a.topic}<-${a.need}` === "riemann<-continuity"));
		assert.match(ARC_KINDS_INSTRUCTIONS, /- one-off: A one-off among the exercises set for B/, "the kind check is told the kind");
	});
});

describe("the cut's shape rules", () => {
	const good: ArcSubmit = {
		arcs: [arc("limits-continuity", "Limits and continuity", ["limits", "continuity"]), arc("derivatives", "Derivatives", ["derivative", "chain", "riemann"])],
		basis: "the book's chapters 2 and 3",
	};

	it("takes a cut that homes every topic once in at least two arcs", () => {
		assert.equal(arcPassProblems(good, view(CALC)), null);
	});

	it("withdraws only a need this pass added or proposed, with a reason, and the cut then need not hold it", () => {
		const added = view({ ...CALC, limits: topic("Limits", ["chain"]) }, { added: { limits: ["chain"] } });
		const withdrawn: ArcSubmit = { ...good, withdraw: [{ topic: "limits", need: "chain", reason: "only one example uses it" }] };
		assert.equal(arcPassProblems(withdrawn, added), null);
		assert.deepEqual(withoutWithdrawn(added, withdrawn).topics.limits!.needs, []);
		assert.match(arcPassProblems({ ...good, withdraw: [{ topic: "chain", need: "derivative", reason: "r" }] }, view(CALC))!, /"chain" needs "derivative", which this pass did not add/);
		assert.match(arcPassProblems({ ...good, withdraw: [{ topic: "limits", need: "chain", reason: " " }] }, added)!, /gives no reason/);
		const proposed = view({ ...CALC, limits: topic("Limits", ["chain"]) }, { proposed: { limits: ["chain"] } });
		assert.match(arcPassProblems(good, proposed)!, /"limits" \(in "limits-continuity"\) needs "chain"/);
		assert.equal(arcPassProblems(withdrawn, proposed), null, "a withdrawn proposal no longer binds the cut");
		const changes = arcPassChanges(withdrawn, added, { edgesEntry: 0 })!.changes as { topics: Record<string, { needs?: string[] }>; arc_change: Record<string, unknown> };
		assert.deepEqual(changes.topics.limits!.needs, [], "the withdrawn add is dropped in the formation's save");
		assert.equal("needs" in changes.topics.chain!, false);
		assert.deepEqual(changes.arc_change.edges, [{ topic: "limits", need: "chain", change: "drop", reason: "withdrawn by the cut: only one example uses it" }]);
		assert.equal("edges_entry" in changes.arc_change, false, "the formation refers to its own edges event");
		assert.equal("needs" in (arcPassChanges(withdrawn, proposed)!.changes as { topics: Record<string, object> }).topics.limits!, false, "a withdrawn proposal changes no stored need");
	});

	it("a need set aside as implied through an add the cut withdraws comes back, saved with the formation and logged as an add; one still reached stays aside", () => {
		const implied = [
			{ topic: "riemann", need: "derivative", reason: "Exercise 4 differentiates the integrand" },
			{ topic: "chain", need: "limits", reason: "the derivative is a limit" },
		];
		const added = view(CALC, { added: { riemann: ["chain"] }, implied });
		const withdrawn: ArcSubmit = { ...good, withdraw: [{ topic: "riemann", need: "chain", reason: "one example composes" }] };
		assert.deepEqual(withdrawal(added, withdrawn).restored, [implied[0]], "chain still reaches limits through derivative");
		assert.deepEqual(withoutWithdrawn(added, withdrawn).topics.riemann!.needs, ["limits", "derivative"]);
		assert.deepEqual(withdrawal(added, good).restored, [], "nothing withdrawn, nothing back");
		const both: ArcSubmit = { ...good, withdraw: [...withdrawn.withdraw!, { topic: "riemann", need: "derivative", reason: "only Exercise 4 differentiates" }] };
		assert.equal(arcPassProblems(both, added), null, "an implied need may be withdrawn with the need that led to it");
		assert.deepEqual(withdrawal(added, both).restored, [], "and then it does not come back");
		assert.deepEqual(withoutWithdrawn(added, both).topics.riemann!.needs, ["limits"]);
		const changes = arcPassChanges(withdrawn, added)!.changes as { topics: Record<string, { needs?: string[] }>; arc_change: { edges: unknown[] } };
		assert.deepEqual(changes.topics.riemann!.needs, ["limits", "derivative"]);
		assert.deepEqual(changes.arc_change.edges, [
			{ topic: "riemann", need: "chain", change: "drop", reason: "withdrawn by the cut: one example composes" },
			{ topic: "riemann", need: "derivative", change: "add", reason: "implied until the cut withdrew the need it was reached through: Exercise 4 differentiates the integrand" },
		]);
		const proposed = view(CALC, { proposed: { riemann: ["chain"] }, implied });
		assert.deepEqual(withoutWithdrawn(proposed, withdrawn).proposed, { riemann: ["derivative"] }, "when the pass proposes, the need comes back as a proposal");
		assert.equal("needs" in (arcPassChanges(withdrawn, proposed)!.changes as { topics: Record<string, object> }).topics.riemann!, false, "and changes no stored need");
	});

	it("a need comes back only when the withdrawal cut its path: not one the view never reached, nor one another restored need leads to", () => {
		const t = (needs: string[]) => topic("T", needs);
		const graph = { x: t(["y"]), y: t(["z", "w"]), z: t(["w"]), w: t([]), v: t([]), u: t(["v"]) };
		const implied = [
			{ topic: "x", need: "w", reason: "an exercise uses w" },
			{ topic: "x", need: "z", reason: "an exercise uses z" },
			{ topic: "x", need: "v", reason: "reached through a proposal the view left out" },
		];
		const submit: ArcSubmit = { ...good, withdraw: [{ topic: "x", need: "y", reason: "one example" }] };
		const given = view(graph, { added: { x: ["y"] }, implied });
		assert.deepEqual(withdrawal(given, submit).restored, [implied[1]], "w is reached through z; v was never reached");
		assert.deepEqual(withdrawal(view(graph, { added: { x: ["y"] }, implied: [implied[1]!, implied[0]!] }), submit).restored, [implied[1]], "whatever the order");
		const unrelated: ArcSubmit = { ...good, withdraw: [{ topic: "x", need: "v", reason: "one exercise" }] };
		assert.deepEqual(withdrawal(given, unrelated).restored, [], "withdrawing an implied need alone brings nothing back");
	});

	it("a withdrawn add the record no longer holds is no drop of the formation's save", () => {
		const meanwhile = view(CALC, { added: { limits: ["chain"] } });
		const withdrawn: ArcSubmit = { ...good, withdraw: [{ topic: "limits", need: "chain", reason: "only one example uses it" }] };
		const changes = arcPassChanges(withdrawn, meanwhile, { edgesEntry: 0 })!.changes as { topics: Record<string, object>; arc_change: Record<string, unknown> };
		assert.equal("needs" in changes.topics.limits!, false, "a tutor dropped it meanwhile");
		assert.equal(changes.arc_change.edges, undefined);
		assert.equal(changes.arc_change.edges_entry, 0);
	});

	it("R1: every topic, left-out ones too, in exactly one arc", () => {
		const left = { ...CALC, extra: topic("Extra", [], { excluded: "not examined" }) };
		assert.match(arcPassProblems(good, view(left))!, /in no arc: extra/);
		const twice = { ...good, arcs: [good.arcs[0]!, { ...good.arcs[1]!, topics: ["derivative", "chain", "riemann", "limits"] }] };
		assert.match(arcPassProblems(twice, view(CALC))!, /"limits" is in both/);
	});

	it("R1: a topic no exam examines joins an arc whose question it extends, never one of its own", () => {
		const left = { ...CALC, extra: topic("Extra", ["chain"], { excluded: "not examined" }) };
		const alone = { ...good, arcs: [...good.arcs, arc("extra-arc", "Extras", ["extra"], { single: "outside the exam" })] };
		assert.match(arcPassProblems(alone, view(left))!, /holds only topics no exam examines/);
		const joined = { ...good, arcs: [good.arcs[0]!, { ...good.arcs[1]!, topics: [...good.arcs[1]!.topics, "extra"] }] };
		assert.equal(arcPassProblems(joined, view(left)), null);
	});

	it("R6: two arcs or none, and a one-topic arc only with its reason", () => {
		assert.match(arcPassProblems({ ...good, arcs: [arc("all", "Calculus", Object.keys(CALC))] }, view(CALC))!, /form at least two/);
		const lone = { ...good, arcs: [arc("a", "Limits", ["limits"]), arc("b", "The rest", ["continuity", "derivative", "chain", "riemann"])] };
		assert.match(arcPassProblems(lone, view(CALC))!, /holds one topic/);
		assert.equal(arcPassProblems({ ...lone, arcs: [{ ...lone.arcs[0]!, single: "its own chapter, and the midterm treats it alone" }, lone.arcs[1]!] }, view(CALC)), null);
		assert.match(arcPassProblems({ ...good, none: "five topics" }, view(CALC))!, /send one or the other/);
		assert.equal(arcPassProblems({ arcs: [], none: "five topics, one unit", basis: "" }, view(CALC)), null);
	});

	it("R6: no two arcs share a unit of the material without saying why on each", () => {
		const shared = { ...good, arcs: good.arcs.map((a) => ({ ...a, refs: [{ source: "book", locator: "Chapter 2" }] })) };
		assert.match(arcPassProblems(shared, view(CALC))!, /share a unit of the material only with a reason/);
		assert.equal(arcPassProblems({ ...shared, arcs: shared.arcs.map((a) => ({ ...a, shares: "the chapter teaches both ideas" })) }, view(CALC)), null);
	});

	it("an exam's scope only with an exam date, and leaves out only topics of an arc after its own", () => {
		assert.match(arcPassProblems({ ...good, examArcs: ["limits-continuity"] }, view(CALC))!, /no exam date/);
		const dated = view(CALC, { examDate: "2026-12-01" });
		assert.equal(arcPassProblems({ ...good, examArcs: ["limits-continuity"], leavesOut: ["chain"] }, dated), null, "an arc after the exam's");
		assert.match(arcPassProblems({ ...good, examArcs: ["derivatives"], leavesOut: ["limits"] }, dated)!, /"limits", in "limits-continuity", an arc before the exam's/);
		assert.match(arcPassProblems({ ...good, leavesOut: ["chain"] }, view(CALC))!, /leavesOut needs examArcs/);
	});

	it("A10: no arc holds topics both inside and outside the exam's scope known as the arcs form (round 15, m11)", () => {
		// The demo world's Probability cut put Covariance, which its exam leaves out, in the exam's Expectation arc.
		const dated = view(CALC, { examDate: "2026-12-01" });
		assert.match(arcPassProblems({ ...good, examArcs: ["limits-continuity", "derivatives"], leavesOut: ["chain"] }, dated)!, /"chain", which the exam leaves out, is in "derivatives", one of examArcs/);
		assert.match(arcPassProblems({ ...good, examArcs: ["limits-continuity", "derivatives"] }, { ...dated, leftOut: ["riemann"] })!, /"riemann", which the exam leaves out, is in "derivatives"/, "the record's own leaves_out too");
		const apart = { ...good, arcs: [good.arcs[0]!, { ...good.arcs[1]!, topics: ["derivative", "chain"] }, { ...arc("integrals", "Integrals", ["riemann"]), single: "The exam leaves it out" }] };
		assert.equal(arcPassProblems({ ...apart, examArcs: ["limits-continuity", "derivatives"], leavesOut: ["riemann"] }, dated), null);
	});

	it("a one-topic arc's reason and a shared unit's reason are saved with the formation, where the record keeps them", () => {
		const alone = { ...good, basis: "the book's chapters 2 to 4", arcs: [good.arcs[0]!, { ...good.arcs[1]!, topics: ["derivative", "chain"], shares: "chapter 3 splits rules from uses" }, { ...arc("integrals", "Integrals", ["riemann"]), single: "its own chapter, and the exam treats it alone" }] };
		const reason = (arcPassChanges(alone, view(CALC))!.changes.arc_change as { reason: string }).reason;
		assert.equal(reason, `the book's chapters 2 to 4; "Derivatives" shares its unit: chapter 3 splits rules from uses; "Integrals" holds one topic: its own chapter, and the exam treats it alone`);
	});

	it("R4: with registered material, every arc cites the unit it follows", () => {
		assert.match(arcPassProblems({ ...good, arcs: [{ ...good.arcs[0]!, refs: [] }, good.arcs[1]!] }, view(CALC))!, /"limits-continuity" cites no unit of the material/);
		assert.equal(arcPassProblems({ ...good, arcs: good.arcs.map((a) => ({ ...a, refs: [] })) }, view(CALC, { sources: [] })), null, "a course with no material has none to cite");
	});

	it("an edge proposal that would point backward under the cut says so", () => {
		const diffs = [
			{ topic: "derivative", need: "riemann", change: "add" as const, reason: "x" },
			{ topic: "riemann", need: "chain", change: "drop" as const, reason: "y" },
			{ topic: "chain", need: "limits", change: "add" as const, reason: "z" },
		];
		const arcs = { limits: "a", derivative: "b", chain: "b", riemann: "c" };
		assert.deepEqual(
			againstCut(diffs, arcs, ["a", "b", "c"]).map((d) => [d.topic, d.need, d.backward]),
			[["derivative", "riemann", true], ["riemann", "chain", false], ["chain", "limits", false]],
		);
	});

	it("in propose mode the cut holds every proposed add, so any he accepts keeps it valid; one that would close a loop is left out", () => {
		const proposed = withProposed(view(CALC), [
			{ topic: "continuity", need: "chain", change: "add", reason: "x" },
			{ topic: "riemann", need: "chain", change: "drop", reason: "y" },
			{ topic: "limits", need: "riemann", change: "add", reason: "z" },
		]);
		assert.deepEqual(proposed.proposed, { continuity: ["chain"] });
		assert.deepEqual(proposed.topics.continuity!.needs, ["limits", "chain"]);
		assert.deepEqual(proposed.topics.riemann!.needs, ["limits", "chain"], "a proposed drop changes nothing the cut reads");
		assert.match(arcPassProblems(good, proposed)!, /"continuity" \(in "limits-continuity"\) needs "chain", a prerequisite the edge step proposes, which sits in the later arc "derivatives"/);
		const holds = { ...good, arcs: [arc("limits-derivatives", "Limits and derivatives", ["limits", "derivative", "chain"]), arc("continuity-sums", "Continuity and sums", ["continuity", "riemann"])] };
		assert.equal(arcPassProblems(holds, proposed), null);
		assert.match(arcPassProblems({ ...holds, doubts: [{ topic: "continuity", need: "chain", reason: "x" }] }, proposed)!, /no stored edge/, "a proposal is not a stored edge to doubt");
		assert.deepEqual((arcPassChanges(holds, proposed)!.changes.path as { order: string[] }).order, ["limits", "derivative", "chain", "continuity", "riemann"]);
	});

	it("the blind sort shows titles under neutral ids, one arc each, and lets one borderline miss stay only when the basis names it", () => {
		const formation = arcPassChanges(good, view(CALC))!;
		const quiz = sortQuiz(good, view(CALC), formation);
		assert.deepEqual(quiz.arcs, ["Limits and continuity", "Derivatives"]);
		assert.deepEqual(quiz.topics.map((t) => t.id), ["t1", "t2", "t3", "t4", "t5"]);
		assert.deepEqual(new Set(quiz.topics.map((t) => t.title)), new Set(Object.values(CALC).map((t) => t.title)));
		const id = (h: string) => quiz.topics.find((t) => t.handle === h)!.id;
		const answer: SortAnswer = {
			sort: quiz.topics.map((t) => ({ topic: t.id, arc: t.handle === "riemann" ? "Limits and continuity" : ["derivative", "chain"].includes(t.handle) ? "Derivatives" : "Limits and continuity" })),
		};
		assert.equal(sortAnswerProblems(answer, quiz), null);
		assert.match(sortAnswerProblems({ sort: [{ topic: id("limits"), arc: "Limits" }] }, quiz)!, /no arc name[\s\S]*sort every topic/);
		const read = sortMisses(quiz, answer, good);
		assert.deepEqual(read, [{ topic: "riemann", title: "Riemann sums", arc: "Derivatives", readsAs: ["Limits and continuity"], away: 1, of: 1 }]);
		const borderline = [{ ...read[0]!, away: 2, of: 3 }];
		assert.match(sortProblems(borderline, good)!, /"Riemann sums" \(riemann\), in "Derivatives", reads as part of "Limits and continuity"/);
		const explained = { ...good, basis: "chapters 2 and 3; Riemann sums sort as limits, borderline" };
		assert.equal(sortProblems(borderline, explained), null);
		assert.match(sortProblems([{ ...read[0]!, away: 3, of: 3 }], explained)!, /Every reader put it away, so it is no borderline miss/, "a topic every reader puts away cannot stay, explained or not");
		assert.match(sortProblems([...borderline, { ...borderline[0]!, topic: "chain", title: "Chain rule" }], { ...good, basis: "riemann chain" })!, /At most one may stay/);
	});

	it("three blind readers, as the arcs rubric's B1 counts: a topic two of them put away is a miss, with every arc they read it as", () => {
		const m = (topic: string, readsAs: string[]) => ({ topic, title: topic, arc: "A", readsAs, away: 1, of: 1 });
		assert.deepEqual(majorityMisses([[m("x", ["B"])], [m("x", ["C"]), m("y", ["B"])], []]), [{ ...m("x", ["B", "C"]), away: 2, of: 3 }], "y, one reader of three, is no miss");
		assert.deepEqual(majorityMisses([[m("y", ["B"])], []]), [], "of two readers, both must put it away");
		assert.deepEqual(majorityMisses([[], [], []]), []);
	});

	it("a miss an earlier sort found stands while its names stand, so resending the same cut cannot pass on luckier readers", () => {
		const riemann = { topic: "riemann", title: "Riemann sums", arc: "Derivatives", readsAs: ["Limits and continuity"], away: 2, of: 3 };
		assert.deepEqual(standingMisses([riemann], [], good), [riemann], "the same cut again: the next readers placed it home, the miss stands");
		const moved: ArcSubmit = { ...good, arcs: [arc("limits-continuity", "Limits and continuity", ["limits", "continuity", "riemann"]), arc("derivatives", "Derivatives", ["derivative", "chain"])] };
		assert.deepEqual(standingMisses([riemann], [], moved), [], "moved to the arc it read as");
		const renamed: ArcSubmit = { ...good, arcs: [arc("limits-continuity", "Limits", ["limits", "continuity"]), good.arcs[1]!] };
		assert.deepEqual(standingMisses([riemann], [], renamed), [], "the name it read as is gone: fresh readers judge the new names");
		const chain = { topic: "chain", title: "Chain rule", arc: "Derivatives", readsAs: ["Limits and continuity"], away: 2, of: 3 };
		assert.deepEqual(standingMisses([riemann], [chain], good), [chain, riemann]);
	});

	it("in propose mode a drop the loop check made goes with the reversed use, so the cut holds the use", () => {
		const diffs = [
			{ topic: "derivative", need: "limits", change: "drop" as const, reason: "dropped: it closes a loop", loop: true as const },
			{ topic: "limits", need: "derivative", change: "add" as const, reason: "a limit worked by differentiating" },
			{ topic: "riemann", need: "limits", change: "drop" as const, reason: "a judged drop, not part of a loop" },
		];
		const v = withProposed(view(CALC), diffs);
		assert.deepEqual(v.proposed, { limits: ["derivative"] });
		assert.deepEqual(v.topics.derivative!.needs, [], "the loop's drop is applied");
		assert.deepEqual(v.topics.riemann!.needs, ["limits", "chain"], "a judged drop is not: the cut still holds the stored edge");
		const { aside, submit } = breakLoops({ verdicts: [{ topic: "derivative", need: "limits", keep: true, reason: "x" }], add: [] }, [{ use: { topic: "limits", need: "derivative", reason: "y" }, path: [{ topic: "derivative", need: "limits", reason: "x", stored: true }] }], [{ loop: 1, topic: "derivative", need: "limits", reason: "z" }], view(CALC));
		assert.deepEqual(aside, []);
		assert.deepEqual(edgeDiffs(submit).find((d) => d.change === "drop")?.loop, true, "the loop check marks its drop");
	});

	it("an arc handle no topic, source, task or knowledge entry has", () => {
		assert.match(arcPassProblems({ ...good, arcs: [{ ...good.arcs[0]!, handle: "limits" }, good.arcs[1]!] }, view(CALC))!, /needs a handle no topic/);
		assert.match(arcPassProblems({ ...good, arcs: [{ ...good.arcs[0]!, handle: "book" }, good.arcs[1]!] }, view(CALC))!, /needs a handle no topic/);
	});

	it("the merge never sends needs: a doubted edge is a note, kept", () => {
		const formation = arcPassChanges({ ...good, doubts: [{ topic: "riemann", need: "chain", reason: "no derivative in a sum" }] }, view(CALC))!;
		for (const t of Object.values(formation.changes.topics as Record<string, object>)) assert.equal("needs" in t, false);
		assert.deepEqual(doubtNote({ ...good, doubts: [{ topic: "riemann", need: "chain", reason: "no derivative in a sum" }] }), {
			arc_change: { reason: 'prerequisites the grouping pass doubts, kept as they are: "riemann" needs "chain" (no derivative in a sum)' },
		});
	});

	it("the path takes each arc's topics in the answer's order, a prerequisite in the same arc first", () => {
		const listed = { ...good, arcs: [arc("limits-continuity", "Limits and continuity", ["continuity", "limits"]), arc("derivatives", "Derivatives", ["riemann", "derivative", "chain"])] };
		const formation = arcPassChanges(listed, view(CALC, { order: ["limits", "continuity", "chain", "derivative", "riemann"] }))!;
		assert.deepEqual((formation.changes.path as { order: string[] }).order, ["limits", "continuity", "derivative", "chain", "riemann"]);
		const free = { ...CALC, riemann: topic("Riemann sums", ["limits"]) };
		assert.deepEqual((arcPassChanges(listed, view(free))!.changes.path as { order: string[] }).order, ["limits", "continuity", "riemann", "derivative", "chain"]);
	});

	it("re-derives on the record read at save time: a topic added since gets no arc, one gone is left out, and the path reads arc by arc", () => {
		const now = { ...CALC, implicit: topic("Implicit differentiation", ["chain"]) };
		delete (now as Partial<typeof now>).continuity;
		const formation = arcPassChanges(good, view(now, { order: ["limits", "derivative", "implicit", "chain", "riemann"] }), { edgesEntry: 0, asked: "copy run" })!;
		assert.deepEqual(formation.gone, ["continuity"]);
		assert.deepEqual(formation.placedByEngine, ["implicit"]);
		assert.deepEqual(Object.keys(formation.changes.topics as object), ["limits", "derivative", "chain", "riemann"]);
		assert.deepEqual(formation.changes.path, {
			arcs: ["limits-continuity", "derivatives"],
			order: ["limits", "derivative", "chain", "riemann", "implicit"],
			basis:
				"Read arc by arc (Limits and continuity; Derivatives), each arc's topics in the material's order with prerequisites first; the arc log says where the arcs depart from the material",
		});
		assert.equal(
			pathBasis("Lecture order, weeks 1-7 examinable.", [{ title: "Vectors" }, { title: "Bases" }]),
			"Lecture order, weeks 1-7 examinable; read arc by arc (Vectors; Bases), each arc's topics in the material's order with prerequisites first; the arc log says where the arcs depart from the material",
			"the basis the order came from stays, and says it now reads arc by arc",
		);
		assert.deepEqual(formation.changes.arc_change, { reason: "the book's chapters 2 and 3", edges_entry: 0, asked: "copy run" });
	});
});

describe("the label strip", () => {
	const titles: Record<string, string> = {
		pricing: "GTM: Pricing",
		outbound: "GTM: Outbound",
		railway: "Railway: Deploys",
		evePricing: "Eve: Pricing",
		eveDeploy: "Eve: Deploy pipeline",
		evePipe: "Deploy pipeline",
	};
	const titleOf = (t: string) => titles[t];

	it("drops a label two or more of an arc's topics share, and keeps one a topic carries alone", () => {
		assert.deepEqual(stripPrefixes([{ topics: ["pricing", "outbound", "railway"] }], titleOf), { pricing: "Pricing", outbound: "Outbound" });
	});

	it("keeps a label whose strip would make two topics of one arc read as one", () => {
		assert.deepEqual(stripPrefixes([{ topics: ["evePricing", "eveDeploy", "evePipe"] }], titleOf), { evePricing: "Pricing" });
	});

	it("never merges topics that share a phrase: in two arcs both stay, each with its handle", () => {
		const topics = { pricing: topic("GTM: Pricing"), outbound: topic("GTM: Outbound"), evePricing: topic("Eve: Pricing"), eveDeploy: topic("Eve: Deploy pipeline") };
		const cut: ArcSubmit = { arcs: [arc("gtm", "Go to market", ["pricing", "outbound"]), arc("eve", "Eve", ["evePricing", "eveDeploy"])], basis: "branches" };
		const formation = arcPassChanges(cut, view(topics))!;
		assert.deepEqual(formation.changes.topics, {
			pricing: { title: "Pricing", arc: "gtm" },
			outbound: { title: "Outbound", arc: "gtm" },
			evePricing: { title: "Pricing", arc: "eve" },
			eveDeploy: { title: "Deploy pipeline", arc: "eve" },
		});
		const arcOf: Record<string, string> = { pricing: "gtm", outbound: "gtm", evePricing: "eve", eveDeploy: "eve" };
		const after = Object.fromEntries(Object.entries(formation.changes.topics as Record<string, { title: string }>).map(([k, t]) => [k, { title: t.title, aliases: [] }]));
		const order = ["gtm", "eve"];
		const within = (needs: string[]) => (twin: string) => order.indexOf(arcOf[twin]!) >= Math.max(0, ...needs.map((n) => order.indexOf(arcOf[n]!)));
		assert.equal(duplicateOf({ handle: "eve-pricing-2", title: "Pricing" }, { evePricing: after.evePricing! }, within(["eveDeploy"])), "evePricing", "a twin in its placement range is the same topic");
		assert.equal(duplicateOf({ handle: "gtm-pricing-2", title: "Pricing" }, { evePricing: after.evePricing! }, () => false), null, "a twin outside it is another topic");
	});

	it("never touches a title outside a strip, and titles only an untitled topic", () => {
		const topics = { a: topic("Linear regression"), b: topic("Linear regression assumptions"), c: { ...topic(""), title: undefined } };
		const cut: ArcSubmit = { arcs: [arc("x", "Regression", ["a", "b"]), arc("y", "Diagnostics", ["c"], { single: "test" })], titles: [{ topic: "c", title: "Residual plots" }], basis: "b" };
		assert.deepEqual(arcPassChanges(cut, view(topics))!.changes.topics, { a: { arc: "x" }, b: { arc: "x" }, c: { title: "Residual plots", arc: "y" } });
	});
});

describe("the ledger", () => {
	const record = (n: number, arcs = false) => ({ topics: Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, { title: `T${i}` }])), ...(arcs ? { arcs: { a: {} } } : {}) });
	const ledger = (state: ArcPassLedger["state"], topics = 0): ArcPassLedger => ({ state, at: "2026-11-14T10:00:00Z", topics });

	it("a course without a ledger, the real courses' case, is never due", () => {
		assert.equal(passDue(undefined, record(30)), false);
	});

	it("a new course is due once it has enough topics and no arcs", () => {
		assert.equal(passDue(ledger("new"), record(ARC_PASS_MIN_TOPICS - 1)), false);
		assert.equal(passDue(ledger("new"), record(ARC_PASS_MIN_TOPICS)), true);
		assert.equal(passDue(ledger("new"), record(10, true)), false);
	});

	it("none and failed are tried again only once the topic count changes; every other state has had its run", () => {
		assert.equal(passDue(ledger("none", 6), record(6)), false);
		assert.equal(passDue(ledger("none", 6), record(9)), true);
		assert.equal(passDue(ledger("failed", 6), record(7)), true);
		for (const state of ["proposed", "approved", "formed"] as const) assert.equal(passDue(ledger(state, 1), record(9)), false, state);
	});

	it("is kept in its own file, and an entry with an unknown state reads as none", () => {
		const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lh-arc-ledger-")), "arc-passes.json");
		const store = arcPassLedgersAt(file);
		store.save("/c", ledger("new"));
		assert.deepEqual(store.get("/c"), ledger("new"));
		fs.writeFileSync(file, JSON.stringify({ "/c": ledger("new"), "/d": { state: "live", at: "", topics: 1 } }));
		assert.equal(store.get("/d"), undefined);
		store.forget("/c");
		assert.deepEqual(store.workspaces(), ["/d"]);
	});
});

// ─── runs, on the real engine ────────────────────────────────────────────────

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-arc-pass-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function memoryLedgers(): ArcPassLedgers & { all: Map<string, ArcPassLedger> } {
	const all = new Map<string, ArcPassLedger>();
	return { all, get: (w) => all.get(w), save: (w, l) => void all.set(w, structuredClone(l)), workspaces: () => [...all.keys()], forget: (w) => void all.delete(w) };
}

/** A model that answers the edge step with `edges`, each topic's reader with
 *  `uses` (after reading the first source its topic's refs cite, or the first
 *  readable one, unless `unread` names the topic), the loop check with
 *  `loopBreaks` by each loop's use ("topic<-need"), else a break at the use, the cut with each of `cuts` in turn (the next
 *  one after a refusal), and each blind sort reader with `readsAs` for a
 *  title it names (every reader, or only the first `readers` of each sort's
 *  three), else the topic's own arc in the cut it reads; it counts the edge and cut calls apart from
 *  the readers', the sort's and the purpose check's. */
function scriptedModel(
	edges: EdgeSubmit,
	cuts: ArcSubmit[],
	hook?: () => void,
	readsAs: Record<string, string | { arc: string; readers: number }> = {},
	uses: Record<string, { need: string; step: string }[]> = {},
	purposeFalseOf: string[] = [],
	unread: string[] = [],
	loopBreaks: Record<string, { topic: string; need: string; reason: string }> = {},
	kindOf: Record<string, KindVerdict["kind"]> = {},
): SdkEngine & { calls: number; sorts: number; readers: number; loops: number; kinds: number; purposes: number; refusals: string[]; prompts: Set<string> } {
	const faux = createFauxCore({});
	const state = { calls: 0, sorts: 0, readers: 0, loops: 0, kinds: 0, purposes: 0, refusals: [] as string[], prompts: new Set<string>() };
	let cut = 0;
	const step: FauxResponseStep = async (context) => {
		const last = context.messages.at(-1) as { role: string; isError?: boolean; content?: Array<{ text?: string }> };
		const asked = (context.messages.find((m) => m.role === "user") as { content: string | Array<{ text?: string }> } | undefined)?.content ?? "";
		const body = typeof asked === "string" ? asked : asked.map((c) => c.text ?? "").join("");
		state.prompts.add(body);
		if (body.includes("\n## Loops\n")) {
			state.loops++;
			const breaks = [...body.matchAll(/^- L(\d+):\n {2}- "([\w-]+)" \(.*?\) needs "([\w-]+)"/gm)].map((m) => loopBreaks[`${m[2]}<-${m[3]}`] ?? { loop: Number(m[1]), topic: m[2]!, need: m[3]!, reason: "the use is the weakest" }).map((b, i) => ({ ...b, loop: i + 1 }));
			return fauxAssistantMessage([fauxToolCall("submit_loops", { breaks } as unknown as ToolCall["arguments"], { id: `loops-${state.loops}` })], { stopReason: "toolUse" });
		}
		if (body.includes("\n## Candidates\n")) {
			state.kinds++;
			const kinds = [...body.matchAll(/^- "([\w-]+)" \(.*?\) needs "([\w-]+)"/gm)].map((m) => ({ topic: m[1]!, need: m[2]!, kind: kindOf[`${m[1]}<-${m[2]}`] ?? "definition", reason: "its definition uses it" }));
			return fauxAssistantMessage([fauxToolCall("submit_kinds", { kinds } as unknown as ToolCall["arguments"], { id: `kinds-${state.kinds}` })], { stopReason: "toolUse" });
		}
		const yours = /## Your topic\n- ([\w-]+): .*\((?:refs (\S+?)[ ;)])?/.exec(body);
		if (yours) {
			state.readers++;
			const [, topic, cited] = yours;
			const source = cited ?? /^ *- ([\w-]+): .*\((?:text|PDF)/m.exec(body.split("## Topics")[0]!)?.[1];
			if (last.role === "toolResult" && last.isError) state.refusals.push(last.content?.map((c) => c.text ?? "").join("") ?? "");
			const hasRead = context.messages.some((m) => m.role === "toolResult" && (m as { toolName?: string }).toolName === "read_material");
			if (source && !hasRead && !unread.includes(topic!)) return fauxAssistantMessage([fauxToolCall("read_material", { source }, { id: `read-${state.readers}` })], { stopReason: "toolUse" });
			return fauxAssistantMessage([fauxToolCall("submit_needs", { uses: uses[topic!] ?? [] } as unknown as ToolCall["arguments"], { id: `needs-${state.readers}` })], { stopReason: "toolUse" });
		}
		if (/^## .+\nPurpose: /.test(body)) {
			state.purposes++;
			const falseOf = [...body.matchAll(/^- (t\d+): (.+)$/gm)].flatMap((m) => (purposeFalseOf.includes(m[2]!) ? [{ topic: m[1]!, why: "the line promises nothing of it" }] : []));
			return fauxAssistantMessage([fauxToolCall("submit_purpose", { false: falseOf } as unknown as ToolCall["arguments"], { id: `purpose-${state.purposes}` })], { stopReason: "toolUse" });
		}
		if (body.includes("## Arc names, in study order")) {
			const reader = state.sorts++ % 3;
			const topics = body.split("## Topics")[1]!;
			const answer = cuts[Math.min(cut - 1, cuts.length - 1)]!;
			const handleOf = new Map(Object.entries(CALC).map(([h, t]) => [t.title, h]));
			const home = (title: string) => answer.arcs.find((a) => a.topics.includes(handleOf.get(title)!))!.title;
			const away = (title: string) => {
				const r = readsAs[title];
				return typeof r === "string" ? r : r && reader < r.readers ? r.arc : undefined;
			};
			const sort = [...topics.matchAll(/^- (t\d+): (.+)$/gm)].map((m) => ({ topic: m[1]!, arc: away(m[2]!) ?? home(m[2]!) }));
			return fauxAssistantMessage([fauxToolCall("submit_sort", { sort } as unknown as ToolCall["arguments"], { id: `sort-${state.sorts}` })], { stopReason: "toolUse" });
		}
		state.calls++;
		hook?.();
		if (last.role === "toolResult" && last.isError) state.refusals.push(last.content?.map((c) => c.text ?? "").join("") ?? "");
		if (JSON.stringify(context).includes("submit_edges")) return fauxAssistantMessage([fauxToolCall("submit_edges", edges as unknown as ToolCall["arguments"], { id: `edges-${state.calls}` })], { stopReason: "toolUse" });
		const answer = cuts[Math.min(cut++, cuts.length - 1)]!;
		return fauxAssistantMessage([fauxToolCall("submit_arcs", answer as unknown as ToolCall["arguments"], { id: `cut-${state.calls}` })], { stopReason: "toolUse" });
	};
	faux.setResponses(Array.from({ length: 80 }, () => step));
	return Object.assign(state, fakeEngine({ model: faux.getModel(), streamFn: faux.streamSimple }));
}

describe("the grouping pass (real engine, scripted model)", { skip: realEngineMissing(LEARNING_ENGINE.python) }, () => {
	const home = path.join(TMP, "home");
	fs.mkdirSync(home, { recursive: true });
	const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-14" };
	const records = createCourseRecords({ ...LEARNING_ENGINE, env });
	const engine = (args: string[], input?: unknown) =>
		JSON.parse(execFileSync(LEARNING_ENGINE.python, ["-m", "learning", ...args], { cwd: LEARNING_ENGINE.root, env: { ...env, PYTHONPATH: LEARNING_ENGINE.root }, input: input === undefined ? undefined : JSON.stringify(input) }).toString());
	const record = (dir: string) => engine(["--workspace", dir, "show", "--all"]);

	function course(name: string): string {
		const dir = path.join(TMP, name);
		fs.mkdirSync(dir, { recursive: true });
		engine(["--workspace", dir, "init"]);
		engine(["--workspace", dir, "save"], {
			title: "Calculus",
			topics: Object.fromEntries(Object.entries(CALC).map(([k, t]) => [k, { title: t.title, needs: t.needs }])),
			path: { order: Object.keys(CALC) },
		});
		return dir;
	}

	const EDGES: EdgeSubmit = {
		verdicts: [
			{ topic: "continuity", need: "limits", keep: true, reason: "defined by a limit" },
			{ topic: "derivative", need: "limits", keep: true, reason: "a limit of quotients" },
			{ topic: "chain", need: "derivative", keep: true, reason: "differentiates compositions" },
			{ topic: "riemann", need: "limits", keep: true, reason: "a limit of sums" },
			{ topic: "riemann", need: "chain", keep: false, reason: "a Riemann sum needs no derivative" },
		],
		add: [],
	};
	const bare = (a: ReturnType<typeof arc>) => ({ ...a, refs: [] });
	const CUT: ArcSubmit = {
		arcs: [arc("limits-continuity", "Limits and continuity", ["limits", "continuity"]), arc("derivatives", "Derivatives", ["derivative", "chain"]), arc("integrals", "Integrals", ["riemann"], { single: "its own chapter" })].map(bare),
		basis: "the book's chapters 2 to 5",
	};

	it("applies the settled edges, then forms the arcs in one save that changes no need", async () => {
		const dir = course("formed");
		const model = scriptedModel(EDGES, [CUT]);
		const log: TranscriptEntry[] = [];
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "apply", transcript: (e) => log.push(e) });
		assert.equal(result.status, "formed", JSON.stringify(result));
		const r = record(dir);
		assert.deepEqual(r.path.arcs, ["limits-continuity", "derivatives", "integrals"]);
		assert.deepEqual(r.topics.riemann.needs, ["limits"], "the edge step's drop");
		assert.equal(r.topics.riemann.arc, "integrals");
		assert.deepEqual(
			log.filter((e) => e.kind === "saved").map((e) => e.step),
			["edges", "cut"],
		);
		const cutSave = log.find((e) => e.kind === "saved" && e.step === "cut") as { changes: { topics: Record<string, object> } };
		for (const t of Object.values(cutSave.changes.topics)) assert.equal("needs" in t, false);
		assert.deepEqual(
			r.arc_log.map((e: { kind: string }) => e.kind),
			["edges", "formed"],
		);
		assert.deepEqual(r.arc_log[0].edges, [{ topic: "riemann", need: "chain", change: "drop", reason: "a Riemann sum needs no derivative" }]);
		assert.equal(r.arc_log[1].edges_entry, 0, "the formation refers to the edges it was cut on");
		assert.doesNotMatch(r.arc_log[1].reason, /riemann/, "the formation's reason carries no edges");
		const report = result.status === "formed" ? (result.report as { backward: unknown[] }) : null;
		assert.deepEqual(report?.backward, []);
	});

	it("in propose mode saves no edge, and a cut the engine refuses (a need on a later arc) goes back to the agent", async () => {
		const dir = course("proposed");
		const backward: ArcSubmit = { ...CUT, arcs: [arc("limits-continuity", "Limits and continuity", ["limits", "continuity"]), arc("integrals", "Integrals", ["riemann"], { single: "x" }), arc("derivatives", "Derivatives", ["derivative", "chain"])].map(bare) };
		const model = scriptedModel(EDGES, [backward, CUT]);
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "propose" });
		assert.equal(result.status, "formed");
		assert.match(model.refusals.join("\n"), /The engine refused the arcs: .*no topic may need a later arc/);
		assert.deepEqual(record(dir).topics.riemann.needs, ["limits", "chain"], "proposed, not applied");
		assert.equal(result.status === "formed" && result.edges.diffs.length, 1);
		assert.deepEqual(result.status === "formed" && result.edges.applied, []);
		assert.deepEqual(record(dir).arc_log.map((e: Record<string, unknown>) => [e.kind, "edges_entry" in e]), [["formed", false]], "nothing settled, nothing referred to");
	});

	it("a reader per topic adds what its topic's exercises use, and keeps a need the judge drops when an exercise uses it", async () => {
		const dir = course("readers");
		const model = scriptedModel(EDGES, [CUT], undefined, {}, {
			chain: [{ need: "continuity", step: "a chain-rule exercise checks the inner function is continuous" }, { need: "derivative", step: "differentiates the outer function" }],
			riemann: [{ need: "chain", step: "the substitution exercise differentiates the inner function" }],
		});
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "apply" });
		assert.equal(result.status, "formed", JSON.stringify(result));
		assert.deepEqual(record(dir).topics.chain.needs, ["derivative", "continuity"]);
		assert.deepEqual(record(dir).topics.riemann.needs, ["limits", "chain"], "the judge's drop needs the reader's agreement");
		assert.deepEqual(result.status === "formed" && result.edges.diffs.map((d) => `${d.change} ${d.topic}<-${d.need}`), ["add chain<-continuity"]);
		assert.equal(model.readers, 2 * Object.keys(CALC).length, "two fresh readers per topic");
		assert.equal(model.kinds, 1, "one kind check for the course");
	});

	it("the cut sees the needs the edge step just added, and one it withdraws is dropped in the formation's save, logged as an edges event", async () => {
		const dir = course("withdrawn");
		const withdraw: ArcSubmit = { ...CUT, withdraw: [{ topic: "continuity", need: "derivative", reason: "only one exercise differentiates; continuity is worked by limits" }] };
		const model = scriptedModel(EDGES, [withdraw], undefined, {}, { continuity: [{ need: "derivative", step: "Exercise 9 differentiates a continuous function" }] }, [], [], {}, { "continuity<-derivative": "method" });
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "apply" });
		assert.equal(result.status, "formed", JSON.stringify(result));
		assert.ok([...model.prompts].some((p) => /- continuity: Continuity \(needs limits; added needs derivative/.test(p)), "the cut's prompt lists the add apart");
		const r = record(dir);
		assert.deepEqual(r.topics.continuity.needs, ["limits"]);
		assert.equal(r.topics.continuity.arc, "limits-continuity", "the cut holds without the withdrawn need, which sits in a later arc");
		const formed = r.arc_log.at(-1);
		assert.equal(formed.kind, "formed");
		const drop = r.arc_log.find((e: { kind: string; edges?: { change: string }[] }) => e.kind === "edges" && e.edges?.some((d) => d.change === "drop" && JSON.stringify(d).includes("withdrawn by the cut")));
		assert.ok(drop, JSON.stringify(r.arc_log));
		assert.equal(formed.edges_entry, r.arc_log.indexOf(drop));
		assert.deepEqual(result.status === "formed" && result.edges.withdrawn.map((d) => `${d.topic}<-${d.need}`), ["continuity<-derivative"]);
	});

	it("proposes only the uses the kind check sorts into a kind that makes a prerequisite, and lists the rest as refused", async () => {
		const dir = course("kinds");
		const model = scriptedModel(EDGES, [CUT], undefined, {}, {
			chain: [{ need: "continuity", step: "the chain rule's statement needs the inner function continuous" }],
			continuity: [{ need: "derivative", step: "the section after it differentiates continuous functions" }],
		}, [], [], {}, { "continuity<-derivative": "placement" });
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "propose" });
		assert.equal(result.status, "formed", JSON.stringify(result));
		assert.deepEqual(result.status === "formed" && result.edges.diffs.filter((d) => d.change === "add").map((d) => `${d.topic}<-${d.need}`), ["chain<-continuity"]);
		assert.deepEqual(result.status === "formed" && result.edges.refused.map((a) => `${a.topic}<-${a.need}`), ["continuity<-derivative"]);
		assert.deepEqual(result.status === "formed" && result.edges.kinds?.map((k) => `${k.topic}<-${k.need} ${k.kind}`), ["continuity<-derivative placement", "chain<-continuity definition"]);
	});

	it("a copy run told to cut on the stored edges keeps the material's cut where a proposed add would refuse it, and still proposes the add", async () => {
		const readers = {
			continuity: [{ need: "derivative", step: "a continuity exercise differentiates the function first" }],
			chain: [{ need: "limits", step: "the chain rule's proof takes a limit" }],
		};
		const kinds = { "continuity<-derivative": "method" } as const;
		const stored = scriptedModel(EDGES, [CUT], undefined, {}, readers, [], [], {}, kinds);
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: stored }).run(course("cut-stored"), { edges: "propose", cutOn: "stored" });
		assert.equal(result.status, "formed", JSON.stringify(result));
		assert.deepEqual(stored.refusals, [], "the cut puts continuity before the derivative, as the material does");
		assert.deepEqual(result.status === "formed" && result.edges.implied.map((a) => `${a.topic}<-${a.need}`), ["chain<-limits"]);
		assert.ok(![...stored.prompts].some((p) => p.includes("implied needs")), "a cut on stored edges withdraws nothing, so it sees no implied need to bring back");
		assert.deepEqual(result.status === "formed" && result.edges.diffs.filter((d) => d.change === "add").map((d) => `${d.topic}<-${d.need}`), ["continuity<-derivative"]);
		const proposed = scriptedModel(EDGES, [CUT], undefined, {}, readers, [], [], {}, kinds);
		await assert.rejects(createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: proposed }).run(course("cut-proposed"), { edges: "propose" }), /never submitted/);
		assert.match(proposed.refusals.join("\n"), /needs "derivative", a prerequisite the edge step proposes/, "by default the cut holds every proposal");
	});

	it("the loop check settles a loop the readers' uses close, and a stored edge it rules against is dropped", async () => {
		const dir = course("loops");
		const keep = { ...EDGES, verdicts: EDGES.verdicts.map((v) => ({ ...v, keep: true })) };
		const model = scriptedModel(keep, [CUT], undefined, {}, { limits: [{ need: "continuity", step: "a limit exercise uses continuity to substitute" }] }, [], [], {
			"limits<-continuity": { topic: "continuity", need: "limits", reason: "a continuity exercise is worked from its definition" },
		});
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "propose" });
		assert.equal(result.status, "formed", JSON.stringify(result));
		assert.equal(model.loops, 1, "one loop check for the course");
		assert.deepEqual(result.status === "formed" && result.edges.diffs.map((d) => `${d.change} ${d.topic}<-${d.need}`), ["drop continuity<-limits", "add limits<-continuity"]);
		const quiet = scriptedModel(keep, [CUT]);
		await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: quiet }).run(course("no-loops"), { edges: "propose" });
		assert.equal(quiet.loops, 0, "no loop, no check");
	});

	it("a reader's answer counts only once it has read from each source its topic's refs cite", async () => {
		const withNotes = (name: string) => {
			const dir = course(name);
			fs.writeFileSync(path.join(dir, "notes.md"), "# 5.1 Riemann sums\nExercise: a limit of sums.\n");
			engine(["--workspace", dir, "save"], { sources: { notes: { path: "notes.md" } }, topics: Object.fromEntries(Object.keys(CALC).map((t) => [t, { refs: [{ source: "notes", locator: "5.1" }] }])) });
			return dir;
		};
		const dir = withNotes("read-first");
		const keep = { ...EDGES, verdicts: EDGES.verdicts.map((v) => ({ ...v, keep: true })) };
		const cut = { ...CUT, arcs: CUT.arcs.map((a) => ({ ...a, refs: [{ source: "notes" }] })) };
		const lazy = scriptedModel(keep, [cut], undefined, {}, {}, [], ["riemann"]);
		const log: TranscriptEntry[] = [];
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: lazy }).run(dir, { edges: "propose", transcript: (e) => log.push(e) });
		assert.equal(result.status, "formed", JSON.stringify(result));
		assert.match(lazy.refusals.join("\n"), /Read your topic's material before you answer: nothing read yet from notes/);
		assert.deepEqual(result.status === "formed" && result.edges.readings.riemann, [null, null], "a reader that never reads never counts");
		assert.ok(log.some((e) => e.kind === "skipped" && e.topic === "riemann"));
		const reading = scriptedModel(keep, [cut], undefined, {}, { riemann: [{ need: "continuity", step: "a continuous integrand" }] });
		const read = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: reading }).run(withNotes("read-first-2"), { edges: "propose" });
		assert.equal(read.status, "formed");
		assert.deepEqual(reading.refusals, [], "a reader that read first is taken at once");
		assert.deepEqual(read.status === "formed" && read.edges.readings.riemann, [{ uses: [{ need: "continuity", step: "a continuous integrand" }] }, { uses: [{ need: "continuity", step: "a continuous integrand" }] }]);
	});

	it("reads the course's material as the engine lists it: a registered folder through its files, a sheet beside the record, code as text", async () => {
		const dir = course("material");
		fs.mkdirSync(path.join(dir, "lectures"));
		fs.writeFileSync(path.join(dir, "lectures", "l3.md"), "# Lecture 3\nThe closed world assumption, by SLD refutation.\n");
		fs.writeFileSync(path.join(dir, "sheet.md"), "# Sheet\nExercise 19: minimise the least-squares loss.\n");
		fs.writeFileSync(path.join(dir, "screening.ts"), "export function screenEntities() {\n\treturn searchPublicationMentions();\n}\n");
		fs.writeFileSync(path.join(dir, "slides.pptx"), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]));
		engine(["--workspace", dir, "save"], { sources: { lectures: { path: "lectures" }, code: { path: "screening.ts" }, deck: { path: "slides.pptx" } } });
		const model = scriptedModel({ ...EDGES, verdicts: EDGES.verdicts.map((v) => ({ ...v, keep: true })) }, [{ ...CUT, arcs: CUT.arcs.map((a) => ({ ...a, refs: [{ source: "lectures" }] })) }]);
		await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "propose" });
		const edges = [...model.prompts].find((p) => p.includes("## Edges to judge"))!;
		const material = edges.split("## Material")[1]!.split("## Topics")[0]!;
		assert.match(material, /^- code: screening\.ts \(text, \d+ characters\)$/m, "a registered code file is text");
		assert.match(material, /^- deck: slides\.pptx \(cannot be opened: a \.pptx cannot be read here; export it as PDF\)$/m, "a binary one is not");
		assert.match(material, /^- lectures: lectures \(a registered folder, read through its files below\)\n {2}- l3: lectures\/l3\.md \(text, \d+ characters; in the folder lectures: refs cite lectures\)$/m);
		assert.match(material, /^- sheet: sheet\.md \(text, \d+ characters; not registered: read it, never cite it in refs\)$/m);
	});

	it("a search that names no source searches every source, so an exercise a section points to is found wherever it is listed", async () => {
		const dir = fs.mkdtempSync(path.join(TMP, "search-"));
		fs.writeFileSync(path.join(dir, "lecture.md"), "### Chain rule\nSuggested Exercises 18 and 19.\n");
		fs.writeFileSync(path.join(dir, "sheet.md"), "Exercise 19: find the beta that minimises the least-squares loss.\n");
		const tools = createMaterialTools(await measureMaterial(dir, [{ handle: "lecture", path: "lecture.md" }, { handle: "sheet", path: "sheet.md" }]));
		const text = async (input: object) => JSON.stringify(await tools.search_material!.execute("t", input as never, undefined as never));
		assert.match(await text({ query: "Exercise 19" }), /## sheet.*1: Exercise 19: find the beta/);
		assert.doesNotMatch(await text({ query: "Exercise 19" }), /## lecture/, "a source with no match is left out");
		assert.match(await text({ source: "lecture", query: "Exercise 19" }), /No match for \\"Exercise 19\\" in lecture/);
	});

	it("a purpose line a fresh reader finds false of one of its topics sends the cut back, naming the topic", async () => {
		const dir = course("purpose");
		const model = scriptedModel(EDGES, [CUT], undefined, {}, {}, ["Chain rule"]);
		await assert.rejects(createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "apply" }), /never submitted/);
		assert.match(model.refusals[0]!, /"Derivatives": its purpose line is not true of "Chain rule" \(chain\): the line promises nothing of it/);
		const quiz = { arcs: [{ title: "Derivatives", purpose: "Differentiate.", units: [], topics: [{ id: "t1", handle: "chain", title: "Chain rule" }] }] };
		assert.match(purposeProblems({ false: [], lines: [{ arc: "Derivatives", why: "it restates the name" }] }, quiz)!, /- "Derivatives": it restates the name/);
		assert.match(purposeAnswerProblems({ false: [], lines: [{ arc: "Integrals", why: "x" }] }, quiz)!, /"Integrals" is no arc name/);
		assert.equal(purposeProblems({ false: [], lines: [] }, quiz), null);
		const fine = scriptedModel(EDGES, [CUT]);
		assert.equal((await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: fine }).run(course("purpose-fine"), { edges: "apply" })).status, "formed");
		assert.equal(fine.purposes, 1);
	});

	it("a name that lists its topics instead of naming one idea sends the cut back, and the reader sees the unit each arc cites", () => {
		const cut: ArcSubmit = { basis: "chapters", arcs: [arc("estimation", "Efficiency, sufficiency and estimation methods", ["limits", "continuity"], { refs: [{ source: "book", locator: "Chapter 9" }] }), arc("tests", "Hypothesis testing", ["derivative", "chain", "riemann"])] };
		const quiz = purposeQuiz(cut, view(CALC), arcPassChanges(cut, view(CALC))!);
		assert.deepEqual(quiz.arcs[0]!.units, ["book Chapter 9"]);
		const answer = { false: [], names: [{ arc: "Efficiency, sufficiency and estimation methods", why: "it enumerates three of its topics" }] };
		assert.equal(purposeAnswerProblems(answer, quiz), null);
		const refusal = purposeProblems(answer, quiz)!;
		assert.match(refusal, /- "Efficiency, sufficiency and estimation methods": the name does not name the arc's one idea: it enumerates three of its topics/);
		assert.match(refusal, /Name each such arc for the one idea all its topics serve, in the material's words, by its unit's own title when that fits every topic/);
		assert.doesNotMatch(refusal, /Write each such line again/, "no purpose line was faulted");
		assert.match(purposeAnswerProblems({ false: [], names: [{ arc: "Sorting", why: "x" }] }, quiz)!, /"Sorting" is no arc name/);
	});

	it("an arc whose topics, read without its name and line, answer two questions sends the cut back, even when its line is true of every topic", () => {
		const cut: ArcSubmit = { basis: "chapters", arcs: [arc("limits", "Limits", ["limits", "continuity"]), arc("calculus", "Calculus beyond limits", ["derivative", "chain", "riemann"])] };
		const quiz = purposeQuiz(cut, view(CALC), arcPassChanges(cut, view(CALC))!);
		const [riemann] = quiz.arcs[1]!.topics.filter((t) => t.handle === "riemann");
		const answer = { false: [], splits: [{ arc: "Calculus beyond limits", question: "How fast does a function change?", apart: [riemann!.id], other: "How much does a function accumulate?" }] };
		assert.equal(purposeAnswerProblems(answer, quiz), null);
		const refusal = purposeProblems(answer, quiz)!;
		assert.match(refusal, /- "Calculus beyond limits" holds two ideas: its topics serve "How fast does a function change\?", but "[^"]+" \(riemann\) serve "How much does a function accumulate\?" instead\./);
		assert.match(refusal, /by rising above them, is still two \(rule 3\)/);
		assert.doesNotMatch(refusal, /Write each such line again|Name each such arc/, "no line or name was faulted");
		const all = quiz.arcs[1]!.topics.map((t) => t.id);
		assert.match(purposeAnswerProblems({ false: [], splits: [{ ...answer.splits[0]!, apart: all }] }, quiz)!, /some of them and not all/);
		assert.match(purposeAnswerProblems({ false: [], splits: [{ ...answer.splits[0]!, apart: [quiz.arcs[0]!.topics[0]!.id] }] }, quiz)!, /is no topic of "Calculus beyond limits"/);
		assert.match(purposeAnswerProblems({ false: [], splits: [{ ...answer.splits[0]!, other: " " }] }, quiz)!, /give "Calculus beyond limits" both questions/);
	});

	it("a blind reader sorts the titles into the arc names alone; two topics that read as another arc send the cut back, naming them", async () => {
		const dir = course("sorted");
		const model = scriptedModel(EDGES, [CUT, CUT], undefined, { Continuity: "Derivatives", "Chain rule": "Integrals" });
		const log: TranscriptEntry[] = [];
		await assert.rejects(createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "apply", transcript: (e) => log.push(e) }), /never submitted/, "the reader keeps refusing the same names, so the cut never passes");
		assert.match(model.refusals[0]!, /"Continuity" \(continuity\), in "Limits and continuity", reads as part of "Derivatives"/);
		assert.match(model.refusals[0]!, /"Chain rule" \(chain\), in "Derivatives", reads as part of "Integrals"/);
		const sorted = log.filter((e) => e.kind === "sorted");
		assert.ok(sorted.length >= 1);
		assert.deepEqual(record(dir).arcs ?? {}, {}, "nothing formed");
	});

	it("one miss the basis explains by the topic's name passes the blind sort", async () => {
		const dir = course("one-miss");
		const model = scriptedModel(EDGES, [{ ...CUT, basis: "the book's chapters 2 to 5; continuity reads as derivatives, borderline" }], undefined, { Continuity: { arc: "Derivatives", readers: 2 } });
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "apply" });
		assert.equal(result.status, "formed", JSON.stringify(result));
		assert.deepEqual(result.status === "formed" && result.sort?.map((m) => m.topic), ["continuity"]);
		assert.equal(model.sorts, 3, "three blind readers");
	});

	it("the cut reads which topics the record's exam leaves out, so it can keep the exam's boundary (AIKR: 50 topics left out of Module 1)", async () => {
		const dir = course("left-out");
		engine(["--workspace", dir, "save"], { exam: { date: "2026-12-01", leaves_out: ["riemann"] } });
		const model = scriptedModel(EDGES, [CUT]);
		await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "apply" });
		const cut = [...model.prompts].find((p) => p.includes("## Topics, in path order"))!;
		assert.match(cut, /^- riemann: Riemann sums \(.*outside the scope of the exam on 2026-12-01\)$/m);
		assert.doesNotMatch(cut, /^- limits: .*outside the scope/m);
	});

	it("a course he has studied takes arcs only with words in asked", async () => {
		const dir = course("studied");
		engine(["--workspace", dir, "save"], { topics: { limits: { introduced: "2026-11-01" } } });
		const refusing = scriptedModel(EDGES, [CUT]);
		await assert.rejects(createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: refusing }).run(dir, { edges: "propose" }), /never submitted/);
		assert.match(refusing.refusals[0]!, /forms arcs in a course he has already studied/);
		assert.equal("arcs" in record(dir) && Object.keys(record(dir).arcs).length, 0);
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: scriptedModel(EDGES, [CUT]) }).run(dir, { edges: "propose", asked: "approved by Edo on 2026-11-14: yes, form them" });
		assert.equal(result.status, "formed");
		assert.equal(record(dir).arc_log[0].asked, "approved by Edo on 2026-11-14: yes, form them");
	});

	it("a course whose ledger is not new never runs live: no model call, nothing saved", async () => {
		for (const ledger of [undefined, { state: "formed" as const, at: "", topics: 5 }, { state: "proposed" as const, at: "", topics: 5 }, { state: "none" as const, at: "", topics: 5 }]) {
			const dir = course(`never-${ledger?.state ?? "unledgered"}`);
			const ledgers = memoryLedgers();
			if (ledger) ledgers.save(dir, ledger);
			const model = scriptedModel(EDGES, [CUT]);
			const pass = createArcPass({ courseRecords: records, ledgers, engine: model });
			const revision = record(dir).revision;
			pass.built(dir);
			await pass.settle(dir);
			await pass.resumeCut();
			assert.equal(model.calls, 0, ledger?.state ?? "no ledger");
			assert.equal(record(dir).revision, revision);
			assert.equal(mapRuns().inFlight.has(dir), false);
		}
	});

	it("a new course runs once its map build saved and ended, and records formed", async () => {
		const dir = course("live");
		const ledgers = memoryLedgers();
		ledgers.save(dir, { state: "new", at: "", topics: 0 });
		const model = scriptedModel(EDGES, [CUT], () => assert.equal(mapRuns().inFlight.has(dir), true, "it holds the course"));
		const rebuilt: string[] = [];
		const pass = createArcPass({ courseRecords: records, ledgers, engine: model, rebuild: (w) => rebuilt.push(w) });
		mapRuns().inFlight.add(dir);
		pass.built(dir);
		await pass.settle(dir);
		assert.equal(model.calls, 0, "waits while the build holds the course");
		mapRuns().inFlight.delete(dir);
		mapRuns().rerun.add(dir);
		await pass.settle(dir);
		assert.equal(model.calls, 0, "and while a build is asked for again");
		mapRuns().rerun.delete(dir);
		await pass.settle(dir);
		assert.equal(ledgers.get(dir)?.state, "formed");
		assert.equal(ledgers.get(dir)?.revision, record(dir).revision);
		assert.equal(mapRuns().inFlight.has(dir), false);
		await pass.settle(dir);
		assert.equal(model.calls, 2, "one run, its two answers");
	});

	it("a new course he has already studied records failed without asking a model", async () => {
		const dir = course("live-studied");
		engine(["--workspace", dir, "save"], { topics: { limits: { introduced: "2026-11-01" } } });
		const ledgers = memoryLedgers();
		ledgers.save(dir, { state: "new", at: "", topics: 0 });
		const model = scriptedModel(EDGES, [CUT]);
		const pass = createArcPass({ courseRecords: records, ledgers, engine: model });
		await pass.resumeCut();
		assert.equal(ledgers.get(dir)?.state, "failed");
		assert.match(ledgers.get(dir)!.reason!, /only his words can ask for arcs/);
		assert.equal(model.calls, 0);
	});
});
