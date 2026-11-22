/**
 * Round 19, M4 (1 N2, 2 N2).
 *
 * M4: a session's step map, its marks and You are here landed on every
 * topic it holds, not on the topic its step or open question is on.
 * (a) Continue Problem sheet 4, its turn ending on part (c), dim ker A:
 *     Basis, Rank and Kernel all read "Your turn", and You are here moved
 *     from Eigen to Basis (the task holds rank, basis and kernel).
 * (b) The 9 Nov Probability review closed with the Pólya urn question, a
 *     Law of total probability question, open: Random variables read
 *     "Left off 9 Nov".
 * (c) The seed's 5 Nov lesson opened on Random variables and Binomial,
 *     whose four steps are all on Random variables: both pages drew its
 *     map, with "Stopped here on 5 Nov" and "Next" beside "Nothing due
 *     today".
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-open-topic-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LEARNING_TODAY = "2026-11-08";
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage, newDoneTonightMessage } = await import("../src/core/native-messages.ts");
const { sessionState } = await import("../components/nav/session-state.ts");
const { topicFacts } = await import("../components/unit-inbox/topic-page/topic-facts.ts");
const { mapLessonAtFirst, mapLeftOff, hybridMarks } = await import("../components/unit-inbox/topic-page/hybrid/hybrid-facts.ts");
const { sidebarSays } = await import("../components/unit-inbox/sidebar-says.ts");
const { withLessonHere } = await import("../components/study-home/study-facts.ts");
const { lessonTopics } = await import("../src/core/course-map-build.ts");
const { topic } = await import("./fixtures/round8-home.ts");
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
	return result === null ? [ask] : [ask, { id: `r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], details: result, isError: false, timestamp: ask.timestamp }];
};
const answered = (questionText: string, text: string) => ({ kind: "explain", questionText, answers: [{ text }], answeredAt: "2026-11-08T10:00:00Z" });
const listed = (id: string) => ({ ...chatStore.listChats().find((c) => c.id === id)!, busy: false });

const LA = { workspace: "/s/la", title: "Linear Algebra" };
const PROB = { workspace: "/s/prob", title: "Probability" };
const SHEET_TREE = {
	nodes: [
		{ id: "kernel-picture", title: "What kernel and rank-nullity means" },
		{ id: "kernel-example", title: "A worked example" },
	],
	edges: [{ from: "kernel-picture", to: "kernel-example" }],
	version: 1 as const,
};
const RV_TREE = {
	nodes: [
		{ id: "random-variables-picture", title: "What random variables and distributions means" },
		{ id: "random-variables-rule", title: "The rule and why it holds" },
		{ id: "random-variables-example", title: "A worked example" },
		{ id: "random-variables-own", title: "One on your own" },
	],
	edges: [
		{ from: "random-variables-picture", to: "random-variables-rule" },
		{ from: "random-variables-rule", to: "random-variables-example" },
		{ from: "random-variables-example", to: "random-variables-own" },
	],
	version: 1 as const,
};

const courseOf = (link: { workspace: string; title: string }, current: string, topics: ReturnType<typeof topic>[], tasks: unknown[] = []) =>
	({ map: { workspace: link.workspace, title: link.title, today: "2026-11-08", revision: 1, exam: null, current, focus: null, tasks, topics, edges: [] }, unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 }) as never;
const wordsOf = (said: ReturnType<typeof sidebarSays>, handle: string) => {
	const fact = said.get(handle as never)?.fact as { kind?: string; words?: string } | null | undefined;
	return fact?.words ?? fact?.kind ?? "";
};

/** Problem sheet 4's session as the seed holds it, continued to part (c), its question open. */
function sheetWithOpenPart(topicTag?: string) {
	const created = chatStore.createChat("Problem sheet 4", LA, ["kernel"]);
	chatStore.saveMessages(created.id, [
		newUserMessage("Help me start problem sheet 4."),
		...call("plan_init", { mermaid: "graph TD\n  kernel-picture[What kernel and rank-nullity means] --> kernel-example[A worked example]" }),
		...call("course_save", { changes: { observations: [{ topics: ["rank"], text: "Reduced A to echelon form", result: "correct", help: "none" }], tasks: { "sheet-4": { title: "Problem sheet 4: rank and nullity", topics: ["rank", "basis", "kernel"], step: "Part (c)" } } } }),
		...call("explain", { type: "check", nodeId: "kernel-example", question: "Part (c): show $\\dim \\ker A = 2$.", correctAnswer: "5 - 3 = 2.", ...(topicTag ? { topic: topicTag } : {}) }, null),
	] as never);
	chatStore.saveTree(created.id, SHEET_TREE);
	return listed(created.id);
}

const LA_TOPICS = [topic("rank", "Rank and the column space"), topic("basis", "Basis and representation of a vector"), topic("kernel", "Kernel and rank-nullity"), topic("eigen", "Eigenvalues and eigenvectors")];

describe("a sheet's open question marks its own topic alone, and places no You are here (round 19, M4 a)", () => {
	for (const tag of [undefined, "kernel"]) {
		it(`part (c)${tag ? `, tagged ${tag}` : ", untagged"}: only Kernel reads Your turn`, () => {
			const sheet = sheetWithOpenPart(tag);
			assert.deepEqual([...(sheet.ownTopics ?? [])].sort(), ["basis", "kernel", "rank"], "it belongs to the task's topics");
			assert.equal(sessionState(sheet), "your-turn");
			const said = sidebarSays([courseOf(LA, "eigen", LA_TOPICS)], [sheet], LA.workspace);
			assert.equal(wordsOf(said, "kernel"), "Your turn");
			for (const other of ["rank", "basis"]) assert.notEqual(wordsOf(said, other), "Your turn", `${other} reads "${wordsOf(said, other)}"`);
		});
	}

	it("a question the tutor tagged on Basis marks Basis alone", () => {
		const sheet = sheetWithOpenPart("basis");
		const said = sidebarSays([courseOf(LA, "eigen", LA_TOPICS)], [sheet], LA.workspace);
		assert.equal(wordsOf(said, "basis"), "Your turn");
		for (const other of ["rank", "kernel"]) assert.notEqual(wordsOf(said, other), "Your turn");
	});

	it("You are here stays on Eigen: a sheet is his work, not a lesson", () => {
		const sheet = sheetWithOpenPart("kernel");
		const [course] = withLessonHere([courseOf(LA, "eigen", LA_TOPICS)], [sheet]);
		assert.equal((course as { map: { current: string } }).map.current, "eigen");
		assert.deepEqual(lessonTopics([sheet], LA.workspace), []);
	});
});

describe("a review's open question marks its own topic alone (round 19, M4 b)", () => {
	it("the urn question on Law of total probability, left with Done for today: only it reads Left off", () => {
		const created = chatStore.createChat("Review Random variables and distributions, Binomial distribution, Law of total probability", PROB, ["random-variables", "binomial", "total-probability"]);
		const urn = call("recall", { question: "Pólya's urn: what is P(second ball red)?", correctAnswer: "By total probability over the first ball: 1/2.", topic: "total-probability" }, { kind: "explain", dismissed: true, reason: "tonight" });
		chatStore.saveMessages(created.id, [
			newUserMessage("Review Random variables and distributions, Binomial distribution, Law of total probability"),
			...call("course_save", { changes: { observations: [{ topics: ["total-probability"], text: "Split over the six values of the die", result: "correct", help: "A hint" }] } }),
			...urn,
			newDoneTonightMessage("teacher"),
			...call("send_to_user", { message: "Your Random variables and Binomial reviews are still due today." }),
			assistant([], "stop"),
		] as never);
		const review = listed(created.id);
		assert.equal(sessionState(review), "left");
		const topics = [topic("random-variables", "Random variables and distributions"), topic("binomial", "Binomial distribution"), topic("total-probability", "Law of total probability")];
		const said = sidebarSays([courseOf(PROB, "random-variables", topics)], [review], PROB.workspace);
		assert.match(wordsOf(said, "total-probability"), /Left off today/);
		for (const other of ["random-variables", "binomial"]) assert.doesNotMatch(wordsOf(said, other), /Left off/, `${other} reads "${wordsOf(said, other)}"`);
	});
});

describe("a lesson's map is drawn on the topic its steps are on, and names no stop beside nothing to resume (round 19, M4 c)", () => {
	const created = chatStore.createChat("Random variables and the binomial", PROB, ["random-variables", "binomial"]);
	chatStore.saveMessages(created.id, [
		newUserMessage("Next topic: random variables and distributions."),
		...call("plan_init", { mermaid: "graph TD\n  random-variables-picture[What random variables and distributions means] --> random-variables-rule[The rule and why it holds]" }),
		...call("explain", { type: "check", nodeId: "random-variables-example", question: "Write the distribution of the number of heads in three tosses.", correctAnswer: "1/8, 3/8, 3/8, 1/8." }, answered("Write the distribution of the number of heads in three tosses.", "1/8 3/8 3/8 1/8")),
		...call("course_save", { changes: { observations: [{ topics: ["binomial"], text: "Wrote the distribution of the number of heads in three tosses", result: "correct", help: "none" }] } }),
		assistant([{ type: "text", text: "Good place to stop. Practice comes next, in a day or two." }], "stop"),
	] as never);
	chatStore.saveTree(created.id, RV_TREE);
	const lesson = listed(created.id);
	const topics = [topic("random-variables", "Random variables and distributions", { level: "retained" }), topic("binomial", "Binomial distribution", { level: "retained" })];
	const course = courseOf(PROB, "random-variables", topics);
	const plan = { id: lesson.id, tree: { nodes: RV_TREE.nodes, edges: RV_TREE.edges }, current: "random-variables-example", visited: ["random-variables-picture", "random-variables-rule"] };
	const facts = (handle: string) => topicFacts({ course, topic: topics.find((t) => t.handle === handle)! as never, chats: [lesson], read: { record: null, plans: [plan] } });

	it("its steps are on Random variables", () => {
		assert.equal(lesson.stepsOn, "random-variables");
	});

	it("Binomial's page draws no map of it", () => {
		const f = facts("binomial");
		assert.equal(mapLessonAtFirst(f.sessions, f.action), null);
	});

	it("Random variables' page draws it, with no Stopped here and no Next, since nothing resumes it", () => {
		const f = facts("random-variables");
		assert.equal(mapLessonAtFirst(f.sessions, f.action), lesson.id);
		const shown = f.sessions.find((entry) => entry.chat.id === lesson.id)!;
		const leftOff = mapLeftOff(shown, f.action);
		assert.equal(leftOff, null);
		const tags = [...hybridMarks(plan as never, false, leftOff).values()].map((mark) => mark.tag).filter(Boolean);
		assert.deepEqual(tags, []);
	});
});
