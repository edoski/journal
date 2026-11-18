/**
 * Round 14, m30 (2 n2, round-13 n2): Earlier filed some answers outside
 * their session's line. Kernel's morning review answer sat on top while
 * its line "Kernel and rank-nullity review" sat at the bottom, and a
 * 5 Nov Random variables answer sat under the 6 Nov practice. Each was
 * saved by its own session's `course_save`, whose receipt names it, but
 * the page linked an answer to a session only through the answer card's
 * mark, so an answer saved with no card (the seeded sessions, a review
 * answered in words) had no line.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatRecord, TopicAttempt } from "../src/core/index.ts";
import { savedBy, topicRecordOf } from "../src/server/topic.ts";
import { trailDays } from "../components/unit-inbox/topic-page/trail/trail-facts.ts";
import type { SessionEntry } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { chat } from "./fixtures/now-demo.ts";

/** A session whose tutor saved some observations with no question named. */
const session = (id: string, saved: readonly string[]): ChatRecord =>
	({
		id,
		messages: [
			{ id: `${id}_u`, role: "user", content: "I think it is 2", timestamp: 1 },
			{ id: `${id}_s`, role: "assistant", content: [{ type: "toolCall", id: `${id}_save`, name: "course_save", arguments: { changes: { observations: saved.map(() => ({ topics: ["kernel"], text: "x", result: "correct", help: "none" })) } } }] },
			{ id: `${id}_r`, role: "toolResult", toolCallId: `${id}_save`, toolName: "course_save", content: [{ type: "text", text: JSON.stringify({ revision: 2, changed: true, observations: saved, saved }) }], isError: false },
		],
	}) as unknown as ChatRecord;

describe("Earlier as session groups (round 14, m30)", () => {
	it("names the session whose own save recorded an answer, with no answer card to link it", () => {
		const saved = savedBy([session("chat_review", ["o36"]), session("chat_sheet", ["o40", "o42"])]);
		assert.equal(saved.get("o36"), "chat_review");
		assert.equal(saved.get("o42"), "chat_sheet");
	});

	it("puts every answer under its own session's line, two sessions' answers interleaved in time", () => {
		const show = {
			items: { kernel: { kind: "topic", observations: ["o42", "o41", "o40"] } },
			evidence: {
				o42: { kind: "attempt", text: "Sheet, part (d)", help: "none", result: "correct", date: "2026-11-08", recorded: "2026-11-08T11:20:00Z" },
				o41: { kind: "attempt", text: "Morning review", help: "none", result: "correct", date: "2026-11-08", recorded: "2026-11-08T11:10:00Z" },
				o40: { kind: "attempt", text: "Sheet, part (c)", help: "none", result: "incorrect", date: "2026-11-08", recorded: "2026-11-08T11:00:00Z" },
			},
		};
		const saved = savedBy([session("chat_review", ["o41"]), session("chat_sheet", ["o40", "o42"])]);
		const attempts = topicRecordOf(show, "kernel", [], saved)!.attempts as TopicAttempt[];
		const entry = (id: string, title: string, updatedAt: string): SessionEntry => ({ chat: chat(id, { title, updatedAt }), state: "finished", day: "2026-11-08" }) as unknown as SessionEntry;
		const rows = trailDays([entry("chat_review", "Kernel review", "2026-11-08T11:12:00Z"), entry("chat_sheet", "Problem sheet 4", "2026-11-08T11:25:00Z")], attempts, "2026-11-08").flatMap((d) => d.rows);
		let line: string | null = null;
		for (const row of rows) {
			if (row.kind === "session") line = row.entry.chat.id;
			else assert.equal(line, row.attempt.session, `${row.attempt.id} sits under its own session's line`);
		}
		assert.ok(rows.every((row) => row.kind === "session" || row.attempt.session !== null), "none is left without a line");
	});
});
