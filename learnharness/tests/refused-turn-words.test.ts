/**
 * A refused turn reads as a refusal (round 14, 4 minor 6). With the token
 * folder moved aside, Claude Code refused the Rank practice turn:
 * - the sidebar read "Reply cut off", the words for a restart;
 * - the box said "Ask anything, or press Enter for the next one." while
 *   the line said "Sign in, then press Retry.";
 * - once sign-in was restored, "Claude isn't signed in" stayed until Retry.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-refused-turn-"));
const originalEnv = process.env;
process.env = { ...originalEnv, NODE_ENV: "test", LH_DATA_DIR: path.join(scratch, "data"), HOME: path.join(scratch, "home") };
after(() => {
	process.env = originalEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { CLAUDE_ACCOUNT_SIGNED_OUT } = await import("../src/core/index.ts");
const { pausedWords, sessionState } = await import("../components/nav/session-state.ts");
const { practicePause, pausePlaceholder } = await import("../components/lesson/practice-pause.ts");
const { isSignedOutLine, refusalWatch } = await import("../components/lesson/turn-error-text.ts");

const refusal = `${CLAUDE_ACCOUNT_SIGNED_OUT} Sign in to it again in T3 Code, then press Retry.`;
const failed = { id: "f1", role: "assistant", content: [], stopReason: "error", errorMessage: refusal, api: "anthropic-messages", provider: "claude", model: "claude", usage: {}, timestamp: 3 };

describe("a refused turn (round 14, 4 minor 6)", () => {
	it("reads \"Couldn't reply\" where a session's state is worded, not \"Reply cut off\"", () => {
		const chat = chatStore.createChat("Rank practice");
		chatStore.saveMessages(chat.id, [newUserMessage("R3 - R1 - R2 = (0,0,0,0,0), so the rank is 2"), failed as never]);
		const item = { ...chatStore.listChats().find((c) => c.id === chat.id)!, busy: false };
		assert.equal(sessionState(item), "paused");
		assert.equal(pausedWords(item), "Couldn't reply");
		const cut = chatStore.createChat("Eigen lesson");
		chatStore.saveMessages(cut.id, [newUserMessage("B - 2I has rows (2,1) and (2,1)")]);
		assert.equal(pausedWords(chatStore.listChats().find((c) => c.id === cut.id)!), "Reply cut off", "a restart's cut keeps its words");
	});

	it("asks for Enter to try again, not for the next problem, between problems", () => {
		const between = { practice: true, closed: false, open: false, busy: false, posed: true };
		assert.equal(practicePause({ ...between, retry: false }), true, "the pause between problems");
		const next = practicePause({ ...between, retry: true });
		assert.equal(next, false, "a refused turn waits for Try again, not the next problem");
		assert.equal(pausePlaceholder(next, true), "Press Enter to try again, or write something new.");
	});

	it("clears the signed-out line on the first reading after it that says connected", () => {
		assert.equal(isSignedOutLine(refusal), true, "a turn Claude Code refused");
		let watch = refusalWatch(null, isSignedOutLine(refusal), false, 2);
		watch = refusalWatch(watch.since, isSignedOutLine(refusal), true, 3);
		assert.equal(watch.clear, true);
	});
});
