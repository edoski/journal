/**
 * Round 20, M3 (1 m2, 2 n4, 3 n2, 4 minor 7), m8 (2 n6) and m7 (1 m4): one
 * close receipt for every session kind.
 *
 * Each kind of session composed its close its own way, from the plan
 * instead of its own saves. The Eigen lesson's close recited Wednesday's
 * whole plan, five reviews it never touched; the 9 Nov review left its two
 * days "on your calendar"; the 10 Nov review's own close named only its
 * last save's topic and left out Random variables and two moved starts;
 * the sheet close and the Invertible close left days "on your calendar".
 * Now every close reads one receipt (the topics this session answered,
 * each with its day; the task that goes on; each start a save moved), and
 * the voice guard holds the close to it. Two titles joined by "and" read
 * as four topics (m8), and a lesson moved from a review opened on Home's
 * row label, "Now Start Expectation and linearity:" (m7).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { receiptOfMap, receiptOfSaves, sessionSavesOf, type CloseReceipt, type SessionSave } from "../src/core/close-receipt.ts";
import { DONE_TONIGHT_TEXT, NEXT_PROBLEM_TEXT } from "../src/core/contracts/chat.ts";
import type { CourseMap } from "../src/core/contracts/course-map.ts";
import { newDoneTonightMessage, newUserMessage, withCloseReceipt, type LhMessage } from "../src/core/native-messages.ts";
import { saveCourse, type CourseToolContext } from "../src/agent/tools/course.ts";
import { brief, nextId, recall, rules, send } from "./helpers/round19-turns.ts";

const D8 = "2026-11-08";

/** A topic on a course map. */
const topic = (handle: string, title: string, over: Record<string, unknown> = {}) => ({ handle, title, level: "attempted", review: null, ...over });
const scheduled = (date: string) => ({ review: { kind: "scheduled", date } });

/** Lens 1's Linear Algebra and Probability on 8 Nov, after the Eigen
 *  lesson's Done for today: Wednesday 11 November holds six reviews. */
const LA_8 = {
	workspace: "/la",
	title: "Linear Algebra",
	today: D8,
	tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: null, updated: D8, topics: ["kernel"] }],
	topics: [
		topic("eigen", "Eigenvalues and eigenvectors", { starts: D8, startsWhy: { kind: "begun", then: "2026-11-09" } }),
		topic("matmul-mech", "Mechanics of matrix multiplication", scheduled("2026-11-11")),
		topic("matmul", "Matrix multiplication", scheduled("2026-11-11")),
		topic("subspaces", "Subspaces and spanning sets", scheduled("2026-11-11")),
		topic("homs", "Homomorphisms (linear maps)", scheduled("2026-11-11")),
		topic("kernel", "Kernel and rank-nullity", scheduled("2026-11-09")),
		topic("rank", "Rank and the column space", scheduled("2026-11-09")),
	],
} as unknown as CourseMap;
const PROB_TITLES = ["Conditional probability", "Law of total probability", "Independent events", "Random variables and distributions", "Geometric distribution", "Negative binomial distribution"];
const TITLES = [...LA_8.topics.map((t) => t.title), ...PROB_TITLES];

/** A save's receipt as `course_save` returns it, each review titled. */
const receiptOf = (reviews: Record<string, [string, string]>, starts: Record<string, unknown> = {}) => ({
	revision: 3,
	reviews: Object.fromEntries(Object.entries(reviews).map(([handle, [title, planned]]) => [handle, { due: planned, planned, title }])),
	...(Object.keys(starts).length ? { starts_moved: starts } : {}),
});
const savedResult = (receipt: unknown): LhMessage =>
	({ id: `r-${nextId()}`, role: "toolResult", toolCallId: `v-${nextId()}`, toolName: "course_save", content: [{ type: "text", text: JSON.stringify(receipt) }], details: null, isError: false, timestamp: Date.now() }) as unknown as LhMessage;

/** A guard for a close: his Done for today carrying `receipt`, or a turn
 *  whose save returned it, with every course's titles. */
async function closing(receipt: CloseReceipt, opts: { review?: boolean; done?: boolean } = {}): Promise<VoiceGuard> {
	const opened: LhMessage[] = opts.done === false ? [newUserMessage("…")] : [withCloseReceipt(newDoneTonightMessage(opts.review ? "prober" : "teacher"), receipt)];
	const guard = new VoiceGuard(opened, undefined, opts.review === true, true, async () => TITLES);
	await Promise.resolve();
	if (opts.done === false) {
		const call: ToolCall = { type: "toolCall", id: `v-${nextId()}`, name: "course_save", arguments: { changes: {} } };
		guard.screen(call);
		const tool = { name: "course_save", label: "course_save", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: JSON.stringify({ revision: 4, reviews: {}, close: receipt }) }], details: null }) } as unknown as AgentTool<never>;
		await guard.wrap(tool).execute(call.id, call.arguments as never, undefined, undefined);
	}
	return guard;
}

const CLOSE_RULES = new Set(["close-calendar", "close-untouched", "close-day", "title-and"]);
const closeRules = (guard: VoiceGuard, words: string) => rules(guard, send(words)).filter((r) => CLOSE_RULES.has(r));

describe("one close receipt for every session (round 20, M3)", () => {
	let pinned: string | undefined;
	beforeEach(() => {
		pinned = process.env.LEARNING_TODAY;
		process.env.LEARNING_TODAY = D8;
	});
	afterEach(() => {
		if (pinned === undefined) delete process.env.LEARNING_TODAY;
		else process.env.LEARNING_TODAY = pinned;
	});

	it("lens 1's 8 Nov Eigen close: the lesson and the Mechanics review it ran, each with its day, and none of Wednesday's other reviews", async () => {
		const receipt = receiptOfMap(LA_8, ["eigen", "matmul-mech"], []);
		assert.deepEqual(receipt.topics.map((t) => [t.title, t.day_words]), [
			["Eigenvalues and eigenvectors", "tomorrow, Monday 9 November"],
			["Mechanics of matrix multiplication", "Wednesday 11 November"],
		]);
		assert.equal(receipt.says, "Your Eigenvalues and eigenvectors lesson continues tomorrow, Monday 9 November; your Mechanics of matrix multiplication review comes back on Wednesday 11 November.");
		const lens = "Your half answer to the eigenspace question waits in your Eigenvalues and eigenvectors lesson, which continues tomorrow, Monday 9 November, along with its review. Wednesday 11 November holds your Subspaces and spanning sets, Matrix multiplication, Mechanics of matrix multiplication, Conditional probability, Law of total probability and Independent events reviews.";
		const guard = await closing(receipt);
		assert.ok(closeRules(guard, lens).includes("close-untouched"), "five reviews the session never touched");
		const good = await closing(receipt);
		assert.deepEqual(closeRules(good, "Your half answer to the eigenspace question waits in your Eigenvalues and eigenvectors lesson, which continues tomorrow, Monday 9 November; your Mechanics of matrix multiplication review comes back on Wednesday 11 November."), []);
		assert.equal(good.beforeEnd(), undefined, "every receipt topic was named");
	});

	it("lens 1's 9 Nov review close: its days were \"on your calendar\", and Law of total probability had moved to 14 Nov", async () => {
		const saves: SessionSave[] = [
			{ topics: ["conditional"], receipt: receiptOf({ conditional: ["Conditional probability", "2026-11-11"] }) },
			{ topics: ["ltp"], receipt: receiptOf({ ltp: ["Law of total probability", "2026-11-14"] }) },
		];
		const receipt = receiptOfSaves(saves, D8);
		assert.equal(receipt.says, "Your Conditional probability review comes back on Wednesday 11 November; your Law of total probability review comes back on Saturday 14 November.");
		const broke = closeRules(await closing(receipt, { review: true }), "The reviews for Conditional probability and Law of total probability are on your calendar.");
		for (const rule of ["close-calendar", "close-day", "title-and"]) assert.ok(broke.includes(rule), `${rule}: ${broke.join()}`);
	});

	it("lens 1's 10 Nov review closed itself: Random variables and two moved starts left out, and the turn is held for them", async () => {
		const moved = {
			geometric: { title: "Geometric distribution", starts: "2026-11-12", moved: { from: "2026-11-11", by: "study", waits_on: ["Random variables and distributions"] } },
			negbin: { title: "Negative binomial distribution", starts: "2026-11-15", moved: { from: "2026-11-12", by: "study", waits_on: ["Geometric distribution"] } },
		};
		const saves: SessionSave[] = [
			{ topics: ["rv"], receipt: receiptOf({ rv: ["Random variables and distributions", "2026-11-15"] }, moved) },
			{ topics: ["conditional"], receipt: receiptOf({ conditional: ["Conditional probability", "2026-11-12"] }, moved) },
		];
		const receipt = receiptOfSaves(saves, D8);
		assert.deepEqual(receipt.topics.map((t) => t.title), ["Random variables and distributions", "Conditional probability"]);
		assert.deepEqual(receipt.moved.map((m) => [m.title, m.day_words]), [["Geometric distribution", "Thursday 12 November"], ["Negative binomial distribution", "Sunday 15 November"]]);
		assert.match(receipt.says, /Your Conditional probability review comes back on Thursday 12 November, and you now start Geometric distribution that day, since it waits on Random variables and distributions/);
		const guard = await closing(receipt, { review: true, done: false });
		assert.deepEqual(closeRules(guard, "Conditional probability comes back on Thursday 12 November, moved from Wednesday 11 November after your answers today."), []);
		const held = guard.beforeEnd() ?? "";
		for (const title of ["Random variables and distributions", "Geometric distribution", "Negative binomial distribution"]) assert.ok(held.includes(title), held);
		assert.ok(held.includes(receipt.says), "the note hands it the receipt's sentence");
		assert.deepEqual(rules(await closing(receipt, { review: true }), send(receipt.says)), [], "the receipt's sentence costs the close's budget nothing, however long");
	});

	it("lens 2's sheet close: the task's next day and Homomorphisms' day, never \"next time\" or \"on your calendar\"", async () => {
		const receipt = receiptOfMap(LA_8, ["homs"], [], ["sheet-4"]);
		assert.deepEqual(receipt.continues, { title: "Problem sheet 4", day: "2026-11-09", day_words: "tomorrow, Monday 9 November" });
		assert.equal(receipt.says, "Problem sheet 4 continues tomorrow, Monday 9 November; your Homomorphisms (linear maps) review comes back on Wednesday 11 November.");
		assert.ok(closeRules(await closing(receipt), "Part (e) of sheet 4 is waiting for you next time, and the other topics from today have their review days on your calendar.").includes("close-calendar"));
		assert.ok(rules(await closing(receipt), send("Part (e) of the sheet waits for you.")).includes("vague-day"), "the open work's day (round 21, M3)");
		const guard = await closing(receipt);
		assert.deepEqual(closeRules(guard, "Part (e) of the sheet waits for you tomorrow, Monday 9 November."), []);
		assert.match(guard.beforeEnd() ?? "", /Homomorphisms \(linear maps\) \(Wednesday 11 November\), Problem sheet 4 \(tomorrow, Monday 9 November\)/);
	});

	it("lens 3's Invertible close: Mechanics named with no day is refused", async () => {
		const receipt = receiptOfMap(LA_8, ["matmul-mech"], []);
		const broke = closeRules(await closing(receipt), "Your Mechanics of matrix multiplication review is on your calendar.");
		assert.ok(broke.includes("close-calendar") && broke.includes("close-day"), broke.join());
	});

	it("m8: two titles that hold \"and\" are joined by commas, and \"and\" between them is refused", async () => {
		const receipt = receiptOfMap(LA_8, ["rank", "kernel"], []);
		assert.equal(receipt.says, "Your Rank and the column space, Kernel and rank-nullity reviews come back tomorrow, Monday 9 November.");
		assert.ok(closeRules(await closing(receipt), "Your reviews of Rank and the column space and Kernel and rank-nullity come back tomorrow, Monday 9 November.").includes("title-and"));
		assert.deepEqual(closeRules(await closing(receipt), receipt.says), []);
	});

	it("a save made before receipts carried titles is never named by its handle (live check, 23 Nov: \"Your eigen review\")", () => {
		const untitled = { reviews: { eigen: { due: "2026-11-09", planned: "2026-11-09" } } };
		assert.deepEqual(receiptOfSaves([{ topics: ["eigen"], receipt: untitled }], D8).topics, []);
		const later = receiptOf({ eigen: ["Eigenvalues and eigenvectors", "2026-11-10"] });
		assert.deepEqual(receiptOfSaves([{ topics: [], receipt: later }, { topics: ["eigen"], receipt: untitled }], D8).topics.map((t) => [t.title, t.day]), [["Eigenvalues and eigenvectors", "2026-11-09"]]);
	});

	it("each save's result carries the sitting's close so far, earlier turns' saves included", async () => {
		const earlier = receiptOf({ rv: ["Random variables and distributions", "2026-11-15"] });
		const ctx: CourseToolContext = {
			course: { workspace: "/prob", title: "Probability" },
			records: { run: async () => ({ ok: true, json: receiptOf({ conditional: ["Conditional probability", "2026-11-12"] }) }) } as unknown as CourseToolContext["records"],
			arcs: false,
			sessionSaves: () => sessionSavesOf([savedResult(earlier)]),
		};
		const saved = await saveCourse(ctx, { topics: { conditional: { gap: "Divides by the event before the bar" } } });
		const close = (saved.ok ? (saved.json as { close: CloseReceipt }).close : null)!;
		assert.deepEqual(close.topics.map((t) => [t.handle, t.day]), [["rv", "2026-11-15"], ["conditional", "2026-11-12"]]);
	});

	it("a review's move to its next topic after a save is no close, so naming that topic and today is no untouched topic (review, round 20)", async () => {
		const opened: LhMessage[] = [brief("Opened on: Conditional probability, Law of total probability, as its review."), newUserMessage("…")];
		const guard = new VoiceGuard(opened, undefined, true, true, async () => TITLES);
		await Promise.resolve();
		const receipt = receiptOfSaves([{ topics: ["conditional"], receipt: receiptOf({ conditional: ["Conditional probability", "2026-11-11"] }) }], D8);
		const call: ToolCall = { type: "toolCall", id: `v-${nextId()}`, name: "course_save", arguments: { changes: {} } };
		guard.screen(call);
		const tool = { name: "course_save", label: "course_save", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: JSON.stringify({ revision: 4, reviews: {}, close: receipt }) }], details: null }) } as unknown as AgentTool<never>;
		await guard.wrap(tool).execute(call.id, call.arguments as never, undefined, undefined);
		assert.deepEqual(closeRules(guard, "Now your Law of total probability review, also due today."), []);
		assert.ok(closeRules(guard, "Your Conditional probability review comes back on Wednesday 11 November, and Independent events comes back tomorrow.").includes("close-untouched"), "a topic outside the review is still untouched");
	});

	it("a save during Done for today adds to its receipt and keeps the lesson that goes on (review, round 20)", async () => {
		const done = receiptOfMap(LA_8, ["eigen", "matmul-mech"], []);
		const saved = receiptOfSaves([{ topics: ["matmul-mech"], receipt: receiptOf({ "matmul-mech": ["Mechanics of matrix multiplication", "2026-11-12"] }) }], D8);
		const guard = new VoiceGuard([withCloseReceipt(newDoneTonightMessage("teacher"), done)], undefined, false, true, async () => TITLES);
		await Promise.resolve();
		const call: ToolCall = { type: "toolCall", id: `v-${nextId()}`, name: "course_save", arguments: { changes: {} } };
		guard.screen(call);
		const tool = { name: "course_save", label: "course_save", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: JSON.stringify({ revision: 4, reviews: {}, close: saved }) }], details: null }) } as unknown as AgentTool<never>;
		await guard.wrap(tool).execute(call.id, call.arguments as never, undefined, undefined);
		assert.deepEqual(closeRules(guard, "Your Eigenvalues and eigenvectors lesson continues tomorrow, Monday 9 November; your Mechanics of matrix multiplication review comes back on Thursday 12 November."), [], "the save's day wins, the lesson stays");
		assert.equal(guard.beforeEnd(), undefined, "every topic of the merged receipt was named");
	});

	it("his Done for today carries the receipt to every kind of agent, and each close copies it", () => {
		const receipt = receiptOfMap(LA_8, ["matmul-mech"], []);
		const marker = withCloseReceipt(newDoneTonightMessage("practice"), receipt) as { content: string; details: { close: unknown } };
		assert.match(marker.content, /The close receipt: \{/);
		assert.deepEqual(marker.details.close, receipt);
		for (const [agent, text] of Object.entries(DONE_TONIGHT_TEXT)) assert.match(text, /copy `close\.says` as written/, agent);
		assert.match(NEXT_PROBLEM_TEXT, /`close\.says` copied as written, and no other topic/);
	});
});

describe("m7: a lesson is named by its topic's title, never Home's row label (1 m4)", () => {
	const opened = (): LhMessage[] => [newUserMessage("Start Expectation and linearity"), brief("Opened on: expectation. He pressed the action on its page, and the app posted his first message.")];

	it("the lesson's name drops the row's verb", () => {
		const guard = new VoiceGuard(opened(), undefined, false, true);
		assert.equal((guard as unknown as { lesson: { title: string } }).lesson.title, "Expectation and linearity");
	});

	it("\"Now Start Expectation and linearity:\" is refused, in a question as in a message", () => {
		const question = "Now Start Expectation and linearity: a die is rolled and $X$ is the number shown. What is $E[X]$, and why?";
		assert.ok(rules(new VoiceGuard(opened(), undefined, false, true), recall(question)).includes("row-label"));
		assert.ok(rules(new VoiceGuard(opened(), undefined, false, true), send("Now Start Expectation and linearity: the mean of a random variable.")).includes("row-label"));
		assert.ok(!rules(new VoiceGuard(opened(), undefined, false, true), send("Start with the definition of the mean.")).includes("row-label"), "a sentence may open on the verb");
	});
});
