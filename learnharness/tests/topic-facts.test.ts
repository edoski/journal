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
import { slipOf } from "../components/unit-inbox/units.ts";
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
} from "../components/unit-inbox/topic-page/topic-facts.ts";

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
		signals: { ...QUIET, gap: "Treats pairwise non-parallel vectors as independent; misses a third vector in their span", mistake: true, confidentErrors: 1 },
	}),
	basis: topic("basis", { title: "Basis and dimension", level: "independent", introduced: "2026-10-20", review: due("2026-10-30", 9), tasks: ["sheet-4"] }),
	matmul: topic("matmul", { title: "Matrix multiplication as composition", level: "independent", introduced: "2026-10-27", review: due("2026-11-06", 2), weak: true, signals: { ...QUIET, lapsed: true, mistake: true } }),
	elimination: topic("elimination", { title: "Gaussian elimination", level: "assisted", introduced: "2026-10-20", review: due("2026-11-06", 2), weak: true, signals: { ...QUIET, choiceErrors: { cramer: 1 }, mistake: true } }),
	rank: topic("rank", {
		title: "Rank and the column space",
		level: "assisted",
		introduced: "2026-10-30",
		review: due("2026-11-05", 3),
		weak: true,
		signals: { ...QUIET, gap: "Counts nonzero entries instead of pivots; confuses rank with the number of rows", mistake: true, stale: true },
		tasks: ["sheet-4"],
	}),
	kernel: topic("kernel", { title: "Kernel and rank-nullity", level: "attempted", introduced: "2026-11-06", review: due("2026-11-07", 1), weak: true, signals: { ...QUIET, confidentErrors: 1, mistake: true }, tasks: ["sheet-4"] }),
	determinant: topic("determinant", { title: "Determinants as volume scaling", level: "assisted", introduced: "2026-11-03", review: due("2026-11-04", 4) }),
	cramer: topic("cramer", { title: "Cramer's rule", level: "introduced", introduced: "2026-11-05", review: due("2026-11-06", 2) }),
	eigen: topic("eigen", { title: "Eigenvalues and eigenvectors" }),
	riemann: topic("riemann-sums", { title: "Riemann sums", level: "retained", introduced: "2026-10-11", review: due("2026-11-08", 0), weak: true, signals: { ...QUIET, lapsed: true, mistake: true } }),
	chain: topic("chain-rule", { title: "Chain rule", level: "retained", introduced: "2026-09-11", review: due("2026-10-09", 30), weak: true, signals: { ...QUIET, lapsed: true, mistake: true } }),
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
		ownTopics: over.topics ?? [],
		busy: false,
		...over,
	};
}

function attempt(over: Partial<TopicAttempt> = {}): TopicAttempt {
	return { id: "o1", date: "2026-11-03", recorded: null, result: "correct", unaided: true, grade: null, gaveUp: false, predicted: false, sure: null, chose: null, text: "Counted pivots of a 3x4 matrix", session: null, uncertain: false, ...over };
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
		// Round 10 (1 m7): Eigen's page led with the review closed on 9 Nov as "Resume · Left off today".
		const closedReview = chat({ title: "Review Vectors and linear combinations", topics: ["vectors"], ended: "left" });
		assert.equal(topicAction(TOPICS.vectors, MAP, [closedReview]).kind, "study", "a review left for next time waits for its review day");
		const left = chat({ title: "Review Span", topics: ["span"], ended: "left" });
		const back = topicAction(TOPICS.span, MAP, [left]);
		assert.ok(back.kind === "review" && "chat" in back && back.chat === left, "on its review day the review he left is the one it opens");
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

	// Round 10, 2 M1: Now read "Due since 6 Nov, back 11 Nov · Study", and
	// Study posted the bare title, so the review became a lesson.
	it("opens a review memory asked for, held by the plan to a later day, as that review", () => {
		const held = { ...TOPICS.vectors, review: { kind: "scheduled" as const, date: "2026-11-11", held: { exam: null, since: "2026-11-06" } } };
		assert.deepEqual(topicAction(held, MAP, []), { kind: "study", opening: "Review Vectors and linear combinations" });
		const heldFromToday = { ...held, review: { ...held.review, held: { exam: null, since: TODAY } } };
		assert.deepEqual(topicAction(heldFromToday, MAP, []), { kind: "study", opening: "Review Vectors and linear combinations" });
		const notYet = { ...held, review: { ...held.review, held: { exam: null, since: "2026-11-09" } } };
		assert.deepEqual(topicAction(notYet, MAP, []), { kind: "study", opening: "Vectors and linear combinations" }, "memory's day still ahead: a lesson");
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
			[TOPICS.rank, "Not right last time. Mistake to fix. Due since 5 Nov"],
			[TOPICS.matmul, "Slipping. Not right last time. Due since 6 Nov"],
			[TOPICS.span, "On your own. Due since 29 Oct"],
			[TOPICS.vectors, "On your own. Back Fri 13 Nov"],
			[TOPICS.cramer, "Taught, not tried. Due since 6 Nov"],
			[TOPICS.riemann, "Slipping. Not right last time. Due today"],
			[TOPICS.elimination, "Not right last time. Mixed up with Cramer's rule. Due since 6 Nov"],
			[TOPICS.kernel, "Tried, not right yet. Sure, but wrong. Due since 7 Nov"],
			[TOPICS.basis, "On your own. Due since 30 Oct"],
			[TOPICS.independence, "Not right last time. Mistake to fix. Due since 23 Oct"],
			[TOPICS.chain, "Slipping. Not right last time. Due since 9 Oct"],
			[TOPICS.eigen, "Not started"],
		];
		const said = (t: CourseMapTopic) => [topicFacts({ course: COURSE, topic: t, chats: [], read: null }).standing!.words, ...headMarks(t, titleOf, TODAY).map((mark) => mark.words)].join(". ");
		for (const [t, words] of lines) assert.equal(said(t), words, t.handle);
	});

	it("gives why it needs him and its review as marks of their own kind", () => {
		assert.deepEqual(headMarks(TOPICS.elimination, titleOf, TODAY), [
			{ kind: "slip", words: "Mixed up with Cramer's rule", slip: "mixed" },
			{ kind: "review", words: "Due since 6 Nov" },
		]);
		assert.deepEqual(headMarks(TOPICS.matmul, titleOf, TODAY), [
			{ kind: "slip", words: "Not right last time", slip: "lapsed" },
			{ kind: "review", words: "Due since 6 Nov" },
		], "a lapse is the slip beside Slipping");
		assert.deepEqual(headMarks({ ...TOPICS.cramer, review: null }, titleOf, TODAY), []);
	});

	it("says Slipping only on a topic he is losing, and a fixed miss on a topic still being learned in its standing alone (round 11, 3 N1)", () => {
		const kernel = { ...TOPICS.kernel, right: "unaided" as const, review: null, signals: { ...QUIET, confidentErrors: 2, repaired: true } };
		const said = (t: CourseMapTopic) => [topicFacts({ course: COURSE, topic: t, chats: [], read: null }).standing!.words, ...headMarks(t, titleOf, TODAY).map((mark) => mark.words)].join(". ");
		assert.equal(said(kernel), "Right on your own, check another day");
		assert.equal(said({ ...TOPICS.matmul, review: null }), "Slipping. Not right last time");
		assert.equal(slipOf(MAP, kernel), null, "nothing open: the sidebar says no slip beside it either");
	});

	it("is silent for a topic not started that already has a session", () => {
		const facts = topicFacts({ course: COURSE, topic: TOPICS.eigen, chats: [chat({ topics: ["eigen"], pendingQuestion: true })], read: null });
		assert.deepEqual([facts.standing, facts.marks], [null, []]);
	});

	it("says a topic still being learned is due, as its action does, and dates a later review", () => {
		assert.deepEqual(headMarks(TOPICS.determinant, titleOf, TODAY), [{ kind: "review", words: "Due since 4 Nov" }]);
		assert.deepEqual(headMarks({ ...TOPICS.determinant, review: null }, titleOf, TODAY), []);
		assert.deepEqual(headMarks({ ...TOPICS.determinant, review: { kind: "scheduled", date: "2026-11-09" } }, titleOf, TODAY), [{ kind: "review", words: "Back Mon 9 Nov" }]);
	});
});

describe("the page's words for time", () => {
	const row = (days: number): TodayRow => {
		const at = new Date(`${COURSE.map.today}T12:00:00`);
		at.setDate(at.getDate() - days);
		return { kind: "session", course: COURSE, chat: { id: "c", title: "Lesson", kind: "teach", createdAt: at.toISOString(), updatedAt: at.toISOString(), messageCount: 2, phase: "teach", pendingQuestion: true, pendingProblem: false, busy: false } };
	};

	it("are Home's, for every day from today to more than a year back", () => {
		for (let days = 0; days <= 400; days++) assert.equal(agoWords(days, COURSE.map.today), studiedAgo(row(days)), `ago ${days}`);
	});

	it("say the day he last studied the topic, never a count of days (round 9, 2 m5)", () => {
		assert.deepEqual([0, 1, 2, 13, 60].map((days) => studiedWords(days, "2026-11-08")), ["Studied today", "Studied yesterday", "Studied 6 Nov", "Studied 26 Oct", "Studied 9 Sept"]);
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
	const entries = (...days: string[]) => sessionEntries(days.map((day) => chat({ updatedAt: `${day}T10:00:00.000Z` })), [], TODAY, "rank");

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
		assert.equal(topicFacts({ course: COURSE, topic: TOPICS.cramer, chats: [], read: null }).studied, "Studied 5 Nov");
	});

	it("dates a session by its local day, never after the engine's", () => {
		const late = new Date(2026, 10, 6, 23, 30).toISOString();
		assert.equal(localDay(late), "2026-11-06");
		const [entry] = sessionEntries([chat({ updatedAt: late })], [], TODAY, "rank");
		assert.deepEqual([entry!.day, entry!.when], ["2026-11-06", "6 Nov"]);
		const [later] = sessionEntries([chat({ updatedAt: "2026-11-12T10:00:00.000Z" })], [], TODAY, "rank");
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

	it("never quotes a prediction, which counts for nothing (round 7: a wrong guess before the teaching read as the mistake)", () => {
		const guess = attempt({ id: "o12", result: "incorrect", predicted: true, text: "Read the eigenvalues off the diagonal" });
		assert.equal(mistakeOf(TOPICS.matmul, [guess, missed]), "Multiplied a 2x3 by a 3x2 matrix and gave a 3x3 result", "the newest answer that counts");
		assert.equal(mistakeOf(TOPICS.matmul, [guess, attempt()]), null, "the newest answer that counts was right");
	});

	it("is nothing for a topic the engine does not call weak, even after a miss", () => {
		assert.equal(mistakeOf(TOPICS.span, [missed]), null);
	});

	it("is nothing once he fixed it on his own, so it never sits under 'Check again another day' as a mistake still open", () => {
		const gap = "Forgot why det(A - lambda I) = 0 and guessed the reason backwards";
		const fixed = topic("eigen", { level: "assisted", weak: true, signals: { ...QUIET, gap, repaired: true } });
		assert.deepEqual(headMarks(fixed, (x) => x, TODAY).map((mark) => mark.words), [], "its standing says it: Right on your own, check another day");
		assert.equal(mistakeOf(fixed, [missed]), null);
		const helped = topic("eigen", { level: "assisted", weak: true, signals: { ...QUIET, gap, repaired: true, repairedWithHelp: true } });
		assert.equal(mistakeOf(helped, [missed]), gap, "help may have carried the right answer: still a mistake to fix");
	});
});

describe("when a topic comes up", () => {
	const factsOf = (t: CourseMapTopic) => topicFacts({ course: { ...COURSE, map: { ...COURSE.map, topics: [...COURSE.map.topics, t] } }, topic: t, chats: [], read: null });

	it("says why the plan starts a topic not started then, in a course without arcs too", () => {
		const early = topic("inner-product", { title: "Inner products", starts: "2026-11-15", startsWhy: { kind: "early", waitingOn: [h("rank")], exam: false } });
		assert.equal(COURSE.map.arcs ?? null, null, "a course without arcs");
		assert.deepEqual(factsOf(early).startsWhy, { kind: "early", words: "Early, ahead of its place, while earlier topics wait on Rank and the column space" });
		const after = topic("projection", { title: "Projection", starts: "2026-11-16", startsWhy: { kind: "after", needs: [h("rank")], partners: [] } });
		assert.equal(factsOf(after).startsWhy?.words, "After Rank and the column space, which it needs");
	});

	it("says nothing for plain next in a course without arcs, which would only name the course", () => {
		const next = topic("projection", { starts: "2026-11-16", startsWhy: { kind: "next" } });
		assert.equal(factsOf(next).startsWhy, null);
	});

	it("says what the exam means for a topic its plan has no room for, before any other reason (round 7: Variance, Poisson and Random variables never mentioned the exam)", () => {
		const exam = { date: "2026-11-19", daysLeft: 2, doesNotFit: [h("variance")], unreviewed: [h("poisson"), h("bayes")], reasons: { variance: "not_ready", poisson: "too_late", bayes: "full" } as const };
		const examOf = (t: CourseMapTopic) => topicFacts({ course: { ...COURSE, map: { ...COURSE.map, exam, topics: [...COURSE.map.topics, t] } }, topic: t, chats: [], read: null });
		const variance = examOf(topic("variance", { starts: "2026-12-13", startsAfter: ["Linear Algebra"], startsWhy: { kind: "after", needs: [h("expectation")], partners: [] } }));
		assert.equal(variance.startsWhy?.words, "Not before the exam, what it needs won’t be solid in time");
		assert.equal(variance.starts?.waits, null, "the exam is why, not another course");
		assert.equal(examOf(topic("poisson", { starts: "2026-11-18", startsWhy: { kind: "next" } })).startsWhy?.words, "No room in the final review, it starts too close to the exam");
		const bayes = topic("bayes", { level: "independent", introduced: "2026-10-01", review: { kind: "scheduled", date: "2026-12-15", held: { exam: null, since: "2026-11-11" } } });
		assert.equal(examOf(bayes).waits, "No room in the final review at your pace");
	});

	it("never says a topic has no review before the exam beside a review day before it (round 9, 2 M1: Binomial read Review Wed 11 Nov, No review before the exam)", () => {
		const exam = { date: "2026-11-19", daysLeft: 11, unreviewed: [h("binomial")], reasons: { binomial: "full" } as const };
		const binomial = topic("binomial", { level: "assisted", introduced: "2026-11-01", review: { kind: "scheduled", date: "2026-11-11" } });
		const facts = topicFacts({ course: { ...COURSE, map: { ...COURSE.map, exam, topics: [...COURSE.map.topics, binomial] } }, topic: binomial, chats: [], read: null });
		assert.ok(binomial.review?.kind === "scheduled" && binomial.review.date < exam.date, "its review comes before the exam");
		assert.doesNotMatch(facts.waits ?? "", /No review before the exam/);
		assert.equal(facts.waits, "No room in the final review at your pace");
	});

	it("names the final review's first day beside a review before it (round 11 integration: Binomial read Review today and No room in the final review)", () => {
		const exam = { date: "2026-11-19", daysLeft: 11, finalReview: "2026-11-13", unreviewed: [h("binomial")], reasons: { binomial: "full" } as const };
		const binomial = topic("binomial", { level: "assisted", introduced: "2026-11-01", review: { kind: "scheduled", date: "2026-11-11" } });
		const facts = topicFacts({ course: { ...COURSE, map: { ...COURSE.map, exam, topics: [...COURSE.map.topics, binomial] } }, topic: binomial, chats: [], read: null });
		assert.equal(facts.waits, "No room in the final review from 13 Nov at your pace");
	});

	it("says from which told day a review or a start moved and what of his study moved it", () => {
		const moved = topic("eigen", { level: "independent", introduced: "2026-11-01", review: { kind: "scheduled", date: "2026-11-11", held: { exam: null, since: "2026-11-09" } }, moved: { from: "2026-11-10", by: "study", courses: ["Probability"], day: "today" as const } });
		assert.equal(factsOf(moved).waits, "Moved from 10 Nov after your Probability study today");
		const start = topic("projection", { starts: "2026-11-20", startsAfter: ["Probability"], moved: { from: "2026-11-14", by: "left" } });
		assert.equal(factsOf(start).starts?.waits, "Moved from 14 Nov, yesterday's plan was not finished");
	});

	it("says why a review waits for an exam, and since when once memory's day has passed, never that earlier days are full (round 11: words that explain a day he never saw)", () => {
		const moved = topic("series", { level: "independent", introduced: "2026-11-01", review: { kind: "scheduled", date: "2026-11-22", held: { exam: null, since: "2026-11-09" } } });
		assert.equal(factsOf(moved).waits, null, "memory's day still ahead was never told him (round 8), so nothing explains the wait");
		const passed = topic("series", { level: "independent", introduced: "2026-10-01", review: { kind: "scheduled", date: "2026-11-22", held: { exam: null, since: "2026-11-02" } } });
		assert.equal(factsOf(passed).waits, "Due since 2 Nov");
		const late = topic("series", { level: "independent", introduced: "2026-09-01", review: { kind: "scheduled", date: "2026-11-13", held: { exam: "Probability", since: "2026-10-02" } } });
		assert.equal(factsOf(late).waits, "Due since 2 Oct, waits for your Probability exam");
	});
});

describe("where to pick the topic back up", () => {
	const record: TopicRecord = { attempts: [], tasks: [{ key: "sheet-4", updated: "2026-11-06" }] };
	const pickups = (t: CourseMapTopic, chats: ChatListItem[], plans: SessionPlan[] = []) => {
		const sessions = chats.map((c) => (c.ownTopics?.includes(t.handle) ? c : { ...c, ownTopics: [...(c.ownTopics ?? []), t.handle] }));
		return pickupsOf(t, MAP, sessionEntries(sessions, plans, TODAY, t.handle), sessions, record, TODAY);
	};

	it("puts a lesson waiting on a step at that step", () => {
		const lesson = chat({ id: "chat_eigen", title: "Eigenvalues and eigenvectors", pendingQuestion: true, updatedAt: "2026-11-08T09:00:00.000Z", ownTopics: ["eigen"] });
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
				["session", "Rank practice", "Problem waiting", "1 Nov"],
				["task", SHEET.title, SHEET.step, "6 Nov"],
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
				[old.id, "finished", "20 Oct"],
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
		assert.equal(sessionEntries([lesson, chat()], [EIGEN_PLAN], TODAY, "rank")[0]!.plan, EIGEN_PLAN);
		assert.equal(sessionEntries([chat()], [EIGEN_PLAN], TODAY, "rank")[0]!.plan, null);
	});
});

describe("how an attempt went", () => {
	it("says right, partly or wrong (never missed, which reads as skipped), and the one thing worth saying about it", () => {
		assert.deepEqual(attemptMark(attempt(), titleOf), { result: "right", words: null });
		assert.deepEqual(attemptMark(attempt({ result: "partial", unaided: false }), titleOf), { result: "partly", words: "With help" });
		assert.deepEqual(attemptMark(attempt({ grade: "helped", sure: "guess" }), titleOf), { result: "right", words: null }, "a guess with no help was his own answer");
		assert.deepEqual(attemptMark(attempt({ grade: "solid" }), titleOf), { result: "right", words: null });
		assert.deepEqual(attemptMark(attempt({ grade: "helped", uncertain: true }), titleOf), { result: "right", words: "Not yet confirmed" }, "the engine doubts it: not his own yet (round 7)");
		assert.deepEqual(attemptMark(attempt({ result: "incorrect", gaveUp: true, unaided: false }), titleOf), { result: "wrong", words: "Gave up" });
		assert.deepEqual(attemptMark(attempt({ result: "incorrect", predicted: true, sure: "confident" }), titleOf), { result: "wrong", words: "Prediction, not counted" });
		assert.deepEqual(attemptMark(attempt({ result: "incorrect", unaided: false }), titleOf), { result: "wrong", words: "Not right" }, "every result not right says so (round 12, 1 m12)");
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
		assert.deepEqual([rank.studied, rank.attempts.length, rank.pickups.map((p) => p.when)], ["Studied 3 Nov", 1, ["6 Nov"]]);
	});
});
