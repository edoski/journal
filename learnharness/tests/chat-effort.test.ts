/**
 * The lesson's own turns run at one setting, CHAT_EFFORT, so Edo's call
 * on medium against high (the round-10 effort test, 16 Nov 2026) is one
 * line. The turn the probe's end wakes writes the lesson's plan and keeps
 * CLAUDE_MODEL's effort whatever that line says.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-chat-effort-"));
const originalEnv = process.env;
process.env = { ...originalEnv, NODE_ENV: "test", LH_DATA_DIR: path.join(scratch, "data"), HOME: path.join(scratch, "home") };
after(() => {
	process.env = originalEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { turnEffort } = await import("../src/agent/teacher-agent.ts");
const { CHAT_EFFORT, CLAUDE_MODEL } = await import("../src/core/contracts/claude.ts");
const { buildProbeHandoffSteer } = await import("../src/core/contracts/jobs.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
type LhMessage = import("../src/core/native-messages.ts").LhMessage;

describe("one setting sets the lesson's effort", () => {
	it("a lesson turn runs at CHAT_EFFORT, and the plan's turn at CLAUDE_MODEL's", () => {
		assert.equal(CHAT_EFFORT, "high", "high until Edo decides");
		assert.equal(turnEffort([newUserMessage("Poisson distribution")]), CHAT_EFFORT);
		assert.equal(turnEffort([newUserMessage("Poisson distribution"), buildProbeHandoffSteer("chat") as LhMessage]), CLAUDE_MODEL.thinkingLevel);
	});
});
