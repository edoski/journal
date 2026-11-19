/**
 * Round 17, m10 (1 m10; Edo, 18 Nov 2026: "yes ok to close"): an open
 * review question was left behind for good. On 10 Nov Home's review row
 * reopened the 8 Nov session and he answered Inclusion-exclusion there,
 * while the 9 Nov review's "1 to 105" question on it stayed "Left off
 * 9 Nov" in Sessions. When a newer review of a topic is done, an older
 * session's open review question on that topic closes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-newer-review-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
const { chatStore } = await import("../src/store/chats.ts");
const { sessionState } = await import("../components/nav/session-state.ts");
const { openSessions } = await import("../components/study-home/study-facts.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const PROB = { workspace: "/s/prob", title: "Probability" };
const LA = { workspace: "/s/la", title: "Linear Algebra" };
let n = 0;
const said = (text: string, at: number) => ({ id: `u${++n}`, role: "user", content: [{ type: "text", text }], timestamp: at });
const asked = (question: string, at: number) => ({
	id: `a${++n}`,
	role: "assistant",
	content: [{ type: "toolCall", id: `q${n}`, name: "explain", arguments: { type: "check", nodeId: "count", question, correctAnswer: "57" } }],
	api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: at,
});
const saved = (topic: string, at: number) => {
	const id = `s${++n}`;
	return [
		{ id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name: "course_save", arguments: { changes: { observations: [{ topics: [topic], text: "Counted the union", result: "correct", help: "none" }] } } }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: at },
		{ id: `r${n}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: "{}" }], details: {}, isError: false, timestamp: at },
	];
};

/** The 9 Nov review, left on "1 to 105" at `at`. */
function leftReview(course = PROB, at = 9_000) {
	const chat = chatStore.createChat("Review Combinations, Inclusion-exclusion principle", course, ["combinations", "incl-excl"]);
	chatStore.saveMessages(chat.id, [said("Review Combinations, Inclusion-exclusion principle", at - 2), ...saved("combinations", at - 1), asked("How many of 1 to 105 are divisible by 3, 5 or 7?", at)] as never);
	return chat.id;
}

/** Another session that answered `topic` at `at`. */
function answered(topic: string, at: number, course = PROB) {
	const chat = chatStore.createChat("Review Inclusion-exclusion principle, Binomial distribution", course, ["incl-excl", "binomial"]);
	chatStore.saveMessages(chat.id, [said("Review Inclusion-exclusion principle, Binomial distribution", at - 1), ...saved(topic, at)] as never);
	return chat.id;
}

const item = (id: string) => ({ ...chatStore.listChats().find((c) => c.id === id)!, busy: false });

describe("a newer review of a topic closes an older session's open question on it (round 17, m10)", () => {
	it("closes the older review once another session saved an answer on its topic after it", () => {
		const old = leftReview();
		assert.equal(sessionState(item(old)), "your-turn", "before: the 1 to 105 question waits on him");
		answered("incl-excl", 10_000);
		assert.equal(sessionState(item(old)), "finished", "the newer review of Inclusion-exclusion closed it");
		const open = openSessions(chatStore.listChats().map((c) => ({ ...c, busy: false })));
		assert.ok(!open.some((c) => c.id === old), "Home and the sidebar keep no row for it");
	});

	it("keeps it open when the other answer came before his last word in it, was on another topic, or in another course", () => {
		const before = leftReview(PROB, 20_000);
		answered("incl-excl", 19_000);
		assert.equal(sessionState(item(before)), "your-turn", "an earlier answer is not a newer review");
		const other = leftReview(PROB, 30_000);
		answered("binomial", 31_000);
		assert.equal(sessionState(item(other)), "your-turn", "Binomial is none of its topics");
		const elsewhere = leftReview(LA, 40_000);
		answered("incl-excl", 41_000, PROB);
		assert.equal(sessionState(item(elsewhere)), "your-turn", "another course's answer");
	});
});
