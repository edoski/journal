/**
 * A question is the turn's last word (round 13, 1 n8): the Ask answer to
 * his exam-plan question ended "Want to start with your Independent events
 * review now?" and then said "The Independent events review is ready
 * whenever you want to start." The words are the lens's, word for word.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import type { ToolCall } from "@earendil-works/pi-ai";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-last-word-"));
const originalEnv = process.env;
process.env = { ...originalEnv, NODE_ENV: "test", LH_DATA_DIR: path.join(scratch, "data"), HOME: path.join(scratch, "home") };
after(() => {
	process.env = originalEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { VoiceGuard } = await import("../src/agent/voice-guard.ts");
const { SEND_TO_USER_TOOL, newUserMessage } = await import("../src/core/native-messages.ts");

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });

const rules = (guard: InstanceType<typeof VoiceGuard>, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};

describe("a question is the turn's last word (round 13, 1 n8)", () => {
	const plan = () => [newUserMessage("My exam plan has no room for Geometric distribution, Variance, Conditional probability, Law of total probability and Bayes' rule. How can I still fit them in before the exam?")];
	it("refuses a message after one that ended on a question, as the lens recorded it", () => {
		const guard = new VoiceGuard(plan());
		assert.deepEqual(rules(guard, send("You fit them in by doing more than the plan holds today and tomorrow, since anything beyond it still counts. Want to start with your Independent events review now?")), []);
		assert.deepEqual(rules(guard, send("The Independent events review is ready whenever you want to start.")), ["after-asking"]);
	});

	it("lets a second message through after one that ended on a statement", () => {
		const guard = new VoiceGuard(plan());
		assert.deepEqual(rules(guard, send("You fit them in by doing more than the plan holds today and tomorrow, since anything beyond it still counts.")), []);
		assert.deepEqual(rules(guard, send("Law of total probability comes first, then Conditional probability.")), []);
	});
});

/**
 * A message of his read mid-reply is answered in the turn it joins (round
 * 14, 4 major 1): "also, does the ratio test need the terms to be
 * positive?", sent 1.3 s into a grading turn. The grade ended on its nudge
 * question, and the tutor's answer after it was refused as "a question is
 * the turn's last word", so his question sat unanswered. The words are the
 * lens's session log.
 */
describe("a message he sent mid-reply is answered after the question (round 14, 4 major 1)", () => {
	const graded = () => [newUserMessage("(n/(n+1))^n → e, so the ratio → 2e > 1, diverges")];
	const grade = "The break is the limit you took: $(n/(n+1))^n$ tends to $1/e$, not $e$. Can its nth power tend to $e$?";
	const answer = "No, provided you use absolute values: the ratio test reads $|a_{n+1}/a_n|$, so the signs of the terms never matter.";

	it("lets one message answer it after the grade's question", () => {
		const guard = new VoiceGuard(graded());
		assert.deepEqual(rules(guard, send(grade)), []);
		guard.heard();
		assert.deepEqual(rules(guard, send(answer)), [], "the answer to his question is shown");
		assert.deepEqual(rules(guard, send("Take your time with the limit.")), ["after-asking"], "one answer per message of his, and the question stays the last ask");
	});

	it("still refuses a second question after it", () => {
		const guard = new VoiceGuard(graded());
		assert.deepEqual(rules(guard, send(grade)), []);
		guard.heard();
		assert.deepEqual(rules(guard, send("No. Does the ratio test care about signs?")), ["after-asking"]);
	});

	it("is spent by the answer he got before the question", () => {
		const guard = new VoiceGuard(graded());
		guard.heard();
		assert.deepEqual(rules(guard, send(answer)), []);
		assert.deepEqual(rules(guard, send(grade)), []);
		assert.deepEqual(rules(guard, send("The Series and convergence tests review is ready whenever you want to start.")), ["after-asking"]);
	});

	it("in a running lesson turn, the steer Claude Code reads lets its answer through", async () => {
		const { signInTestClaude } = await import("./claude-fixture.ts");
		await signInTestClaude();
		const { createFauxCore, fauxAssistantMessage } = await import("@earendil-works/pi-ai");
		const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
		const { fakeSdk, onFake, sendToUser } = await import("./helpers/fake-sdk.ts");
		const steer = newUserMessage("also, does the ratio test need the terms to be positive?");
		let agent!: ReturnType<typeof createTeacherAgent>;
		const faux = createFauxCore({});
		faux.setResponses([
			() => {
				agent.steer(steer);
				return sendToUser(grade, "grade");
			},
			() => sendToUser(answer, "side"),
			() => fauxAssistantMessage(""),
		]);
		const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
		agent = createTeacherAgent(undefined, onFake(engine, { messages: graded() }, fakeSdk(engine).engine));
		await agent.continue();
		const side = agent.state.messages.find((m) => m.role === "toolResult" && m.toolCallId === "side") as { isError: boolean; content: Array<{ text?: string }> } | undefined;
		assert.ok(side, "the side answer ran");
		assert.equal(side.isError, false, `his answer is shown, not refused: ${side.content.map((c) => c.text).join(" ")}`);
	});
});
