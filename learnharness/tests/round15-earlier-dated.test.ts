/**
 * Round 15, 2 n1 (m31; round 14, m30's remainder): Earlier on Random
 * variables drew its 6 Nov answer above "Total probability practice", the
 * session that saved it, whose line had no date (each day's words sat on
 * its first row only); Kernel's 6 Nov answer sat under "Problem sheet 4 ·
 * Today" with no date of its own. Every session line now carries its day,
 * an answer from another day than its line's carries its own, and a
 * practice's conclude receipt names its session, so the answer sits under
 * it (the seed's practices now end their concludes with the receipt a live
 * one writes).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatRecord, TopicAttempt } from "../src/core/index.ts";
import { savedBy, topicRecordOf } from "../src/server/topic.ts";
import { trailDays } from "../components/unit-inbox/topic-page/trail/trail-facts.ts";
import type { SessionEntry } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { chat } from "./fixtures/now-demo.ts";

const entry = (id: string, title: string, day: string, updatedAt: string): SessionEntry => ({ chat: chat(id, { title, updatedAt }), state: "finished", day }) as unknown as SessionEntry;
const attempt = (id: string, date: string, session: string | null, recorded: string): TopicAttempt => ({ id, date, session, recorded, text: id, result: "correct" }) as unknown as TopicAttempt;

describe("Earlier's dates (round 15, 2 n1)", () => {
	it("dates every session line, and an answer from another day than its line's with its own day", () => {
		const sheet = entry("chat_sheet", "Problem sheet 4", "2026-11-08", "2026-11-08T11:30:00Z");
		const review = entry("chat_review", "Kernel and rank-nullity review", "2026-11-08", "2026-11-08T09:00:00Z");
		const attempts = [attempt("o51", "2026-11-08", "chat_sheet", "2026-11-08T11:20:00Z"), attempt("o34", "2026-11-06", "chat_sheet", "2026-11-06T18:20:00Z"), attempt("o36", "2026-11-08", "chat_review", "2026-11-08T08:50:00Z")];
		const rows = trailDays([sheet, review], attempts, "2026-11-08").flatMap((day) => day.rows);
		for (const row of rows) if (row.kind === "session") assert.equal(row.label, "Today", `${row.entry.chat.title} has its day`);
		const o34 = rows.find((row) => row.kind === "attempt" && row.attempt.id === "o34");
		assert.equal(o34?.kind === "attempt" ? o34.label : null, "Fri 6 Nov", "the 6 Nov answer under Today's line keeps its own day");
		const o51 = rows.find((row) => row.kind === "attempt" && row.attempt.id === "o51");
		assert.equal(o51?.kind === "attempt" ? o51.label : "none", undefined, "an answer of its line's day needs none");
	});

	it("puts a practice's answer under its line through the conclude's receipt, the line first and dated", () => {
		const practice = {
			id: "chat_demo_pr_1106_1830",
			messages: [
				{ id: "a", role: "assistant", content: [{ type: "toolCall", id: "p0_c", name: "conclude", arguments: { outcome: "solvedWithHints", result: "correct" } }] },
				{ id: "r", role: "toolResult", toolCallId: "p0_c", toolName: "conclude", content: [{ type: "text", text: `Problem concluded.\n\nCourse record: ${JSON.stringify({ revision: 9, changed: true, observations: ["o21"], duplicates: [], saved: ["o21"] })}` }], isError: false },
			],
		} as unknown as ChatRecord;
		const show = { items: { "random-variables": { kind: "topic", observations: ["o21"] } }, evidence: { o21: { kind: "attempt", text: "Wrote the distribution of the number of heads in three tosses", help: "R2", result: "correct", date: "2026-11-06", recorded: "2026-11-06T18:10:00Z" } } };
		const attempts = topicRecordOf(show, "random-variables", [], savedBy([practice]))!.attempts as TopicAttempt[];
		const rows = trailDays([entry("chat_demo_pr_1106_1830", "Total probability practice", "2026-11-06", "2026-11-06T18:19:00Z")], attempts, "2026-11-08").flatMap((day) => day.rows);
		assert.deepEqual(rows.map((row) => (row.kind === "session" ? `line ${row.label}` : `answer ${row.attempt.id}`)), ["line Fri 6 Nov", "answer o21"]);
	});
});
