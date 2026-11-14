import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle, TopicLevel, TopicReview } from "../src/core/index.ts";
import { resumableSession } from "../components/nav/session-state.ts";
import {
	buildInbox,
	taskSessions,
	monogram,
	openingFor,
	sessionTwins,
	shelfOf,
	topicSessions,
	unitStatus,
} from "../components/unit-inbox/units.ts";

const topic = (handle: string, level: TopicLevel, review: TopicReview | null = null, weak = false): CourseMapTopic => ({
	handle: handle as TopicHandle,
	title: handle,
	level,
	introduced: level === "new" ? null : "2026-10-20",
	review,
	weak,
	signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false },
	tasks: [],
});
const due = (overdue: number): TopicReview => ({ kind: "due", date: "2026-11-01", overdue });
const later = (date: string): TopicReview => ({ kind: "scheduled", date });

const course = (workspace: string, topics: CourseMapTopic[]): StudyCourse => ({
	map: { workspace, title: workspace.toUpperCase(), today: "2026-11-08", revision: 1, exam: null, current: null, focus: null, tasks: [], topics, edges: [] },
	unready: null,
	due: null,
	newToday: [], lastActiveDaysAgo: 0,
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
	ownTopics: over.topics ?? [],
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

	it("lists what waits first, then topics being learned by the latest studied, then due reviews weak first; known topics apart, the soonest back first", () => {
		const inbox = buildInbox([la, pr], chats, null);
		assert.deepEqual(
			inbox.active.map((u) => u.topic.handle),
			["rank", "cramer", "basis", "span", "bayes"],
		);
		assert.deepEqual(
			inbox.active[0]!.sessions.map((s) => s.id),
			["rank-practice", "rank-take"],
		);
		assert.equal(inbox.active[0]!.now, "your-turn");
		assert.deepEqual(
			inbox.known.map((u) => u.topic.handle),
			["dets", "vectors"],
		);
		assert.deepEqual(inbox.working, []);
	});

	it("moves a topic the tutor is writing in to Working, whatever its standing", () => {
		const inbox = buildInbox([la], [chat("dets-now", { topics: ["dets"], busy: true })], null);
		assert.deepEqual(
			inbox.working.map((u) => u.topic.handle),
			["dets"],
		);
		assert.ok(!inbox.known.some((u) => u.topic.handle === "dets"));
		assert.ok(!inbox.active.some((u) => u.topic.handle === "dets"));
	});

	it("keeps sessions tied to no listed unit apart, and a scope keeps one course", () => {
		assert.deepEqual(
			buildInbox([la, pr], chats, null).other.map((c) => c.id),
			["question", "old"],
		);
		const scoped = buildInbox([la, pr], chats, "pr");
		assert.deepEqual(
			scoped.active.map((u) => u.topic.handle),
			["bayes"],
		);
		assert.deepEqual(scoped.other, []);
	});
});

describe("unitStatus", () => {
	const slipped = { ...topic("chain", "retained", due(4), true), signals: { gap: null, lapsed: true, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false } };
	const gapped = { ...topic("kernel", "attempted", due(1), true), signals: { gap: "Counts nonzero entries", mistake: true, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false } };
	const held = { ...topic("det", "assisted", due(2)), tasks: ["sheet4"] };
	const mixed = { ...topic("elimination", "assisted", due(2), true), signals: { ...slipped.signals, lapsed: false, choiceErrors: { cramer: 1 } } };
	const fixed = { ...topic("matmul", "independent", due(2), true), signals: { ...slipped.signals, repaired: true } };
	const la = course("la", [
		topic("rank", "assisted", due(3)),
		topic("cramer", "introduced", later("2026-11-09")),
		topic("vectors", "retained", later("2026-11-30")),
		topic("span", "retained", due(2)),
		topic("basis", "retained", due(9)),
		topic("eigen", "attempted"),
		topic("trace", "assisted"),
		slipped,
		gapped,
		held,
		mixed,
		fixed,
	]);
	const inbox = buildInbox(
		[{ ...la, map: { ...la.map, tasks: [{ key: "sheet4", title: "Problem sheet 4", step: "Part (c): show dim ker A = 2", updated: "2026-11-06" }] } }],
		[chat("r", { topics: ["rank"], busy: true }), chat("c", { topics: ["cramer"] }), chat("e", { topics: ["eigen"], pendingQuestion: true } as Partial<ChatListItem>), chat("t", { topics: ["trace"], updatedAt: "2026-11-05T12:00:00.000Z" })],
		null,
	);
	const by = (h: string) => [...inbox.active, ...inbox.working, ...inbox.known].find((u) => u.topic.handle === h)!;

	it("ends each row with the fact that is its own, in Home's words: a session first, then a slip, how overdue, where he left off, when it comes back, else how long ago", () => {
		assert.deepEqual(unitStatus(by("rank"), inbox.today), { kind: "working" });
		assert.deepEqual(unitStatus(by("eigen"), inbox.today), { kind: "your-turn" });
		assert.deepEqual(unitStatus(by("chain"), inbox.today), { kind: "slip", words: "Not right last time", slip: "lapsed" });
		assert.deepEqual(unitStatus(by("kernel"), inbox.today), { kind: "slip", words: "Mistake to fix", slip: "gap" });
		assert.deepEqual(unitStatus(by("elimination"), inbox.today), { kind: "slip", words: "Mixed up with cramer", slip: "mixed" }, "the method named by its title, as the map says it");
		assert.deepEqual(unitStatus(by("matmul"), inbox.today), { kind: "slip", words: "Fixed, check again later", slip: "repaired" });
		assert.deepEqual(unitStatus(by("span"), inbox.today), { kind: "review", words: "2d overdue" });
		assert.deepEqual(unitStatus(by("basis"), inbox.today), { kind: "review", words: "9d overdue" });
		assert.deepEqual(unitStatus(by("det"), inbox.today), { kind: "task", words: "Left off 2d ago" });
		assert.deepEqual(unitStatus(by("cramer"), inbox.today), { kind: "returns", words: "Back in 1d" });
		assert.deepEqual(unitStatus(by("vectors"), inbox.today), { kind: "returns", words: "Back in 22d" });
		assert.deepEqual(unitStatus(by("trace"), inbox.today), { kind: "studied", words: "3d ago" });
	});

	it("says Your turn only on a row whose session waits on him", () => {
		const turns = [...inbox.active, ...inbox.working, ...inbox.known].filter((u) => unitStatus(u, inbox.today).kind === "your-turn");
		assert.deepEqual(
			turns.map((u) => u.topic.handle),
			["eigen"],
		);
	});
});

describe("sessionTwins", () => {
	it("dates only the sessions whose title another listed session shares", () => {
		const twins = sessionTwins([
			chat("a", { title: "Total probability practice", updatedAt: "2026-11-06T18:19:13.840Z" }),
			chat("b", { title: "total probability practice ", updatedAt: "2026-10-26T18:19:17.142Z" }),
			chat("c", { title: "Bayes' rule" }),
		]);
		assert.deepEqual([...twins], [
			["a", "6 Nov"],
			["b", "26 Oct"],
		]);
	});
});

describe("CourseMark", () => {
	it("names a course by the initials of its first two words", () => {
		assert.equal(monogram("Linear Algebra"), "LA");
		assert.equal(monogram("Calculus I"), "CI");
		assert.equal(monogram("Probability"), "P");
	});
});

describe("the topic page", () => {
	it("puts the session waiting on the learner first, then a running one, then one stopped mid-turn, and none when all finished", () => {
		const waiting = chat("waiting", { pendingQuestion: true, updatedAt: "2026-11-07T09:00:00.000Z" });
		const running = chat("running", { busy: true, updatedAt: "2026-11-08T10:00:00.000Z" });
		const stopped = chat("stopped", { ended: "cut", updatedAt: "2026-11-08T11:00:00.000Z" });
		const newer = chat("newer", { updatedAt: "2026-11-08T09:00:00.000Z" });
		assert.equal(resumableSession([stopped, newer, running, waiting])?.id, "waiting");
		assert.equal(resumableSession([stopped, newer, running])?.id, "running");
		assert.equal(resumableSession([newer, stopped])?.id, "stopped");
		assert.equal(resumableSession([newer]), null);
	});

	it("lists only the sessions the engine's records tie to the topic, never one that only holds a task covering it", () => {
		const sheet = chat("sheet", { topics: ["rank"], tasks: ["sheet-4"], pendingQuestion: true });
		const kernelTake = chat("kernel-take", { topics: ["kernel"] });
		assert.deepEqual(topicSessions([sheet, kernelTake], "la", "kernel").map((c) => c.id), ["kernel-take"]);
		assert.deepEqual(taskSessions([sheet, kernelTake], "la", "sheet-4").map((c) => c.id), ["sheet"], "the task reaches its lesson");
	});

	it("leads a new session's first message with the topic unless the prompt names it", () => {
		assert.equal(openingFor("Rank", "  give me a harder example "), "Rank: give me a harder example");
		assert.equal(openingFor("Rank", "Why is rank the column count?"), "Why is rank the column count?");
	});
});
