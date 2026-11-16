/**
 * Round 14, M3 (known; 1, 3 N5, 4 minor 9): correct, worked-out answers
 * were saved `predicted: true`, "Prediction, not counted": the Poisson
 * probes Σλᵏ/k!, (1−λ/n)ⁿ and the bookshop, p = 3/n, the help desk and a
 * hinted answer. The 10 Nov save then could not mark Poisson introduced,
 * since a topic whose only answers are predictions is not taught. Two
 * causes: every probe answer on a topic not yet taught was turned into a
 * prediction whatever it asked (round 11's rule), and lesson questions he
 * could work out were typed `predict`. Edo's rule: a prediction is kept
 * but never counts, never starts a topic and never writes a mistake; the
 * question's type decides it, and a question he can work out is a check.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import { answeredQuestionsOf, newUserMessage, SEND_TO_USER_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
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

describe("a worked-out answer counts (round 14, M3)", () => {
	it("a probe answer on a topic not yet taught is saved counted, as the tutor sent it", async () => {
		const { saves, save } = saving(asked("recall", "p1", "What number does $(1 - 2/n)^n$ approach, and why?"));
		await save([attempt("p1", ["poisson"])]);
		assert.equal("predicted" in saves[0]!.observations[0]!, false);
		assert.deepEqual(saves[0]!.observations[0]!.topics, ["poisson"]);
	});

	it("keeps every topic it was asked on, a taught one beside an untaught one", async () => {
		const { saves, save } = saving(asked("recall", "p2", "Is the count binomial?"));
		await save([attempt("p2", ["binomial", "poisson"])]);
		assert.equal("predicted" in saves[0]!.observations[0]!, false);
		assert.deepEqual(saves[0]!.observations[0]!.topics, ["binomial", "poisson"]);
	});

	it("a probe answer the tutor calls a prediction is saved counted all the same, since a probe asks what he can work out", async () => {
		const { saves, save } = saving(asked("recall", "p3", "Why?"));
		await save([{ ...attempt("p3", ["poisson"]), predicted: true }]);
		assert.equal("predicted" in saves[0]!.observations[0]!, false);
	});

	it("a genuine prediction stays a prediction", async () => {
		const messages = asked("explain", "g1", "What do you expect $P(X = 0)$ to be?");
		const call = messages[0] as AssistantMessage;
		(call.content[0] as { arguments: Record<string, unknown> }).arguments.type = "predict";
		const { saves, save } = saving(messages);
		await save([attempt("g1", ["poisson"])]);
		assert.equal(saves[0]!.observations[0]!.predicted, true);
	});

	it("the record prompt says a probe answer counts, never that it is kept as a prediction", () => {
		for (const agent of ["prober", "teacher"] as const) {
			const prompt = courseRecordPrompt(agent, { arcs: false });
			assert.doesNotMatch(prompt, /never been taught is saved as a prediction/, agent);
			assert.match(prompt, /probe question \(`recall`\) counts like any check/, agent);
		}
	});
});

describe("a lesson question typed a prediction asks for his guess (round 14, M3)", () => {
	let n = 0;
	const explain = (question: string, type: "check" | "predict"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: "explain", arguments: { question, type, nodeId: "rate-fix", correctAnswer: "x" } });
	const send = (message: string): ToolCall => ({ type: "toolCall", id: `s-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
	const withheld = (guard: VoiceGuard, call: ToolCall): string | null => {
		guard.screen(call);
		const refused = (guard as unknown as { decisions: Map<string, { details: { withheld: string; rules?: string[] } } | null> }).decisions.get(call.id);
		return refused ? (refused.details.rules?.join(",") ?? refused.details.withheld) : null;
	};
	const lesson = () => new VoiceGuard([newUserMessage("Poisson distribution")]);

	it("the recorded questions, typed predict with nothing asking for a guess, are refused", () => {
		for (const q of ["For the hour to average $3$ calls whatever $n$ we pick, what should the chance per slot $p$ be, and why?", "If you tried to build a map that undoes $C$, what would go wrong?"]) {
			assert.equal(withheld(lesson(), explain(q, "predict")), "predict", q);
		}
	});

	it("posed as a check, or worded as a guess, it goes through", () => {
		assert.equal(withheld(lesson(), explain("For the hour to average $3$ calls whatever $n$ we pick, what should the chance per slot $p$ be, and why?", "check")), null);
		assert.equal(withheld(lesson(), explain("Before computing anything: which two directions do you expect to stay on their own line, and why?", "predict")), null);
		assert.equal(withheld(lesson(), explain("What is your guess for the chance that no call arrives?", "predict")), null);
	});

	it("a guess invited in the turn's message is asked for", () => {
		const guard = lesson();
		assert.equal(withheld(guard, send("Take a guess before we work it out.")), null);
		assert.equal(withheld(guard, explain("What would go wrong if you tried to undo $C$?", "predict")), null);
	});

	it("the refusal tells the tutor to pose it as a check", () => {
		const guard = lesson();
		const call = explain("If you tried to build a map that undoes $C$, what would go wrong?", "predict");
		guard.screen(call);
		const refused = (guard as unknown as { decisions: Map<string, { content: { text: string }[] } | null> }).decisions.get(call.id);
		assert.match(refused!.content[0]!.text, /type: check/);
	});
});
