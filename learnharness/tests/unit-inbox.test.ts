import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle, TopicLevel, TopicReview } from "../src/core/index.ts";
import { buildInbox, returnWords, shelfOf, unitStatus } from "../components/unit-inbox/units.ts";

const topic = (handle: string, level: TopicLevel, review: TopicReview | null = null, weak = false): CourseMapTopic => ({
	handle: handle as TopicHandle,
	title: handle,
	level,
	introduced: level === "new" ? null : "2026-10-20",
	review,
	weak,
	signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 },
	tasks: [],
});
const due = (overdue: number): TopicReview => ({ kind: "due", date: "2026-11-01", overdue });
const later = (date: string): TopicReview => ({ kind: "scheduled", date });

const course = (workspace: string, topics: CourseMapTopic[]): StudyCourse => ({
	map: { workspace, title: workspace.toUpperCase(), today: "2026-11-08", revision: 1, exam: null, current: null, focus: null, tasks: [], topics, edges: [] },
	unready: null,
	lastActiveDaysAgo: 0,
});

const chat = (id: string, over: Partial<ChatListItem> = {}): ChatListItem => ({
	id,
	title: id,
	kind: "teach",
	createdAt: "2026-11-01T08:00:00.000Z",
	updatedAt: "2026-11-01T09:00:00.000Z",
	messageCount: 4,
	phase: "teach",
	pendingQuestion: false,
	pendingProblem: false,
	busy: false,
	compacting: false,
	course: { workspace: "la", title: "LA" },
	...over,
});

describe("shelfOf", () => {
	it("puts taught-not-solid on Learning, solid-and-due on Review, solid on Known, and leaves new out", () => {
		assert.equal(shelfOf(topic("a", "assisted", due(2)), null), "learning");
		assert.equal(shelfOf(topic("a", "retained", due(2)), null), "review");
		assert.equal(shelfOf(topic("a", "independent", later("2026-11-20")), null), "known");
		assert.equal(shelfOf(topic("a", "new"), null), null);
	});

	it("a unit studied right now is on Learning, whatever its standing", () => {
		assert.equal(shelfOf(topic("a", "retained", later("2026-11-20")), "your-turn"), "learning");
		assert.equal(shelfOf(topic("a", "new"), "working"), "learning");
	});
});

describe("buildInbox", () => {
	const la = course("la", [
		topic("span", "retained", due(10)),
		topic("rank", "assisted", due(3), true),
		topic("basis", "independent", due(2), true),
		topic("vectors", "transferred", later("2026-11-13")),
		topic("dets", "retained", later("2026-11-10")),
		topic("eigen", "new"),
		topic("cramer", "introduced", due(1)),
	]);
	const pr = course("pr", [topic("bayes", "independent", due(1))]);
	const chats = [
		chat("rank-practice", { topics: ["rank"], pendingProblem: true, updatedAt: "2026-11-08T08:00:00.000Z" }),
		chat("rank-take", { topics: ["rank", "nonsense"], updatedAt: "2026-11-03T08:00:00.000Z" }),
		chat("cramer-take", { topics: ["cramer"], updatedAt: "2026-11-05T08:00:00.000Z" }),
		chat("question", { topics: [] }),
		chat("old", { course: undefined, topics: ["rank"] }),
		chat("bayes", { course: { workspace: "pr", title: "PR" }, topics: ["bayes"] }),
	];

	it("files each unit on its shelf in its order, with its sessions newest first", () => {
		const inbox = buildInbox([la, pr], chats, null);
		assert.deepEqual(inbox.learning.map((u) => u.topic.handle), ["rank", "cramer"], "the waiting unit first, then the latest studied");
		assert.deepEqual(inbox.learning[0]!.sessions.map((s) => s.id), ["rank-practice", "rank-take"]);
		assert.equal(inbox.learning[0]!.now, "your-turn");
		assert.deepEqual(inbox.review.map((u) => u.topic.handle), ["basis", "span", "bayes"], "weak first, then the longest past due");
		assert.deepEqual(inbox.known.map((u) => u.topic.handle), ["dets", "vectors"], "the soonest back first");
	});

	it("keeps sessions tied to no listed unit apart, and a scope keeps one course", () => {
		assert.deepEqual(buildInbox([la, pr], chats, null).other.map((c) => c.id), ["question", "old"]);
		const scoped = buildInbox([la, pr], chats, "pr");
		assert.deepEqual(scoped.review.map((u) => u.topic.handle), ["bayes"]);
		assert.deepEqual(scoped.learning, []);
		assert.deepEqual(scoped.other, []);
	});
});

describe("unitStatus", () => {
	const inbox = buildInbox(
		[course("la", [topic("rank", "assisted", due(3)), topic("cramer", "introduced", later("2026-11-09")), topic("vectors", "retained", later("2026-11-30"))])],
		[chat("r", { topics: ["rank"], busy: true }), chat("c", { topics: ["cramer"] })],
		null,
	);
	const by = (h: string) => [...inbox.learning, ...inbox.known].find((u) => u.topic.handle === h)!;

	it("says what runs now, then a known unit's return, else when it was studied", () => {
		assert.deepEqual(unitStatus(by("rank"), inbox.today), { kind: "working" });
		assert.deepEqual(unitStatus(by("cramer"), inbox.today), { kind: "studied", at: "2026-11-01T09:00:00.000Z" });
		assert.deepEqual(unitStatus(by("vectors"), inbox.today), { kind: "returns", days: 22 });
		assert.equal(returnWords(22), "in 3w");
		assert.equal(returnWords(5), "in 5d");
	});
});
