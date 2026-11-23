/**
 * Round 19, the close receipt's fields (P1; P3 words them).
 *
 * m15 (1 n2): the Eigen lesson's first close named Mechanics, answered in
 * that sitting. He came back the same day, finished the lesson and closed
 * again, and the second close named Mechanics once more, "comes back on a
 * later day on your calendar", in a sitting that never touched it. The
 * close's `days` held every topic the whole chat ever answered. They hold
 * the session's own topics and those answered since its last close.
 *
 * m4 (3 n5): Done for today with a half answer in the Invertible lesson's
 * box saved the task step "Answer the question still open above… You
 * stopped before writing anything." while his half answer sat above, under
 * "Left for next time". The close's receipt names the question his half
 * answer waits on (`half_answer_on`), and a save of a task step that says
 * he wrote nothing while a half answer is kept is refused.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planTools } from "../src/agent/tools/plan.ts";
import { saveCourse, type CourseToolContext } from "../src/agent/tools/course.ts";
import { halfAnswerLeft } from "../src/core/session-end.ts";
import { LESSON_PROGRESS_TOOL } from "../src/core/contracts/plan.ts";
import { newDoneTonightMessage, newUserMessage, type LhMessage } from "../src/core/native-messages.ts";

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse" = "toolUse") =>
	({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: Date.now() + n }) as unknown as LhMessage;
const result = (toolCallId: string, toolName: string, details: unknown) =>
	({ id: `r${++n}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: Date.now() + n }) as unknown as LhMessage;
const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });
const text = (t: string) => ({ type: "text", text: t });

const TODAY = "2026-11-08";
const topic = (handle: string, title: string, over: Record<string, unknown>) => ({ handle, title, level: "attempted", introduced: "2026-11-01", ...over });
const MAP = {
	today: TODAY,
	tasks: [],
	topics: [
		topic("eigen", "Eigenvalues and eigenvectors", { review: { kind: "scheduled", date: "2026-11-09" } }),
		topic("matmul", "Mechanics of matrix multiplication", { review: { kind: "scheduled", date: "2026-11-11" } }),
	],
};
const TREE = { nodes: [{ id: "eig", title: "Finding the eigenvalues" }, { id: "line", title: "The eigenline" }], edges: [], version: 1 };

/** The Eigen lesson's morning: the Mechanics review inside it, an Eigen
 *  answer, then Done for today with the eigenline question open. */
const QUESTION = "Which line does $C$ stretch by $6$?";
const morning = (draft: string): LhMessage[] => [
	newUserMessage("Continue Eigenvalues and eigenvectors"),
	assistant([call("s1", "course_save", { changes: { observations: [{ topics: ["matmul"], text: "Multiplied the columns", result: "correct", help: "none" }] } })]),
	result("s1", "course_save", { ok: true }),
	assistant([call("s2", "course_save", { changes: { observations: [{ topics: ["eigen"], text: "Found the eigenvalues of $C$", result: "correct", help: "none" }] } })]),
	result("s2", "course_save", { ok: true }),
	assistant([call("q1", "explain", { type: "check", nodeId: "line", question: QUESTION, correctAnswer: "The line through (2,1)." })]),
	result("q1", "explain", { kind: "explain", dismissed: true, reason: "tonight", ...(draft ? { draft: { text: draft } } : {}) }),
	newDoneTonightMessage("teacher"),
];

async function closeReceipt(messages: LhMessage[]): Promise<Record<string, unknown>> {
	const course = { course: { workspace: "/study/la", title: "Linear Algebra" }, records: { map: async () => ({ ok: true, map: MAP }), run: async () => ({ ok: true, json: {} }) } };
	const tool = planTools({ chatId: "c1", chatStore: { getChat: () => ({ tree: TREE, messages, topics: ["eigen"] }) } as never, course: course as never })[LESSON_PROGRESS_TOOL]!;
	const res = await tool.execute("p_close", { done: [], close: true });
	return JSON.parse((res.content[0] as { text: string }).text) as Record<string, unknown>;
}

/** The topics the close receipt names (round 20, M3: `close` replaced `days`). */
const handles = (body: Record<string, unknown>) => (body["close"] as { topics: { handle: string }[] }).topics.map((t) => t.handle);

describe("the close's days name only what this sitting touched (round 19, m15)", () => {
	it("the first close names Mechanics, answered in it", async () => {
		assert.deepEqual(handles(await closeReceipt(morning(""))).sort(), ["eigen", "matmul"]);
	});

	it("the same day's second close, after a resume that never touched Mechanics, names the lesson alone", async () => {
		const resumed: LhMessage[] = [
			...morning(""),
			assistant([text("Your half answer waits. Your Eigenvalues review is tomorrow."), call("p1", LESSON_PROGRESS_TOOL, { done: ["eig"], close: true })], "stop"),
			result("p1", LESSON_PROGRESS_TOOL, { ok: true }),
			assistant([call("q2", "explain", { type: "check", nodeId: "line", question: QUESTION, correctAnswer: "The line through (2,1)." })]),
			result("q2", "explain", { kind: "explain", text: "The line through (2,1)", confidence: "confident" }),
			assistant([call("s3", "course_save", { changes: { observations: [{ topics: ["eigen"], text: "Found the eigenline", result: "correct", help: "none" }] } })]),
			result("s3", "course_save", { ok: true }),
			newDoneTonightMessage("teacher"),
		];
		assert.deepEqual(handles(await closeReceipt(resumed)), ["eigen"]);
	});
});

describe("a half answer kept by Done for today (round 19, m4)", () => {
	it("the close's receipt names the question it waits on", async () => {
		assert.equal((await closeReceipt(morning("It's the line through")))["half_answer_on"], QUESTION);
		assert.equal((await closeReceipt(morning("")))["half_answer_on"], undefined, "an empty box keeps no half answer");
	});

	it("is the latest Done's alone: answered since, it is no longer left", () => {
		assert.equal(halfAnswerLeft(morning("It's the line through")), QUESTION);
		assert.equal(halfAnswerLeft([...morning("It's the line through"), newUserMessage("back again")]), null);
	});

	it("a task step saying he wrote nothing is refused while it is kept", async () => {
		const written: unknown[] = [];
		const ctx = (half: string | null): CourseToolContext => ({
			course: { workspace: "/la", title: "Linear Algebra" },
			records: { run: async (_w: string, verb: { changes?: unknown }) => (written.push(verb.changes), { ok: true, json: {} }) } as unknown as CourseToolContext["records"],
			arcs: false,
			halfAnswer: () => half,
		});
		const step = (s: string) => ({ tasks: { "invertibility-lesson": { title: "Invertible matrices lesson", topics: ["invertible"], step: s } } });
		const lens = "Answer the question still open above, on why a one-sided inverse of a square matrix is two-sided. You stopped before writing anything.";
		const refused = await saveCourse(ctx("Why is a one-sided inverse of a square matrix two-sided?"), step(lens));
		assert.equal(refused.ok, false);
		assert.match(refused.ok ? "" : refused.message, /half answer/);
		assert.deepEqual(written, []);
		assert.equal((await saveCourse(ctx("Why is a one-sided inverse of a square matrix two-sided?"), step("Finish your half answer on the two-sided inverse question."))).ok, true);
		assert.equal((await saveCourse(ctx(null), step(lens))).ok, true, "with no half answer kept, he did stop before writing");
	});
});
