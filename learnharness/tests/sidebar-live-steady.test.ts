/**
 * The sidebar holds still during a lesson (round 11, 3 n4, shots 05, 06,
 * 14): the live lesson's own card read "Mistake to fix" while a question
 * waited, and the cards of other topics it touched changed their words at
 * each save ("Mistake to fix", then "Your turn").
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveChat, steadyLearning, shelfStatus } from "../components/unit-inbox/now-inbox.ts";
import type { Unit } from "../components/unit-inbox/units.ts";
import type { ChatListItem, CourseMapTopic, TopicHandle } from "../src/core/index.ts";

const TODAY = "2026-11-08";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: handle as TopicHandle, title: handle, level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });
const chat = (id: string, over: Partial<ChatListItem>): ChatListItem => ({ id, title: id, kind: "teach", createdAt: `${TODAY}T08:00:00.000Z`, updatedAt: `${TODAY}T09:00:00.000Z`, messageCount: 6, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false, course: { workspace: "/la", title: "Linear Algebra" }, ...over });
const unit = (t: CourseMapTopic, sessions: ChatListItem[], over: Partial<Unit> = {}): Unit => ({ key: `/la#${t.handle}`, course: { workspace: "/la", title: "Linear Algebra", today: TODAY }, topic: t, shelf: "learning", sessions, now: null, task: null, slip: null, ...over });

const LESSON = chat("inv", { topics: ["invertible", "determinant"], ownTopics: ["invertible"], pendingQuestion: true });
const mistake = { ...QUIET, gap: "Read det G = 0.001 as zero", mistake: true };

describe("the live lesson (3 n4)", () => {
	it("is the session open on the page while it waits on him or the tutor writes", () => {
		assert.equal(liveChat([LESSON], "/chat/inv")?.id, "inv");
		assert.equal(liveChat([{ ...LESSON, pendingQuestion: false, ended: "left" }], "/chat/inv"), null, "a lesson left for next time has settled");
		assert.equal(liveChat([LESSON], "/"), null, "a lesson he is not on is not live");
	});

	it("gives its own topic's card Your turn while a question waits, even with a mistake to fix", () => {
		const inv = unit(topic("invertible", { signals: mistake }), [LESSON], { now: "your-turn", slip: "Mistake to fix" });
		assert.deepEqual(shelfStatus(inv, TODAY, undefined, "inv"), { kind: "your-turn" });
		assert.equal(shelfStatus(inv, TODAY).kind, "slip", "off the lesson, the mistake still outranks Your turn (round 9, 3 m13)");
	});

	it("holds the cards of other topics it touched as they were when it went live, and adds none", () => {
		const det = unit(topic("determinant", { signals: mistake }), [LESSON], { slip: "Mistake to fix" });
		const rank = unit(topic("rank"), [LESSON]);
		const own = unit(topic("invertible"), [LESSON], { now: "your-turn" });
		const held = new Map([[det.key, { kind: "your-turn" as const }]]);
		const steady = steadyLearning([det, rank, own], (u) => shelfStatus(u, TODAY, undefined, "inv"), held, LESSON);
		assert.deepEqual(steady.units.map((u) => u.topic.handle), ["determinant", "invertible"], "a card the lesson brought in waits until it settles");
		assert.deepEqual(steady.status(det), { kind: "your-turn" }, "its words as they were");
		assert.deepEqual(steady.status(own), { kind: "your-turn" });
	});
});
