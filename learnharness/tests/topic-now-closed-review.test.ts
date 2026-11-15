/**
 * A review closed with Done for today never leads its topic's page (round
 * 10, 1 m7, shot 41): after the 9 Nov Eigen review closed and dated the
 * next one, Eigen's page showed it as "Now · Resume · Left off today". Its
 * open question rides with the topic's next review: it stays under Next,
 * and the Review press opens it once the review is due, as Home's review
 * line does (`courseMove`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { topicAction, topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { nextItems, nowItem } from "../components/unit-inbox/topic-page/pickup/pickup-facts.ts";
import { courseMove, todayRows } from "../components/study-home/study-facts.ts";
import type { CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-09";
const course = (review: CourseMapTopic["review"]): StudyCourse => ({
	map: map({ today: TODAY, topics: [topic("eigen", "Eigenvalues and eigenvectors", { review })] }),
	unready: null,
	due: review?.kind === "due" ? ["eigen" as TopicHandle] : [],
	newToday: [],
	lastActiveDaysAgo: 0,
});
/** This morning's Eigen review, closed with Done for today on an open question. */
const review = chat({ id: "review", title: "Review Eigenvalues and eigenvectors", review: true, ended: "left", updatedAt: "2026-11-09T09:00:00.000Z" });
const ids = (items: ReturnType<typeof nextItems>) => items.map((item) => (item.kind === "session" ? item.entry.chat.id : item.kind));

describe("a review closed for later (round 10, 1 m7)", () => {
	it("is not the topic's Now while its next review is days away; it waits under Next", () => {
		const c = course({ kind: "scheduled", date: "2026-11-12" });
		const action = topicAction(c.map.topics[0]!, c.map, [review]);
		assert.notEqual(action.kind, "resume", "never Resume on a closed review");
		const facts = topicFacts({ course: c, topic: c.map.topics[0]!, chats: [review], read: null });
		const now = nowItem(facts);
		assert.notEqual(now.chat, "review");
		assert.deepEqual(ids(nextItems(facts, now)), ["review"]);
	});

	it("is what the Review press opens once the review is due, as Home's review line opens it", () => {
		const c = course({ kind: "due", date: TODAY, overdue: 0 });
		// Closed three days ago, when it dated this review.
		const review = chat({ id: "review", title: "Review Eigenvalues and eigenvectors", review: true, ended: "left", createdAt: "2026-11-06T08:30:00.000Z", updatedAt: "2026-11-06T09:00:00.000Z" });
		const action = topicAction(c.map.topics[0]!, c.map, [review]);
		assert.equal(action.kind, "review");
		const facts = topicFacts({ course: c, topic: c.map.topics[0]!, chats: [review], read: null });
		const now = nowItem(facts);
		assert.equal(now.press, "Review");
		assert.equal(now.chat, "review", "the press opens the review he left");
		assert.deepEqual(ids(nextItems(facts, now)), [], "listed once, as Now");
		const [line] = todayRows([c], [review], TODAY);
		const move = line?.kind === "course" ? courseMove(c, [review], line.step) : null;
		assert.equal(move?.kind === "open" && move.chat.id, "review", "Home's line opens the same session");
	});
});
