/**
 * Round 19, m24 (2 N6). Under "Review Binomial distribution · Today",
 * Earlier listed the hinted answer (o94, re-marked as o97), then the first
 * wrong one (o93, re-marked as o96), then the last (o95): two disputes
 * re-stamped his first two answers, and the rows followed the disputes'
 * times. A re-mark now keeps the time he gave the answer it corrects.
 */
import assert from "node:assert/strict";
import { it } from "node:test";
import type { TopicAttempt } from "../src/core/index.ts";
import { topicRecordOf } from "../src/server/topic.ts";
import { trailDays } from "../components/unit-inbox/topic-page/trail/trail-facts.ts";
import type { SessionEntry } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { chat } from "./fixtures/now-demo.ts";

const REVIEW = "chat_review";
const at = (minute: number) => `2026-11-08T10:${String(minute).padStart(2, "0")}:00Z`;
const answer = (minute: number, result: string, corrects?: string[]) => ({ kind: "attempt", text: "C(10,3)(1/4)^3(3/4)^7", help: "none", result, date: "2026-11-08", recorded: at(minute), ...(corrects ? { corrects } : {}) });
const show = {
	items: { binomial: { kind: "topic", observations: ["o97", "o96", "o95", "o94", "o93"] } },
	evidence: {
		o93: answer(1, "incorrect"),
		o94: answer(5, "partial"),
		o95: answer(9, "correct"),
		o96: answer(20, "partial", ["o93"]),
		o97: answer(22, "correct", ["o94"]),
	},
};

it("a session's answers in Earlier keep the order he gave them, whatever was disputed after (round 19, m24)", () => {
	const saved = new Map(["o93", "o94", "o95", "o96", "o97"].map((id) => [id, REVIEW]));
	const attempts = topicRecordOf(show, "binomial", [], saved)!.attempts as TopicAttempt[];
	const review = { chat: chat(REVIEW, { title: "Review Binomial distribution", updatedAt: at(22) }), state: "finished", day: "2026-11-08" } as unknown as SessionEntry;
	const rows = trailDays([review], attempts, "2026-11-08").flatMap((day) => day.rows).flatMap((row) => (row.kind === "attempt" ? [row.attempt.id] : []));
	assert.deepEqual(rows, ["o95", "o97", "o96"], "newest answer first, each re-mark where its answer was given");
	assert.equal(attempts.find((a) => a.id === "o96")?.recorded, at(1), "a re-mark carries when he answered");
});
