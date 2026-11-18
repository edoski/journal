/**
 * A promised review on Home is a review row that opens a review (round 8,
 * 1 D3), unless a lesson on its topic is open: then the lesson's line takes
 * the review in, and his answers there count as it (round 15, m6: "Review
 * Linear maps · Due today" beside "Continue Linear maps … lesson"). A review
 * he opened is the topic's line, and the lesson's comes back once it is done.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseMove, openSessions, todayRows, type TodayRow } from "../components/study-home/study-facts.ts";
import { lessonTitle, whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { isReviewSession, openedAsReview, type StudyCourse } from "../src/core/index.ts";
import { COURSE, LA, LEFT, TODAY, chat, map, topic } from "./fixtures/round8-home.ts";

describe("a promised review on Home (1 D3)", () => {
	it("is a review row that opens a review, and folds into the lesson open on its topic (round 15, m6)", () => {
		const rows = todayRows([COURSE], openSessions([]), TODAY);
		assert.deepEqual(rows.map(lessonTitle), ["Review Eigenvalues and eigenvectors"]);
		assert.equal(whyOf(rows[0]!)?.short, "Due today");
		const row = rows[0] as TodayRow & { kind: "course" };
		const move = courseMove(COURSE, [], row.step);
		assert.equal(move.kind === "start" && move.opening, "Review Eigenvalues and eigenvectors");
		const folded = todayRows([COURSE], openSessions([LEFT]), TODAY);
		assert.deepEqual(folded.map((r) => (r.kind === "session" ? r.chat.id : lessonTitle(r))), [LEFT.id], "one line for the topic, the lesson's");
	});

	it("opens the review he started, and the lesson's line comes back once the review is done", () => {
		const review = chat({ id: "review", title: "Review Eigenvalues and eigenvectors", pendingQuestion: true, updatedAt: "2026-11-09T09:00:00.000Z" });
		const rows = todayRows([COURSE], openSessions([LEFT, review]), TODAY);
		assert.deepEqual(rows.map(lessonTitle), ["Review Eigenvalues and eigenvectors"], "the review session is the review's line");
		const done = { ...COURSE, due: [], map: map({ topics: [topic("eigen", "Eigenvalues and eigenvectors", { review: { kind: "scheduled", date: "2026-11-19" } })] }) };
		assert.deepEqual(needsYouNow([done], [LEFT], TODAY).rows.map(lessonTitle), ["Continue Eigenvalues and eigenvectors"]);
	});

	it("tells a review session from a lesson by its opening", () => {
		assert.equal(isReviewSession({ title: "Review Binomial distribution", ownTopics: ["binomial"] }), true);
		assert.equal(isReviewSession({ title: "Eigenvalues and eigenvectors", ownTopics: ["eigen"] }), false);
		assert.equal(isReviewSession({ title: "Review the week", ownTopics: [] }), false, "a review opens on topics");
		assert.equal(openedAsReview({ topics: ["chain"], messages: [{ role: "user", content: "Review Chain rule" }] }), true, "its opening says so, whatever its name");
		assert.equal(openedAsReview({ topics: ["chain"], messages: [{ role: "user", content: [{ type: "text", text: "Teach me the chain rule" }] }] }), false);
		assert.equal(openedAsReview({ topics: ["chain"], messages: [{ role: "user", content: "Review " }] }), true, "Review alone, on its topics");
		assert.equal(openedAsReview({ topics: ["chain"], messages: [{ role: "user", content: "Reviewing my notes, teach me the chain rule" }] }), false);
		assert.equal(isReviewSession({ title: "Chain rule review", review: true }), true, "the session list's word wins over the name");
	});
});
