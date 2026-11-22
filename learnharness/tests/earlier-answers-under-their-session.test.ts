/**
 * Every answer in Earlier sits under its own session's line (round 13,
 * 2 n2). On Kernel's page after the sheet: "Used rank-nullity on a 3 × 5
 * matrix · Today", the sheet's answer, sat with no line above the morning's
 * "Kernel and rank-nullity review", since Problem sheet 4 was Kernel's Now
 * and Earlier left out the sessions Now and Next hold, answers and all.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatListItem, TopicAttempt } from "../src/core/index.ts";
import { earlierSessions, trailDays } from "../components/unit-inbox/topic-page/trail/trail-facts.ts";
import type { SessionEntry } from "../components/unit-inbox/topic-page/topic-facts.ts";

const entry = (id: string, updatedAt: string, state: SessionEntry["state"] = "finished"): SessionEntry => ({
	chat: { id, title: id, kind: "teach", createdAt: updatedAt, updatedAt, messageCount: 4, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false } as ChatListItem,
	own: true,
	maps: true,
	state,
	day: updatedAt.slice(0, 10),
	when: updatedAt.slice(0, 10),
	plan: null,
});
const attempt = (id: string, recorded: string, session: string): TopicAttempt => ({ id, date: recorded.slice(0, 10), recorded, result: "correct", unaided: true, grade: null, gaveUp: false, predicted: false, sure: null, chose: null, text: `Answer ${id}`, session, uncertain: false });

describe("Earlier nests each answer under its session (2 n2)", () => {
	const sheet = entry("sheet", "2026-11-08T07:39:00.000Z", "left");
	const review = entry("review", "2026-11-08T07:40:00.000Z");
	const quiet = entry("quiet", "2026-11-08T07:00:00.000Z", "left");
	const attempts = [attempt("o60", "2026-11-08T07:38:00.000Z", "sheet"), attempt("o55", "2026-11-08T07:35:00.000Z", "review")];

	it("keeps the line of a session Now holds when it saved answers here, and leaves out one that saved none", () => {
		const held = new Set<string | null>(["sheet", "quiet"]);
		const listed = earlierSessions([sheet, review, quiet], held, attempts).map((e) => e.chat.id);
		assert.deepEqual(listed, ["sheet", "review"]);
		const [today] = trailDays(earlierSessions([sheet, review, quiet], held, attempts), attempts, "2026-11-08");
		assert.deepEqual(today!.rows.map((r) => (r.kind === "session" ? `line:${r.entry.chat.id}` : r.attempt.id)), ["line:sheet", "o60", "line:review", "o55"]);
	});
});
