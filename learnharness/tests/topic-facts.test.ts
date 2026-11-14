/**
 * What every topic page candidate reads: the one action, where he stands
 * in the map's words, where to pick the topic back up, and the page's
 * words for time, pinned to Home's. Topics are the seeded demo's own
 * (engine day 2026-11-08).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import type { SessionPlan, TopicAttempt, TopicRecord } from "../src/core/contracts/topic.ts";
import { studiedAgo } from "../components/study-home/agenda-rows/row-facts.ts";
import type { TodayRow } from "../components/study-home/study-facts.ts";
import {
	agoWords,
	attemptMark,
	dayWords,
	heldTasks,
	lastStudiedDay,
	mistakeOf,
	pickupsOf,
	sessionEntries,
	studiedWords,
	topicAction,
	topicFacts,
	headMarks,
	localDay,
	waitsWords,
} from "../components/unit-inbox/topic-page/topic-facts.ts";
import { heldExamWords } from "../components/study-words.ts";

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = (date: string, overdue: number) => ({ kind: "due" as const, date, overdue });

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const TOPICS = {
	vectors: topic("vectors", { title: "Vectors and linear combinations", level: "transferred", introduced: "2026-10-16", review: { kind: "scheduled", date: "2026-11-13" } }),
	span: topic("span", { title: "Span", level: "retained", introduced: "2026-10-16", review: due("2026-10-29", 10) }),
	independence: topic("independence", {
		title: "Linear independence",
		level: "assisted",
		introduced: "2026-10-20",
		review: due("2026-10-23", 16),
		weak: true,
		signals: { ...QUIET, gap: "Treats pairwise non-parallel vectors as independent; misses a third vector in their span", confidentErrors: 1 },
	}),
	basis: topic("basis", { title: "Basis and dimension", level: "independent", introduced: "2026-10-20", review: due("2026-10-30", 9), tasks: ["sheet-4"] }),
	matmul: topic("matmul", { title: "Matrix multiplication as composition", level: "independent", introduced: "2026-10-27", review: due("2026-11-06", 2), weak: true, signals: { ...QUIET, lapsed: true } }),
	elimination: topic("elimination", { title: "Gaussian elimination", level: "assisted", introduced: "2026-10-20", review: due("2026-11-06", 2), weak: true, signals: { ...QUIET, choiceErrors: { cramer: 1 } } }),
	rank: topic("rank", {
		title: "Rank and the column space",
		level: "assisted",
		introduced: "2026-10-30",
		review: due("2026-11-05", 3),
		weak: true,
		signals: { ...QUIET, gap: "Counts nonzero entries instead of pivots; confuses rank with the number of rows", stale: true },
		tasks: ["sheet-4"],
	}),
	kernel: topic("kernel", { title: "Kernel and rank-nullity", level: "attempted", introduced: "2026-11-06", review: due("2026-11-07", 1), weak: true, signals: { ...QUIET, confidentErrors: 1 }, tasks: ["sheet-4"] }),
	determinant: topic("determinant", { title: "Determinants as volume scaling", level: "assisted", introduced: "2026-11-03", review: due("2026-11-04", 4) }),
	cramer: topic("cramer", { title: "Cramer's rule", level: "introduced", introduced: "2026-11-05", review: due("2026-11-06", 2) }),
	eigen: topic("eigen", { title: "Eigenvalues and eigenvectors" }),
	riemann: topic("riemann-sums", { title: "Riemann sums", level: "retained", introduced: "2026-10-11", review: due("2026-11-08", 0), weak: true, signals: { ...QUIET, lapsed: true } }),
	chain: topic("chain-rule", { title: "Chain rule", level: "retained", introduced: "2026-09-11", review: due("2026-10-09", 30), weak: true, signals: { ...QUIET, lapsed: true } }),
};
const SHEET = { key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2 for the 3x5 matrix A", updated: null };
const MAP: CourseMap = {
	workspace: WORKSPACE,
	title: "Linear Algebra",
	today: TODAY,
	revision: 13,
	exam: null,
	current: h("rank"),
	focus: "sheet-4",
	tasks: [SHEET],
	topics: Object.values(TOPICS),
	edges: [],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };
const titleOf = (handle: string) => MAP.topics.find((t) => t.handle === handle)?.title ?? handle;

let ids = 0;
function chat(over: Partial<ChatListItem> = {}): ChatListItem {
	ids += 1;
	return {
		id: `chat_${ids}`,
		title: `Session ${ids}`,
		createdAt: "2026-11-01T09:00:00.000Z",
		updatedAt: "2026-11-01T10:00:00.000Z",
		kind: "teach",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		course: { workspace: WORKSPACE, title: "Linear Algebra" },
		topics: [],
		busy: false,
		compacting: false,
		...over,
	};
}

function attempt(over: Partial<TopicAttempt> = {}): TopicAttempt {
	return { id: "o1", date: "2026-11-03", recorded: null, result: "correct", unaided: true, sure: null, chose: null, text: "Counted pivots of a 3x4 matrix", ...over };
}

const EIGEN_PLAN: SessionPlan = {
	id: "chat_eigen",
	tree: { nodes: [{ id: "equation", title: "Av = λv" }, { id: "compute", title: "Computing a 2×2 spectrum" }], edges: [{ from: "equation", to: "compute" }] },
	current: "compute",
	visited: ["equation"],
};

describe("the page's one action", () => {
	it("resumes the session that waits on him, else opens the one the tutor is writing in", () => {
		const waiting = chat({ topics: ["rank"], pendingQuestion: true });
		const writing = chat({ topics: ["rank"], busy: true, updatedAt: "2026-11-08T09:00:00.000Z" });
		assert.deepEqual(topicAction(TOPICS.rank, MAP, [writing, waiting]), { kind: "resume", chat: waiting }, "a waiting session beats one being written");
		assert.deepEqual(topicAction(TOPICS.rank, MAP, [writing]), { kind: "open", chat: writing });
		assert.deepEqual(topicAction(TOPICS.eigen, MAP, [chat({ topics: ["eigen"], compacting: true })]).kind, "open");
	});

	it("never resumes a session the engine's records do not tie to the topic", () => {
		const elsewhere = chat({ topics: ["span"], pendingQuestion: true });
		assert.equal(topicAction(TOPICS.determinant, MAP, [elsewhere]).kind, "review", "a lesson on another topic waits, not this one");
		const sheet = chat({ tasks: ["sheet-4"], pendingQuestion: true });
		assert.deepEqual(topicAction(TOPICS.basis, MAP, [sheet]), { kind: "review", opening: "Review Basis and dimension" }, "a waiting sheet that covers it does not make it the topic's turn");
		const finished = chat({ topics: ["rank"], updatedAt: "2026-11-08T09:00:00.000Z" });
		assert.deepEqual(topicAction(TOPICS.rank, MAP, [finished]), { kind: "review", opening: "Review Rank and the column space" }, "a finished lesson is not reopened for a due review");
	});

	it("reviews a topic whose review is due, at any level, ahead of an open task", () => {
		assert.deepEqual(topicAction(TOPICS.span, MAP, []), { kind: "review", opening: "Review Span" });
		assert.deepEqual(topicAction(TOPICS.basis, MAP, []), { kind: "review", opening: "Review Basis and dimension" });
		assert.deepEqual(topicAction(TOPICS.matmul, MAP, []), { kind: "review", opening: "Review Matrix multiplication as composition" });
		assert.deepEqual(topicAction(TOPICS.kernel, MAP, []), { kind: "review", opening: "Review Kernel and rank-nullity" }, "still being learned");
	});

	it("continues the open task that holds the topic, ahead of starting it", () => {
		const kernelLater = { ...TOPICS.kernel, review: null };
		assert.deepEqual(topicAction(kernelLater, MAP, []), { kind: "continue", opening: "Continue Problem sheet 4: rank and nullity", task: SHEET });
		const sheet = chat({ tasks: ["sheet-4"] });
		assert.deepEqual(topicAction(kernelLater, MAP, [sheet]), { kind: "continue", chat: sheet, task: SHEET }, "Continue reopens the lesson that holds the task");
		assert.deepEqual(topicAction({ ...TOPICS.eigen, tasks: ["sheet-4"] }, MAP, []).kind, "continue");
	});

	it("starts a topic not started, and continues one still being learned", () => {
		assert.deepEqual(topicAction(TOPICS.eigen, MAP, []), { kind: "start", opening: "Eigenvalues and eigenvectors" });
		const learning = { ...TOPICS.determinant, review: null };
		assert.deepEqual(topicAction({ ...TOPICS.cramer, review: null }, MAP, []), { kind: "continue", opening: "Continue Cramer's rule", task: null });
		const finished = chat({ topics: ["determinant"] });
		assert.deepEqual(topicAction(learning, MAP, [finished]), { kind: "continue", chat: finished, task: null }, "Continue reopens the finished lesson");
		assert.deepEqual(topicAction(learning, MAP, [chat({ topics: ["determinant"], kind: "practice" })]), { kind: "continue", opening: "Continue Determinants as volume scaling", task: null }, "a finished practice round is not reopened");
	});

	it("only offers Study when the engine has dated the next review", () => {
		assert.deepEqual(topicAction(TOPICS.vectors, MAP, []), { kind: "study", opening: "Vectors and linear combinations" });
		const learningLater = { ...TOPICS.determinant, review: { kind: "scheduled" as const, date: "2026-11-09" } };
		assert.equal(topicAction(learningLater, MAP, []).kind, "study");
		const slippedLater = { ...TOPICS.matmul, review: { kind: "scheduled" as const, date: "2026-11-12" } };
		assert.equal(topicAction(slippedLater, MAP, []).kind, "study");
	});
});

describe("the open tasks that hold a topic", () => {
	it("puts the focused task first and leaves out a task that does not hold it", () => {
		const other = { key: "sheet-3", title: "Problem sheet 3", step: null, updated: null };
		const unrelated = { key: "sheet-9", title: "Problem sheet 9", step: null, updated: null };
		const map = { ...MAP, tasks: [other, SHEET, unrelated] };
		const held = { ...TOPICS.rank, tasks: ["sheet-3", "sheet-4"] };
		assert.deepEqual(
			heldTasks(held, map).map((t) => t.key),
			["sheet-4", "sheet-3"],
		);
		assert.deepEqual(heldTasks(TOPICS.span, map), []);
	});
});

describe("where he stands, in the app's one wording", () => {
	it("says every seeded head line word for word", () => {
		const lines: [CourseMapTopic, string][] = [
			[TOPICS.rank, "Right with help. Mistake to fix. 3d overdue"],
			[TOPICS.matmul, "Right with help. Not right last time. 2d overdue"],
			[TOPICS.span, "On your own. 1w overdue"],
			[TOPICS.vectors, "On your own. Back in 5d"],
			[TOPICS.cramer, "Taught, not tried. 2d overdue"],
			[TOPICS.riemann, "Right with help. Not right last time. Due today"],
			[TOPICS.elimination, "Right with help. Mixed up with Cramer's rule. 2d overdue"],
			[TOPICS.kernel, "Tried, not right yet. Sure, but wrong. 1d overdue"],
			[TOPICS.basis, "On your own. 1w overdue"],
			[TOPICS.independence, "Right with help. Mistake to fix. 2w overdue"],
			[TOPICS.chain, "Right with help. Not right last time. 4w overdue"],
			[TOPICS.eigen, "Not started"],
		];
		const said = (t: CourseMapTopic) => [topicFacts({ course: COURSE, topic: t, chats: [], read: null }).standing!.words, ...headMarks(t, titleOf, TODAY).map((mark) => mark.words)].join(". ");
		for (const [t, words] of lines) assert.equal(said(t), words, t.handle);
	});

	it("gives why it needs him and its review as marks of their own kind", () => {
		assert.deepEqual(headMarks(TOPICS.matmul, titleOf, TODAY), [
			{ kind: "slip", words: "Not right last time" },
			{ kind: "review", words: "2d overdue" },
		]);
		assert.deepEqual(headMarks({ ...TOPICS.cramer, review: null }, titleOf, TODAY), []);
	});

	it("is silent for a topic not started that already has a session", () => {
		const facts = topicFacts({ course: COURSE, topic: TOPICS.eigen, chats: [chat({ topics: ["eigen"], pendingQuestion: true })], read: null });
		assert.deepEqual([facts.standing, facts.marks], [null, []]);
	});

	it("says a topic still being learned is due, as its action does, and dates a later review", () => {
		assert.deepEqual(headMarks(TOPICS.determinant, titleOf, TODAY), [{ kind: "review", words: "4d overdue" }]);
		assert.deepEqual(headMarks({ ...TOPICS.determinant, review: null }, titleOf, TODAY), []);
		assert.deepEqual(headMarks({ ...TOPICS.determinant, review: { kind: "scheduled", date: "2026-11-09" } }, titleOf, TODAY), [{ kind: "review", words: "Back in 1d" }]);
	});
});

describe("the page's words for time", () => {
	const row = (days: number): TodayRow => ({ kind: "course", course: { ...COURSE, lastActiveDaysAgo: days }, step: { kind: "none" } });

	it("are Home's, for every day from today to more than a year back", () => {
		for (let days = 0; days <= 400; days++) assert.equal(agoWords(days), studiedAgo(row(days)), `ago ${days}`);
	});

	it("say when he last studied the topic, in days, then weeks, then months", () => {
		assert.deepEqual([0, 1, 2, 13, 14, 59, 60].map(studiedWords), ["Studied today", "Studied yesterday", "Studied 2 days ago", "Studied 13 days ago", "Studied 2 weeks ago", "Studied 8 weeks ago", "Studied 2 months ago"]);
	});

	it("name a day against the engine's: today, yesterday, else the date", () => {
		assert.equal(dayWords(TODAY, TODAY), "Today");
		assert.equal(dayWords("2026-11-09", TODAY), "Today", "a day after the engine's reads as today");
		assert.equal(dayWords("2026-11-07", TODAY), "Yesterday");
		assert.equal(dayWords("2026-11-03", TODAY), "Tue 3 Nov");
		assert.equal(dayWords("2025-12-31", "2026-01-02"), "Wed 31 Dec");
	});
});

describe("when he last studied the topic", () => {
	const entries = (...days: string[]) => sessionEntries(days.map((day) => chat({ updatedAt: `${day}T10:00:00.000Z` })), [], TODAY);

	it("is the latest of its newest attempt, its newest session and the day it was first taught", () => {
		const taught = { ...TOPICS.cramer, introduced: "2026-11-01" };
		assert.equal(lastStudiedDay(taught, entries("2026-11-03"), [attempt({ date: "2026-11-05" })]), "2026-11-05");
		assert.equal(lastStudiedDay(taught, entries("2026-11-06"), [attempt({ date: "2026-11-05" })]), "2026-11-06");
		assert.equal(lastStudiedDay({ ...taught, introduced: "2026-11-07" }, entries("2026-11-06"), [attempt({ date: "2026-11-05" })]), "2026-11-07");
		assert.equal(lastStudiedDay(TOPICS.eigen, [], []), null);
	});

	it("reads a session dated after the engine's day as today", () => {
		const chats = [chat({ topics: ["cramer"], updatedAt: "2026-11-10T08:00:00.000Z" })];
		assert.equal(topicFacts({ course: COURSE, topic: TOPICS.cramer, chats, read: null }).studied, "Studied today");
		assert.equal(topicFacts({ course: COURSE, topic: TOPICS.cramer, chats: [], read: null }).studied, "Studied 3 days ago");
	});

	it("dates a session by its local day, never after the engine's", () => {
		const late = new Date(2026, 10, 6, 23, 30).toISOString();
		assert.equal(localDay(late), "2026-11-06");
		const [entry] = sessionEntries([chat({ updatedAt: late })], [], TODAY);
		assert.deepEqual([entry!.day, entry!.when], ["2026-11-06", "2d ago"]);
		const [later] = sessionEntries([chat({ updatedAt: "2026-11-12T10:00:00.000Z" })], [], TODAY);
		assert.deepEqual([later!.day, later!.when], [TODAY, "Today"]);
	});
});

describe("what went wrong", () => {
	const missed = attempt({ id: "o9", date: "2026-11-07", result: "incorrect", text: "Multiplied a 2x3 by a 3x2 matrix and gave a 3x3 result" });

	it("is the engine's diagnosis, even over a newer miss", () => {
		assert.equal(mistakeOf(TOPICS.rank, [missed]), TOPICS.rank.signals.gap);
	});

	it("is a weak topic's newest attempt in the tutor's words when it was not right", () => {
		assert.equal(mistakeOf(TOPICS.matmul, [missed, attempt()]), "Multiplied a 2x3 by a 3x2 matrix and gave a 3x3 result");
		assert.equal(mistakeOf(TOPICS.matmul, [attempt({ result: "partial", text: "Half right" })]), "Half right");
		assert.equal(mistakeOf(TOPICS.matmul, [attempt(), missed]), null, "the newest attempt was right");
		assert.equal(mistakeOf(TOPICS.matmul, []), null);
	});

	it("is nothing for a topic the engine does not call weak, even after a miss", () => {
		assert.equal(mistakeOf(TOPICS.span, [missed]), null);
	});
});

describe("where to pick the topic back up", () => {
	const record: TopicRecord = { attempts: [], tasks: [{ key: "sheet-4", updated: "2026-11-06" }] };
	const pickups = (t: CourseMapTopic, sessions: ChatListItem[], plans: SessionPlan[] = []) => pickupsOf(t, MAP, sessionEntries(sessions, plans, TODAY), sessions, record, TODAY);

	it("puts a lesson waiting on a step at that step", () => {
		const lesson = chat({ id: "chat_eigen", title: "Eigenvalues and eigenvectors", pendingQuestion: true, updatedAt: "2026-11-08T09:00:00.000Z" });
		assert.deepEqual(pickups(TOPICS.eigen, [lesson], [EIGEN_PLAN]), [
			{ kind: "session", chat: lesson, waits: true, title: "Eigenvalues and eigenvectors", where: "Computing a 2×2 spectrum", when: "Today" },
		]);
		assert.equal(pickups(TOPICS.eigen, [lesson])[0]!.where, "Question waiting", "no plan, so no step");
	});

	it("says a practice problem waits, or that the tutor is writing", () => {
		assert.equal(pickups(TOPICS.determinant, [chat({ kind: "practice", pendingProblem: true })])[0]!.where, "Problem waiting");
		const writing = pickups(TOPICS.determinant, [chat({ busy: true, pendingQuestion: true })])[0]!;
		assert.equal(writing.kind === "session" && writing.waits, false);
		assert.equal(writing.where, "The tutor is writing");
	});

	it("names the step a lesson is on while the tutor writes in it", () => {
		const writing = pickups(TOPICS.eigen, [chat({ id: "chat_eigen", busy: true })], [EIGEN_PLAN])[0]!;
		assert.equal(writing.kind === "session" && writing.waits, false);
		assert.equal(writing.where, "Computing a 2×2 spectrum");
	});

	it("gives the session, then each open task at its step with when it was last touched", () => {
		const practice = chat({ kind: "practice", pendingProblem: true, title: "Rank practice" });
		const rows = pickups(TOPICS.rank, [chat(), practice]);
		assert.deepEqual(
			rows.map((p) => [p.kind, p.title, p.where, p.when]),
			[
				["session", "Rank practice", "Problem waiting", "7d ago"],
				["task", SHEET.title, SHEET.step, "2d ago"],
			],
		);
		const task = rows[1]!;
		assert.deepEqual(task.kind === "task" && task.press, { opening: "Continue Problem sheet 4: rank and nullity" });
	});

	it("calls a task with no step unfinished, and gives nothing when there is no place", () => {
		const map = { ...MAP, tasks: [{ ...SHEET, step: null }] };
		const [row] = pickupsOf(TOPICS.kernel, map, [], [], null, TODAY);
		assert.deepEqual([row!.where, row!.when], ["Unfinished", null]);
		assert.deepEqual(pickups(TOPICS.determinant, [chat()]), []);
	});
});

describe("the topic's sessions", () => {
	it("are listed newest first, without the one already a pick-up row, but with a second that waits", () => {
		const newest = chat({ topics: ["determinant"], pendingQuestion: true, updatedAt: "2026-11-08T09:00:00.000Z" });
		const second = chat({ topics: ["determinant"], pendingQuestion: true, updatedAt: "2026-11-07T09:00:00.000Z" });
		const old = chat({ topics: ["determinant"], updatedAt: "2026-10-20T09:00:00.000Z" });
		const elsewhere = chat({ topics: ["span"], pendingQuestion: true, updatedAt: "2026-11-08T10:00:00.000Z" });
		const facts = topicFacts({ course: COURSE, topic: TOPICS.determinant, chats: [elsewhere, old, second, newest], read: { record: null, plans: [] } });
		assert.deepEqual(
			facts.sessions.map((e) => [e.chat.id, e.state, e.when]),
			[
				[newest.id, "your-turn", "Today"],
				[second.id, "your-turn", "Yesterday"],
				[old.id, "finished", "2w ago"],
			],
		);
		assert.deepEqual(
			facts.listed.map((e) => e.chat.id),
			[second.id, old.id],
		);
		assert.equal(facts.action.kind, "resume");
	});

	it("carry the plan their tutor authored", () => {
		const lesson = chat({ id: "chat_eigen" });
		assert.equal(sessionEntries([lesson, chat()], [EIGEN_PLAN], TODAY)[0]!.plan, EIGEN_PLAN);
		assert.equal(sessionEntries([chat()], [EIGEN_PLAN], TODAY)[0]!.plan, null);
	});
});

describe("how an attempt went", () => {
	it("says right, partly or wrong (never missed, which reads as skipped), and the one thing worth saying about it", () => {
		assert.deepEqual(attemptMark(attempt(), titleOf), { result: "right", words: null });
		assert.deepEqual(attemptMark(attempt({ result: "partial", unaided: false }), titleOf), { result: "partly", words: "With a hint" });
		assert.deepEqual(attemptMark(attempt({ result: "incorrect", sure: "confident", unaided: false }), titleOf), { result: "wrong", words: "Sure, but wrong" });
		assert.deepEqual(attemptMark(attempt({ result: "incorrect", sure: "confident", unaided: false, chose: "cramer" }), titleOf), { result: "wrong", words: "Mixed up with Cramer's rule" });
	});
});

describe("the facts a candidate draws", () => {
	it("are silent where the engine is, and fold the topic read in", () => {
		const facts = topicFacts({ course: COURSE, topic: TOPICS.eigen, chats: [], read: null });
		assert.deepEqual([facts.standing?.words, facts.marks, facts.studied, facts.mistake, facts.standing?.fill], ["Not started", [], null, null, 0]);
		const waiting = topicFacts({ course: COURSE, topic: TOPICS.eigen, chats: [chat({ topics: ["eigen"], pendingQuestion: true })], read: null });
		assert.deepEqual([waiting.standing, waiting.marks, waiting.studied], [null, [], null]);
		const rank = topicFacts({
			course: COURSE,
			topic: TOPICS.rank,
			chats: [],
			read: { record: { attempts: [attempt({ date: "2026-11-03" })], tasks: [{ key: "sheet-4", updated: "2026-11-06" }] }, plans: [] },
		});
		assert.deepEqual([rank.studied, rank.attempts.length, rank.pickups.map((p) => p.when)], ["Studied 5 days ago", 1, ["2d ago"]]);
	});
});

describe("why a held review waits", () => {
	const held = { kind: "scheduled" as const, date: "2026-11-12", held: true as const };
	const others = [
		{ course: "Linear Algebra", date: "2026-12-03" },
		{ course: "Probability", date: "2026-11-19" },
		{ course: "Old course", date: "2026-10-01" },
	];
	it("names the nearer exams it waits for: those ahead, before the course's own", () => {
		assert.equal(waitsWords(held, "2026-11-30", others, "2026-11-08"), "Waits for a nearer exam: Probability on Thu 19 Nov");
	});
	it("names every exam ahead for a course with none of its own, nearest first", () => {
		assert.equal(waitsWords(held, null, others, "2026-11-08"), "Waits for your exams: Probability on Thu 19 Nov and Linear Algebra on Thu 3 Dec");
	});
	it("lists two exams or more as a sentence", () => {
		assert.equal(heldExamWords([{ course: "Probability", day: "Thu 19 Nov" }, { course: "Calculus I", day: "Mon 30 Nov" }, { course: "Logic", day: "Fri 4 Dec" }]), "Probability on Thu 19 Nov, Calculus I on Mon 30 Nov and Logic on Fri 4 Dec");
	});
	it("says nothing for a review the plan does not hold, and only the words with no exam to name", () => {
		assert.equal(waitsWords({ kind: "scheduled", date: "2026-11-12" }, null, others, "2026-11-08"), null);
		assert.equal(waitsWords(held, null, [], "2026-11-08"), "Waits for your exams");
	});
});
