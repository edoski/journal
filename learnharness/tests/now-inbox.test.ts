/**
 * The sidebar under the Inbox switch (components/unit-inbox/now-inbox.ts):
 * the top is Home's Today, every other listed topic is in exactly one
 * group, each saying when it was studied or comes back, and every session
 * not on top as its own card is under Sessions.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { courseProgress } from "../components/study-home/agenda-rows/row-facts.ts";
import { nowFor, plannedKeys, restSessions, restTopics, sessionKey, shelfStatus, studyDay, topicUnit, unitFor } from "../components/unit-inbox/now-inbox.ts";
import { buildInbox, type Unit } from "../components/unit-inbox/units.ts";
import type { StudyCourse } from "../src/core/index.ts";
import { back, CALCULUS, CHATS, chat, COURSES, due, LINALG, PROB, TODAY, topic } from "./fixtures/now-demo.ts";

function topOf(courses: readonly StudyCourse[], scope: string | null = null) {
	const inbox = buildInbox(courses, CHATS, scope);
	const needs = nowFor(courses, CHATS, scope, TODAY);
	const top = needs.lines.flatMap((l) => (l.lead && l.row.course ? [topicUnit(inbox, l.row.course, l.lead, CHATS)] : []));
	return { inbox, needs, top };
}

describe("restTopics", () => {
	it("puts every listed topic on the top or in exactly one group", () => {
		const { inbox, top } = topOf(COURSES);
		const onTop = new Set(top.map((u) => u.key));
		const shelves = restTopics(inbox, onTop);
		const placed = [...top, ...shelves.learning, ...shelves.working, ...shelves.known].map((u) => u.key);
		assert.equal(new Set(placed).size, placed.length, "no topic twice");
		for (const u of [...inbox.active, ...inbox.working, ...inbox.known]) assert.ok(placed.includes(u.key), `${u.key} placed`);
	});

	it("sorts On your own with the solid due topics first, the longest overdue first, then the soonest back", () => {
		const { inbox } = topOf([PROB]);
		const known = restTopics(inbox, new Set()).known.map((u) => u.topic.handle);
		assert.deepEqual(known, ["rv", "bayes", "cond"]);
	});

	it("puts a solid topic the engine calls weak (a lapse, a mistake to fix) on Learning, not On your own", () => {
		// The engine marks a lapsed topic weak too (the demo's Chain rule and Riemann sums).
		const calc: StudyCourse = { ...CALCULUS, map: { ...CALCULUS.map, topics: CALCULUS.map.topics.map((t) => (t.signals.lapsed ? { ...t, weak: true } : t)) } };
		const { inbox } = topOf([PROB, calc]);
		const shelves = restTopics(inbox, new Set());
		assert.ok(shelves.learning.some((u) => u.topic.handle === "total"), "weak Law of total probability");
		assert.ok(shelves.learning.some((u) => u.topic.handle === "chain"), "lapsed Chain rule");
		assert.ok(!shelves.known.some((u) => u.topic.weak));
		assert.deepEqual(
			shelves.known.map((u) => u.topic.handle),
			["rv", "improper", "riemann", "bayes", "cond", "limits"],
		);
	});

	it("holds on On your own exactly the topics Home's pie counts as on his own, less the top", () => {
		const { inbox, top } = topOf(COURSES);
		const onTop = new Set(top.map((u) => u.key));
		const known = restTopics(inbox, onTop).known.map((u) => u.key);
		const pie = COURSES.flatMap((c) => c.map.topics.filter((t) => ["independent", "retained", "transferred"].includes(t.level) && !t.weak).map((t) => `${c.map.workspace}#${t.handle}`));
		const live = new Set([...inbox.active, ...inbox.working].filter((u) => u.now !== null).map((u) => u.key));
		assert.deepEqual(new Set(known), new Set(pie.filter((k) => !onTop.has(k) && !live.has(k))));
		assert.equal(
			pie.length,
			COURSES.reduce((n, c) => n + courseProgress(c)!.solid, 0),
		);
	});

	it("keeps Learning's waiting topics first", () => {
		const { inbox, top } = topOf(COURSES);
		const learning = restTopics(inbox, new Set(top.map((u) => u.key))).learning;
		const waitsOnYou = (u: Unit) => u.now === "your-turn";
		assert.deepEqual(
			learning.filter(waitsOnYou).map((u) => u.topic.handle),
			["rank", "det"],
			"the session Today folds after the plan and the lesson he is in (round 10, 1 m2; round 11, 3 n5), and one from before yesterday",
		);
		assert.deepEqual(learning.slice(0, 2).map((u) => u.topic.handle), ["rank", "det"]);
		assert.ok(!learning.slice(2).some(waitsOnYou));
	});
});

describe("restSessions", () => {
	it("lists every session newest first, on a topic or not, less the ones drawn on top as their own card", () => {
		const ids = restSessions(CHATS, null, new Set([sessionKey("chat_eigen")])).map((c) => c.id);
		assert.deepEqual(ids, ["chat_rank", "chat_det", "chat_general", "chat_old"]);
	});

	it("keeps only the chosen course's sessions under the course filter", () => {
		assert.deepEqual(
			restSessions(CHATS, "/s/linalg", new Set()).map((c) => c.id),
			["chat_eigen", "chat_rank", "chat_det", "chat_old"],
		);
	});
});

describe("shelfStatus", () => {
	const unit = (over: Partial<Unit>): Unit => ({ key: "k", course: { workspace: "w", title: "W", today: "2026-11-08" }, topic: topic("t", "T", "assisted"), shelf: "learning", sessions: [], now: null, task: null, slip: null, ...over });

	it("says how long since a Learning topic was studied in Home's words, falling back to the day it was first taught, and that one never taught is not started", () => {
		assert.deepEqual(shelfStatus(unit({ sessions: [chat("a", { updatedAt: "2026-11-07T09:00:00.000Z" })] }), TODAY), { kind: "studied", words: "Yesterday" });
		assert.deepEqual(shelfStatus(unit({}), TODAY), { kind: "studied", words: "20 Oct" });
		assert.deepEqual(shelfStatus(unit({ topic: topic("t", "T", "new") }), TODAY), { kind: "none", words: "Not started" });
	});

	it("says a topic in today's plan is due in Home's words, and when a scheduled one comes back, even while still learning", () => {
		const planned = plannedKeys([LINALG]);
		assert.ok(planned.has("/s/linalg#independence"));
		const inPlan = unit({ key: "/s/linalg#independence", topic: topic("independence", "Linear independence", "assisted", { review: due(4) }) });
		assert.deepEqual(shelfStatus(inPlan, TODAY, planned), { kind: "review", words: "Due 4 Nov" });
		assert.deepEqual(shelfStatus(inPlan, TODAY), { kind: "studied", words: "20 Oct" });
		assert.deepEqual(shelfStatus(unit({ topic: topic("t", "T", "assisted", { review: back("2026-11-10") }) }), TODAY, planned), { kind: "back", words: "Back Tue 10 Nov" });
	});

	it("says how overdue a solid topic is, when a known one comes back, and Your turn or Working first", () => {
		assert.deepEqual(shelfStatus(unit({ shelf: "review", topic: topic("t", "T", "retained", { review: due(2) }) }), TODAY), { kind: "review", words: "Due 6 Nov" });
		assert.deepEqual(shelfStatus(unit({ shelf: "known", topic: topic("t", "T", "retained", { review: back("2026-11-13") }) }), TODAY), { kind: "back", words: "Back Fri 13 Nov" });
		assert.deepEqual(shelfStatus(unit({ now: "your-turn" }), TODAY), { kind: "your-turn" });
		assert.deepEqual(shelfStatus(unit({ now: "working" }), TODAY), { kind: "working" });
	});

	it("never hides a wrong answer still open behind a lesson left off; a fixed one, or a gap with none open, lets the lesson say it (round 8, 2 m10)", () => {
		const signals = { gap: "Reads the kernel off with a sign slip", lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
		const open = unit({ now: "left", slip: "Mistake to fix", topic: topic("eigen", "Eigen", "assisted", { weak: true, signals: { ...signals, mistake: true } }) });
		assert.deepEqual(shelfStatus(open, TODAY), { kind: "slip", words: "Mistake to fix", slip: "gap" });
		const closed = unit({ now: "left", slip: "Check on your own", topic: topic("eigen", "Eigen", "assisted", { weak: true, signals }) });
		assert.deepEqual(shelfStatus(closed, TODAY), { kind: "task", words: "Unfinished" }, "a left lesson its unit does not list has no day to say");
	});
});

describe("unitFor and topicUnit", () => {
	it("makes a unit for a lead the inbox does not list, a topic not started, with its sessions", () => {
		const diag = LINALG.map.topics.find((t) => t.handle === "diag")!;
		const started = [chat("d", { course: { workspace: "/s/linalg", title: "Linear Algebra" }, topics: ["diag"], pendingQuestion: true })];
		const inbox = buildInbox([LINALG], [], null);
		assert.ok(![...inbox.active, ...inbox.known].some((u) => u.topic.handle === "diag"));
		const unit = topicUnit(inbox, LINALG, diag, started);
		assert.deepEqual([unit.key, unit.shelf, unit.now, unit.sessions.map((c) => c.id)], ["/s/linalg#diag", "learning", "your-turn", ["d"]]);
		assert.equal(unitFor(LINALG, diag, []).shelf, "learning");
	});

	it("takes the inbox's own unit for a listed topic", () => {
		const { inbox } = topOf(COURSES);
		const rank = LINALG.map.topics.find((t) => t.handle === "rank")!;
		assert.equal(topicUnit(inbox, LINALG, rank, CHATS), inbox.active.find((u) => u.topic.handle === "rank"));
	});
});

describe("nowFor", () => {
	it("keeps every course's lines with no filter, and only the chosen course's under it", () => {
		assert.deepEqual(nowFor(COURSES, CHATS, null, TODAY), needsYouNow(COURSES, CHATS, TODAY));
		assert.deepEqual(nowFor(COURSES, CHATS, "/s/linalg", TODAY).lines.map((l) => l.key.split("#")[0]), ["/s/linalg", "chat_eigen", "chat_rank"]);
		assert.deepEqual(nowFor(COURSES, CHATS, "/s/prob", TODAY).lines.map((l) => l.key.split("#")[0]), ["/s/prob"]);
	});

	it("takes the engine's study day, else the learner's own date", () => {
		assert.equal(studyDay("2026-11-08", new Date(2026, 10, 13, 22)), "2026-11-08");
		assert.equal(studyDay("", new Date(2026, 10, 13, 22)), "2026-11-13");
	});
});
