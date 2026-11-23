/**
 * Round 21, M2 (2 N1, 4 minor 1): a session resumed on a later day closed
 * on the topics of its earlier day. Problem sheet 4 was left on 6 Nov with
 * no close; on 8 Nov he answered part (c) and pressed ⌘⇧D, and the close
 * named six reviews over five days, the ones its 6 Nov save had dated. The
 * receipt read the chat since its last close, not the study day it closes.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { closeReceiptFor } from "../src/agent/tools/course.ts";
import { receiptOfMap, receiptOfSaves, sessionSavesOf, type CloseReceipt } from "../src/core/close-receipt.ts";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { tonightAppends } from "../src/core/input-events.ts";
import { newDoneTonightMessage, withCloseReceipt } from "../src/core/native-messages.ts";
import { rules, send } from "./helpers/round19-turns.ts";
import type { CourseMap } from "../src/core/contracts/course-map.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { CourseRecords } from "../src/core/ports.ts";

const D8 = "2026-11-08";
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();
let n = 0;

const topic = (handle: string, title: string, date: string) => ({ handle, title, level: "attempted", tasks: [], review: { kind: "scheduled", date } });

/** Linear Algebra on 8 Nov, as lens 2's sheet close read it. */
const LA_8 = {
	workspace: "/la",
	title: "Linear Algebra",
	today: D8,
	tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: null, updated: D8, topics: ["kernel"] }],
	topics: [
		topic("kernel", "Kernel and rank-nullity", "2026-11-09"),
		topic("subspace-span", "Subspaces and spanning sets", "2026-11-10"),
		topic("homomorphism", "Homomorphisms (linear maps)", "2026-11-10"),
		topic("mult-mechanics", "Mechanics of matrix multiplication", "2026-11-11"),
		topic("det-properties", "Determinants", "2026-11-12"),
		topic("independence", "Linear independence", "2026-11-27"),
	],
} as unknown as CourseMap;
const records = { map: async () => ({ ok: true, map: LA_8 }) } as unknown as CourseRecords;

/** One save the tutor made, its call and the engine's receipt, at `ts`. */
function saved(ts: number, topics: string[], extra: Record<string, unknown> = {}): LhMessage[] {
	const id = `v-${++n}`;
	const reviews = Object.fromEntries(topics.map((t) => {
		const { title, review } = LA_8.topics.find((x) => x.handle === t) as unknown as { title: string; review: { date: string } };
		return [t, { due: review.date, planned: review.date, title }];
	}));
	return [
		{ id: `a-${++n}`, role: "assistant", content: [{ type: "toolCall", id, name: "course_save", arguments: { changes: { observations: topics.map((t) => ({ topics: [t], text: "…", result: "correct", help: "none" })), ...extra } } }], stopReason: "toolUse", timestamp: ts } as unknown as LhMessage,
		{ id: `r-${++n}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: JSON.stringify({ revision: n, reviews }) }], details: {}, isError: false, timestamp: ts } as unknown as LhMessage,
	];
}
const said = (ts: number, text: string): LhMessage => ({ id: `u-${++n}`, role: "user", content: text, timestamp: ts }) as LhMessage;

/** The sheet as the seed holds it: five reviews and its own task saved on
 *  6 Nov, never closed, then part (c) answered on 8 Nov. */
const SHEET = {
	title: "Problem sheet 4",
	topics: ["kernel"],
	messages: [
		said(at(6, 10), "Help me start problem sheet 4."),
		...saved(at(6, 11), ["subspace-span", "homomorphism", "mult-mechanics", "independence", "det-properties"], { tasks: { "sheet-4": { title: "Problem sheet 4", step: "Part (c)" } } }),
		said(at(8, 10), "Continue Problem sheet 4"),
		...saved(at(8, 10), ["kernel"]),
	],
};

describe("the close names only the study day it closes (round 21, M2)", () => {
	let pinned: string | undefined;
	beforeEach(() => {
		pinned = process.env.LEARNING_TODAY;
		process.env.LEARNING_TODAY = D8;
	});
	afterEach(() => {
		if (pinned === undefined) delete process.env.LEARNING_TODAY;
		else process.env.LEARNING_TODAY = pinned;
	});

	it("a save on day 1 and no close, then a save on day 3 and the close: only day 3's topics, and the sheet that goes on", async () => {
		const receipt = (await closeReceiptFor(records, "/la", SHEET))!;
		assert.deepEqual(receipt.topics.map((t) => t.title), ["Kernel and rank-nullity"]);
		assert.equal(receipt.continues?.title, "Problem sheet 4");
		assert.doesNotMatch(receipt.says, /Subspaces|Homomorphisms|Mechanics|Determinants|independence/);
	});

	it("a save's close so far counts only the saves of its day", () => {
		const close = receiptOfSaves(sessionSavesOf(SHEET.messages), D8);
		assert.deepEqual(close.topics.map((t) => t.handle), ["kernel"]);
	});

	it("a session that never left its day keeps every save since its last close", async () => {
		const sameDay = { ...SHEET, messages: SHEET.messages.map((m) => ({ ...m, timestamp: at(8, 9) })) };
		const receipt = (await closeReceiptFor(records, "/la", sameDay))!;
		assert.deepEqual(receipt.topics.map((t) => t.handle).sort(), ["det-properties", "homomorphism", "independence", "kernel", "mult-mechanics", "subspace-span"]);
	});
});

/**
 * Round 21, M3 (1 m1, 1 m2, 3 n1): the close's line for the open work had
 * no day, or pointed at another task. Six closes: the LA review's "The
 * kernel question is still waiting for you."; the Probability review's
 * "Your half answer to the two-dice question waits in this Probability
 * review."; Stirling's "…is still open, and you pick it up first.";
 * Poisson's "Next you pick up the open help-desk question."; Expectation's
 * "When you come back, you start with the question you left open…"; and
 * the Eigen lesson's "You pick up with part (c) of Problem sheet 4." over
 * its own open recall question. Now the receipt names the session's open
 * question first, where it waits and its day from the plan, and the voice
 * check refuses the open work without its day or other work before it.
 *
 * m12 (1 m7, 2 n6): a close quoted a title ('your "Expectation and
 * linearity" lesson') and said one date twice ("…continues tomorrow,
 * Monday 9 November. Your Eigenvalues and eigenvectors review comes back
 * tomorrow, Monday 9 November").
 */
const D9 = "2026-11-09";
const D10 = "2026-11-10";
const due = { review: { kind: "due", daysOverdue: 0 } };
const mapOf = (title: string, today: string, topics: Record<string, unknown>[], tasks: unknown[] = []) => ({ workspace: `/${title}`, title, today, tasks, topics: topics.map((t) => ({ level: "attempted", tasks: [], review: null, ...t })) }) as unknown as CourseMap;

/** A session left on its open question by his Done for today, `half`
 *  his half answer in its box. */
function leftOn(record: { title: string; topics: string[]; opening?: string }, topic: string, half?: string) {
	const id = `q-${++n}`;
	const messages: LhMessage[] = [
		said(Date.now(), record.opening ?? record.title),
		{ id: `a-${++n}`, role: "assistant", content: [{ type: "toolCall", id, name: "recall", arguments: { question: "Which…?", correctAnswer: "…", topic } }], stopReason: "toolUse", timestamp: Date.now() } as unknown as LhMessage,
	];
	return { ...record, messages: [...messages, ...tonightAppends({ messages }, half ? { toolCallId: id, text: half } : undefined)] };
}
const recordsOf = (map: CourseMap) => ({ map: async () => ({ ok: true, map }) }) as unknown as CourseRecords;

/** The guard of the close that answers his Done for today, with `titles`. */
async function closing(receipt: CloseReceipt, titles: readonly string[], review = false): Promise<VoiceGuard> {
	const guard = new VoiceGuard([withCloseReceipt(newDoneTonightMessage(review ? "prober" : "teacher"), receipt)], undefined, review, true, async () => titles);
	await Promise.resolve();
	return guard;
}
const CLOSE_RULES = new Set(["close-calendar", "close-untouched", "close-day", "close-open-first", "close-quoted", "close-date-twice", "title-and", "vague-day", "half-answer", "half-answer-day"]);
const closeRules = (guard: VoiceGuard, words: string) => rules(guard, send(words)).filter((r) => CLOSE_RULES.has(r));

const LA_9 = mapOf("Linear Algebra", D9, [
	{ handle: "kernel", title: "Kernel and rank-nullity", ...due },
	{ handle: "rank", title: "Rank and the column space", review: { kind: "scheduled", date: D10 } },
]);
const PROB_9 = mapOf("Probability", D9, [
	{ handle: "rv", title: "Random variables and distributions", ...due },
	{ handle: "ltp", title: "Law of total probability", review: { kind: "scheduled", date: "2026-11-15" } },
	{ handle: "poisson", title: "Poisson distribution", starts: D9, startsWhy: { kind: "begun", then: D10 } },
	{ handle: "expectation", title: "Expectation and linearity", starts: D9, startsWhy: { kind: "begun", then: D10 } },
]);
const ANALYSIS_10 = mapOf("Real Analysis", D10, [
	{ handle: "stirling", title: "Stirling's formula", starts: D10, startsWhy: { kind: "begun", then: "2026-11-11" }, review: null },
]);
const LA_10 = mapOf("Linear Algebra", D10, [
	{ handle: "eigen", title: "Eigenvalues and eigenvectors", review: { kind: "scheduled", date: "2026-11-14" } },
	{ handle: "mult-mechanics", title: "Mechanics of matrix multiplication", review: { kind: "scheduled", date: "2026-11-11" } },
], [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: D8, topics: ["kernel"] }]);
const titlesOf = (map: CourseMap) => [...map.topics.map((t) => t.title), "Problem sheet 4"];

describe("the open work comes first, with its day (round 21, M3)", () => {
	let pinned: string | undefined;
	const pin = (day: string) => { process.env.LEARNING_TODAY = day; };
	beforeEach(() => { pinned = process.env.LEARNING_TODAY; });
	afterEach(() => {
		if (pinned === undefined) delete process.env.LEARNING_TODAY;
		else process.env.LEARNING_TODAY = pinned;
	});

	it("lens 1's 9 Nov LA review, ⌘⇧D on the open Kernel question: the review it waits in comes back tomorrow", async () => {
		pin(D9);
		const receipt = (await closeReceiptFor(recordsOf(LA_9), "/la", leftOn({ title: "Linear Algebra review", topics: ["kernel", "rank"], opening: "Review Kernel and rank-nullity, Rank and the column space" }, "kernel")))!;
		assert.equal(receipt.says, "The question you left open waits in your Kernel and rank-nullity review, which comes back tomorrow, Tuesday 10 November.");
		const guard = await closing(receipt, titlesOf(LA_9), true);
		assert.ok(closeRules(guard, "The kernel question is still waiting for you. Your Rank and the column space review comes back tomorrow, Tuesday 10 November.").includes("vague-day"));
		assert.deepEqual(closeRules(await closing(receipt, titlesOf(LA_9), true), receipt.says), []);
	});

	it("lens 1's 9 Nov Probability review, a half answer: it waits in the review, with its day, before the other topic", async () => {
		pin(D9);
		const record = leftOn({ title: "Probability review", topics: ["rv", "ltp"], opening: "Review Random variables and distributions, Law of total probability" }, "rv", "P(sum = 7) is 6 over");
		const receipt = (await closeReceiptFor(recordsOf(PROB_9), "/prob", record))!;
		assert.match(receipt.says, /^Your half answer waits in your Random variables and distributions review, which comes back tomorrow, Tuesday 10 November/);
		const guard = await closing(receipt, titlesOf(PROB_9), true);
		assert.ok(closeRules(guard, "Your half answer to the two-dice question waits in this Probability review. Your Law of total probability review comes back on Sunday 15 November.").length > 0);
	});

	it("lens 1's Stirling, lens 3's Poisson and Expectation: the lesson it waits in continues on its day", async () => {
		pin(D10);
		const stirling = (await closeReceiptFor(recordsOf(ANALYSIS_10), "/ra", leftOn({ title: "Stirling's formula", topics: ["stirling"] }, "stirling")))!;
		assert.equal(stirling.says, "The question you left open waits in your Stirling's formula lesson, which continues tomorrow, Wednesday 11 November.");
		assert.ok(closeRules(await closing(stirling, titlesOf(ANALYSIS_10)), "The question on combining asymptotic equalities is still open, and you pick it up first. Your Stirling's formula review comes back tomorrow, Wednesday 11 November.").includes("vague-day"));
		pin(D9);
		for (const [handle, title, words] of [["poisson", "Poisson distribution", "Next you pick up the open help-desk question."], ["expectation", "Expectation and linearity", "When you come back, you start with the question you left open."]] as const) {
			const receipt = (await closeReceiptFor(recordsOf(PROB_9), "/prob", leftOn({ title, topics: [handle] }, handle)))!;
			assert.equal(receipt.says, `The question you left open waits in your ${title} lesson, which continues tomorrow, Tuesday 10 November.`);
			assert.ok(closeRules(await closing(receipt, titlesOf(PROB_9)), words).includes("vague-day"), words);
			assert.deepEqual(closeRules(await closing(receipt, titlesOf(PROB_9)), receipt.says), []);
		}
	});

	it("lens 1's 10 Nov Eigen close names its own recall question, not sheet 4", async () => {
		pin(D10);
		const receipt = (await closeReceiptFor(recordsOf(LA_10), "/la", leftOn({ title: "Eigenvalues and eigenvectors", topics: ["eigen"] }, "eigen")))!;
		assert.equal(receipt.says, "The question you left open waits in your Eigenvalues and eigenvectors lesson, which continues tomorrow, Wednesday 11 November; your Eigenvalues and eigenvectors review comes back on Saturday 14 November.");
		const broke = closeRules(await closing(receipt, titlesOf(LA_10)), "You pick up with part (c) of Problem sheet 4 tomorrow. Your Eigenvalues and eigenvectors review comes back on Saturday 14 November.");
		assert.ok(broke.includes("close-open-first"), broke.join());
		const split = "The question you left open waits in your Eigenvalues and eigenvectors lesson, which continues tomorrow, Wednesday 11 November. Your Eigenvalues and eigenvectors review comes back on Saturday 14 November.";
		assert.deepEqual(closeRules(await closing(receipt, titlesOf(LA_10)), split), [], "the lesson and its review on their own days, in two sentences");
	});

	it("a sheet's open part waits in the sheet, with the review that falls on its day", async () => {
		pin(D8);
		const sheet = leftOn({ title: "Problem sheet 4", topics: ["kernel"] }, "kernel");
		const held = { ...sheet, messages: [...SHEET.messages, ...sheet.messages] };
		const receipt = (await closeReceiptFor(records, "/la", held))!;
		assert.equal(receipt.says, "The question you left open waits in Problem sheet 4, which continues tomorrow, Monday 9 November, with your Kernel and rank-nullity review.");
	});
});

describe("close words: no quoted title, each day once (round 21, m12)", () => {
	let pinned: string | undefined;
	beforeEach(() => { pinned = process.env.LEARNING_TODAY; process.env.LEARNING_TODAY = D8; });
	afterEach(() => {
		if (pinned === undefined) delete process.env.LEARNING_TODAY;
		else process.env.LEARNING_TODAY = pinned;
	});
	const EIGEN_8 = mapOf("Linear Algebra", D8, [
		{ handle: "eigen", title: "Eigenvalues and eigenvectors", starts: D8, startsWhy: { kind: "begun", then: D9 } },
		{ handle: "mult-mechanics", title: "Mechanics of matrix multiplication", review: { kind: "scheduled", date: "2026-11-11" } },
	]);

	it("lens 2's Eigen close: the half answer's lesson and its review share tomorrow's date", async () => {
		const both = receiptOfMap(EIGEN_8, ["eigen", "mult-mechanics"], [], [], { topic: "eigen", half: true, review: false, own: "eigen" });
		assert.equal(both.says, "Your half answer waits in your Eigenvalues and eigenvectors lesson, which continues tomorrow, Monday 9 November; your Mechanics of matrix multiplication review comes back on Wednesday 11 November.");
		const twice = "Your half answer waits in your Eigenvalues and eigenvectors lesson, which continues tomorrow, Monday 9 November. Your Eigenvalues and eigenvectors review comes back tomorrow, Monday 9 November, and your Mechanics of matrix multiplication review comes back on Wednesday 11 November.";
		assert.ok(closeRules(await closing(both, titlesOf(EIGEN_8)), twice).includes("close-date-twice"));
	});

	it("what falls on one day is one clause, the day said once", () => {
		const map = mapOf("Linear Algebra", D8, [{ handle: "eigen", title: "Eigenvalues and eigenvectors", starts: D8, startsWhy: { kind: "begun", then: D9 } }, { handle: "kernel", title: "Kernel and rank-nullity", review: { kind: "scheduled", date: D9 } }]);
		assert.equal(receiptOfMap(map, ["eigen", "kernel"], []).says, "Your Eigenvalues and eigenvectors lesson and your Kernel and rank-nullity review are tomorrow, Monday 9 November.");
	});

	it("lens 1's 17 Nov close: a quoted title is refused, and a moved start is said with no quotes", async () => {
		const moved = { poisson: { title: "Poisson distribution", starts: "2026-11-11", moved: { from: D9, by: "study", waits_on: ["Binomial distribution"] } } };
		const receipt = receiptOfSaves([{ topics: ["binomial"], receipt: { reviews: { binomial: { due: D9, planned: D9, title: "Binomial distribution" } }, starts_moved: moved } }], D8);
		assert.equal(receipt.says, "Your Binomial distribution review comes back tomorrow, Monday 9 November; you now start Poisson distribution on Wednesday 11 November, since it waits on Binomial distribution.");
		assert.doesNotMatch(receipt.says, /[“”"]/);
		const map = mapOf("Probability", D8, [{ handle: "expectation", title: "Expectation and linearity", starts: D8, startsWhy: { kind: "begun", then: D9 } }]);
		const lesson = receiptOfMap(map, ["expectation"], []);
		assert.ok(closeRules(await closing(lesson, ["Expectation and linearity"]), 'Your "Expectation and linearity" lesson continues tomorrow, Monday 9 November.').includes("close-quoted"));
		assert.deepEqual(closeRules(await closing(lesson, ["Expectation and linearity"]), lesson.says), []);
	});
});
