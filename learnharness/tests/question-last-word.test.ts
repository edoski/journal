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
