/**
 * Round 18, M2 (1 N2, 2 D1): the 8 Nov Probability review (Binomial,
 * Inclusion-exclusion, Random variables) answered Binomial and RV, then
 * its plan re-taught Inclusion-exclusion, and he closed with the four-set
 * question open. Random variables' and Binomial's pages drew the
 * re-teach's step map as their own ("Stopped here yesterday: The pattern
 * for n sets"), and the course page's arc rows read "Left off 8 Nov" for
 * both. The map and what the review left are Inclusion-exclusion's alone.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-review-map-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LEARNING_TODAY = "2026-11-08";
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage, newDoneTonightMessage } = await import("../src/core/native-messages.ts");
const { topicAction, topicFacts } = await import("../components/unit-inbox/topic-page/topic-facts.ts");
const { mapLessonAtFirst } = await import("../components/unit-inbox/topic-page/hybrid/hybrid-facts.ts");
const { sidebarSays } = await import("../components/unit-inbox/sidebar-says.ts");
const { topic } = await import("./fixtures/round8-home.ts");
after(() => {
	delete process.env.LEARNING_TODAY;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const call = (name: string, args: unknown, result: string | null = "{}") => {
	const id = `c${++n}`;
	const ask = { id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: Date.parse("2026-11-08T10:00:00Z") + n };
	return result === null ? [ask] : [ask, { id: `r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: result }], details: {}, isError: false, timestamp: ask.timestamp }];
};
const answer = (t: string, text: string) => call("course_save", { changes: { observations: [{ topics: [t], text, result: "correct", help: "none" }] } });
const PROB = { workspace: "/s/prob", title: "Probability" };
const TOPICS = ["binomial", "inclusion-exclusion", "random-variables"];
const TREE = { nodes: [{ id: "triple-term", title: "What a three-set union does with the triple overlap" }, { id: "n-sets", title: "The pattern for n sets" }], edges: [{ from: "triple-term", to: "n-sets" }], version: 1 as const };

/** The review as lens 1 closed it: Binomial and RV answered, then the re-teach of IE, with its four-set question open. */
function closedReview(goalTopic: string) {
	const created = chatStore.createChat("Review Binomial distribution, Inclusion-exclusion principle, Random variables and distributions", PROB, TOPICS);
	chatStore.saveMessages(created.id, [
		newUserMessage("Review Binomial distribution, Inclusion-exclusion principle, Random variables and distributions"),
		...answer("binomial", "Found P(at least 7 of 8)"),
		...answer("random-variables", "Found P(X = k) for the larger of two dice"),
		...call("plan_init", { mermaid: "graph TD\n  triple-term[What a three-set union does with the triple overlap] --> n-sets[The pattern for n sets]", goal: { title: "Inclusion-exclusion review", topic: goalTopic } }),
		...answer("inclusion-exclusion", "Added back the triple overlap"),
		...call("explain", { type: "check", nodeId: "n-sets", question: "How many terms for four sets?" }, JSON.stringify({ kind: "explain", dismissed: true, reason: "tonight" })),
		newDoneTonightMessage("teacher"),
		...call("lesson_progress", { done: [], close: true }),
		...call("send_to_user", { message: "Your review stopped at the four-set question, and Inclusion-exclusion comes back tomorrow." }),
		{ id: "close", role: "assistant", content: [], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "stop", timestamp: Date.parse("2026-11-08T10:30:00Z") },
	] as never);
	chatStore.saveTree(created.id, TREE);
	return { ...chatStore.listChats().find((c) => c.id === created.id)!, busy: false };
}

const scheduled = (date: string) => ({ kind: "scheduled" as const, date });
const course = {
	map: {
		workspace: PROB.workspace,
		title: PROB.title,
		today: "2026-11-08",
		revision: 1,
		exam: null,
		current: "random-variables",
		focus: null,
		tasks: [],
		topics: [
			topic("binomial", "Binomial distribution", { level: "retained", review: scheduled("2026-11-15") }),
			topic("inclusion-exclusion", "Inclusion-exclusion principle", { level: "assisted", review: scheduled("2026-11-09") }),
			topic("random-variables", "Random variables and distributions", { level: "retained", review: scheduled("2026-11-17") }),
		],
		edges: [],
	},
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
} as never;
const topicOf = (handle: string) => (course as { map: { topics: { handle: string }[] } }).map.topics.find((t) => t.handle === handle)! as never;
const plan = (id: string) => ({ id, tree: { nodes: TREE.nodes, edges: TREE.edges }, current: "n-sets", visited: ["triple-term"] });

describe("a review's re-teach map and what it left are its re-taught topic's alone (round 18, M2)", () => {
	const review = closedReview("inclusion-exclusion");

	it("the session list names the topic its plan re-teaches", () => {
		assert.equal(review.stepsOn, "inclusion-exclusion");
		assert.deepEqual(review.ownTopics, TOPICS, "it is still the review of all three");
		assert.equal(review.review, true);
	});

	it("Random variables' and Binomial's pages show no step map and resume nothing; Inclusion-exclusion's shows the map", () => {
		const facts = (handle: string) => topicFacts({ course, topic: topicOf(handle), chats: [review], read: { record: null, plans: [plan(review.id)] } });
		for (const other of ["random-variables", "binomial"]) {
			const f = facts(other);
			assert.equal(mapLessonAtFirst(f.sessions, f.action), null, `${other}'s page draws no map of the re-teach`);
			assert.ok(!("chat" in topicAction(topicOf(other), (course as { map: never }).map, [review])), `${other}'s Now resumes nothing`);
		}
		const ie = facts("inclusion-exclusion");
		assert.equal(mapLessonAtFirst(ie.sessions, ie.action), review.id);
	});

	it("the arc rows of Random variables and Binomial read their return days; Inclusion-exclusion reads Left off today", () => {
		const said = sidebarSays([course], [review], PROB.workspace);
		const words = (handle: string) => (said.get(handle as never)?.fact as { words?: string } | null | undefined)?.words;
		assert.doesNotMatch(words("random-variables") ?? "", /Left off/);
		assert.doesNotMatch(words("binomial") ?? "", /Left off/);
		assert.match(words("inclusion-exclusion") ?? "", /Left off today/);
	});

	it("a review whose plan names a topic not its own is no re-teach of one of them", () => {
		const other = closedReview("expectation");
		assert.notEqual(other.stepsOn, "inclusion-exclusion");
		assert.ok(!(other.ownTopics ?? []).includes("inclusion-exclusion") || other.stepsOn === undefined, "it is the lesson it took up, or no one topic's");
	});
});
