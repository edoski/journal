/**
 * Round 15, m7 (2 n3, 2 aspect 9, 1 n5) and m8 (1 free, 2 n5, 2 free,
 * 3 free): the sidebar's cards jumped and repeated, and old sessions read
 * "Your turn" away from Home.
 *   - While Home's review started, its card showed twice, "Tutor writing" on
 *     both: the new session was not yet a review (its opening had not
 *     landed), so it did not take its review line's place, and sheet 4's
 *     card dropped out of the five.
 *   - Rank practice, between problems with nothing asked, read "Your turn"
 *     after a dispute and "Today" under Sessions before it: the state hung
 *     on whether the tutor's last turn ended on a tool's receipt or on an
 *     empty stop. A 5 Nov practice read "Your turn" on the calendar.
 *   - Map cards said a session's status ("Basis and dimension · Your
 *     turn") where Builds on said the topic's standing.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { openedAsReview } from "../src/core/session-opening.ts";
import { sessionEndOf } from "../src/core/session-end.ts";
import { activeProblemOf, danglingQuestionOf, type LhMessage } from "../src/core/native-messages.ts";
import { sessionState } from "../components/nav/session-state.ts";
import { todayRows } from "../components/study-home/study-facts.ts";
import { cardLine } from "../components/course-map/topic-map/topic-standing.ts";
import type { ChatListItem } from "../src/core/index.ts";
import { chat, PROB, TODAY } from "./fixtures/now-demo.ts";

describe("a review Home starts, before its opening lands (m7)", () => {
	it("is a review by the name it was created with", () => {
		assert.equal(openedAsReview({ title: "Review Binomial distribution", topics: ["binomial"], messages: [] }), true);
		assert.equal(openedAsReview({ title: "Binomial distribution", topics: ["binomial"], messages: [] }), false, "a lesson on the topic is not");
		assert.equal(openedAsReview({ title: "Review Binomial distribution", topics: [], messages: [] }), false, "nor a session on no topic");
	});

	it("takes its review line's place on Today: one line, the session's", () => {
		const review = PROB.map.topics.find((t) => t.review?.kind === "due")!;
		const course = { ...PROB, due: [review.handle] };
		const starting: ChatListItem = chat("chat_review", {
			title: `Review ${review.title}`,
			course: { workspace: PROB.map.workspace, title: PROB.map.title },
			topics: [review.handle],
			busy: true,
			messageCount: 0,
			updatedAt: `${TODAY}T10:00:00.000Z`,
			review: openedAsReview({ title: `Review ${review.title}`, topics: [review.handle], messages: [] }),
		});
		const rows = todayRows([course], [starting], TODAY).filter((row) => row.kind === "session" || (row.step.kind === "review" && row.step.topics.includes(review.handle)));
		assert.deepEqual(rows.map((row) => row.kind), ["session"], JSON.stringify(rows.map((row) => (row.kind === "session" ? row.chat.id : row.step.kind))));
	});
});

describe("a session between practice problems (m7, m8)", () => {
	it("is not his turn after a dispute's ruling, nor before it: lens 2's Rank practice, nothing asked", () => {
		const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "round15", "rank-after-dispute.json");
		const record = JSON.parse(fs.readFileSync(fixture, "utf-8")) as { kind: "practice"; topics: string[]; messages: LhMessage[] };
		const ruled = record.messages.findLastIndex((m) => m.role === "custom" && m.customType === "dispute");
		for (const end of [ruled, record.messages.length]) {
			const messages = record.messages.slice(0, end);
			const summary = chat("chat_demo_rank", { kind: "practice", topics: record.topics, ended: sessionEndOf(messages, undefined, "practice", record.topics), pendingQuestion: danglingQuestionOf(messages) !== null, pendingProblem: activeProblemOf(messages) !== null });
			assert.notEqual(sessionState(summary), "your-turn", end === ruled ? "before the dispute" : "after its ruling");
		}
	});
});

describe("a map card (m8; round 20, m4)", () => {
	it("says the topic's own fact, never the sidebar's word for a session or a task", () => {
		for (const kind of ["your-turn", "working", "stopped", "task"] as const) {
			assert.equal(cardLine({ place: "today", fact: { kind, words: "Your turn" } }), null, kind);
		}
		assert.deepEqual(cardLine({ place: "today", fact: { kind: "review", words: "Due today" } }), { kind: "review", words: "Due today" });
	});

	it("says what the topic's own open session says, over any other fact (round 20, m4: mid-lesson it read Not right last time)", () => {
		const fact = { kind: "slip", words: "Not right last time", slip: "lapsed" } as const;
		assert.deepEqual(cardLine({ place: "today", fact, now: { kind: "your-turn", words: "Your turn" } }), { kind: "your-turn", words: "Your turn" });
		assert.deepEqual(cardLine({ place: "learning", fact, now: { kind: "task", words: "Left off today" } }), { kind: "task", words: "Left off today" });
		assert.deepEqual(cardLine({ place: "learning", fact, now: null }), fact);
	});
});
