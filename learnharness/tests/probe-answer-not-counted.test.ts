/**
 * A probe answer on a topic not yet taught never counts against it (round
 * 11, 3 N1): the Poisson probe asked for $\lim (1 - 3/n)^n$, his confident
 * "1" was saved on Poisson as Sure, but wrong, before Poisson was taught,
 * and moved it from new to attempted. Edo's rule: a prediction is kept but
 * never counts, never starts a topic and never writes a mistake. So an
 * answer to the probe's question (`recall`) is saved as a prediction on a
 * topic the record has never seen taught; on a topic it holds taught (a due
 * review, a need) it counts as ever.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { answeredQuestionsOf, type LhMessage } from "../src/core/native-messages.ts";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/index.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
} as const;

function asked(tool: "recall" | "explain", id: string, question: string): LhMessage[] {
	const args = tool === "recall" ? { question, correctAnswer: "x" } : { type: "check", nodeId: "n", question, correctAnswer: "x" };
	const assistant: LhMessage & AssistantMessage = { id: `a_${id}`, role: "assistant", content: [{ type: "toolCall", id, name: tool, arguments: args as never }], timestamp: 1, ...STAMPS };
	const result = { id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: tool, content: [{ type: "text", text: "ok" }], details: { kind: "explain", tool, questionText: question, answers: [], answeredAt: "", text: "1", confidence: "confident" }, isError: false, timestamp: 2 } as LhMessage & ToolResultMessage;
	return [assistant, result];
}

const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, introduced: string | null): CourseMapTopic => ({ handle: handle as TopicHandle, title: handle, level: introduced ? "assisted" : "new", introduced, review: null, weak: false, signals: QUIET, tasks: [] });
const MAP: CourseMap = { workspace: "/study/prob", title: "Probability", today: "2026-11-08", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [topic("poisson", null), topic("binomial", "2026-11-01")], edges: [] };

function saving(messages: LhMessage[]) {
	const saves: { observations: Record<string, unknown>[] }[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: MAP.workspace, title: MAP.title },
		records: {
			run: async (_w: string, verb: { verb: string; changes?: unknown }) => {
				if (verb.verb === "save") saves.push(verb.changes as never);
				return { ok: true, json: { saved: ["o18"], notes: [] } };
			},
			map: async () => ({ ok: true, map: MAP }),
		} as unknown as CourseToolContext["records"],
		arcs: false,
		answers: answeredQuestionsOf(messages),
	};
	return { saves, save: (observations: unknown[], extra: Record<string, unknown> = {}) => courseTools(ctx).course_save!.execute("t1", { changes: { observations, ...extra } } as never) };
}

const attempt = (question: string, topics: string[]) => ({ question, kind: "attempt", topics, text: "Took the base's limit for the whole limit", response: "1", help: "none", result: "incorrect" });

describe("a probe answer on a topic not yet taught", () => {
	it("is saved as a prediction, never as a wrong answer on that topic", async () => {
		const { saves, save } = saving(asked("recall", "p1", "What is $\\lim (1 - 3/n)^n$?"));
		await save([attempt("p1", ["poisson"])]);
		assert.equal(saves[0]!.observations[0]!.predicted, true);
	});

	it("counts on the topics the record holds taught, and leaves the untaught one out", async () => {
		const { saves, save } = saving(asked("recall", "p2", "Is the count binomial?"));
		await save([attempt("p2", ["binomial", "poisson"])]);
		assert.equal(saves[0]!.observations[0]!.predicted, undefined);
		assert.deepEqual(saves[0]!.observations[0]!.topics, ["binomial"]);
	});

	it("counts when the same save marks the topic taught, and a teacher's check always counts", async () => {
		const probe = saving(asked("recall", "p3", "Why?"));
		await probe.save([attempt("p3", ["poisson"])], { topics: { poisson: { introduced: true } } });
		assert.equal(probe.saves[0]!.observations[0]!.predicted, undefined);
		const check = saving(asked("explain", "c1", "Why?"));
		await check.save([attempt("c1", ["poisson"])]);
		assert.equal(check.saves[0]!.observations[0]!.predicted, undefined);
	});
});
