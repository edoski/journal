/**
 * The topic's history by day (Pick up's Earlier): the topic's sessions and
 * the engine's scored attempts on one dated line, newest first. Rank's
 * record is the seeded demo's own (fixtures/topic), read through the
 * topic read's own parser.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";
import type { TopicAttempt } from "../src/core/contracts/topic.ts";
import { topicRecordOf } from "../src/server/topic.ts";
import { topicFacts, type TopicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { trailDays } from "../components/unit-inbox/topic-page/trail/trail-facts.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: handle as TopicHandle, title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const RANK = topic("rank", {
	title: "Rank and the column space",
	level: "assisted",
	introduced: "2026-10-30",
	review: { kind: "due", date: "2026-11-05", overdue: 3 },
	weak: true,
	signals: { ...QUIET, gap: "Counts nonzero entries instead of pivots" },
	tasks: ["sheet-4"],
});
const SPAN = topic("span", { title: "Span", level: "retained", introduced: "2026-10-16", review: { kind: "due", date: "2026-10-29", overdue: 10 } });
const EIGEN = topic("eigen", { title: "Eigenvalues and eigenvectors" });
const INVERTIBILITY = topic("invertibility", { title: "Invertibility" });
const CRAMER = topic("cramer", { title: "Cramer's rule" });
const MAP: CourseMap = {
	workspace: WORKSPACE,
	title: "Linear Algebra",
	today: TODAY,
	revision: 13,
	exam: null,
	current: "rank" as TopicHandle,
	focus: "sheet-4",
	tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Part (c)", updated: null }],
	topics: [RANK, SPAN, EIGEN, INVERTIBILITY, CRAMER],
	edges: [],
};
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };

function chat(id: string, title: string, updatedAt: string, over: Partial<ChatListItem> = {}): ChatListItem {
	return {
		id,
		title,
		createdAt: updatedAt,
		updatedAt,
		kind: "teach",
		messageCount: 6,
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

/** Rank's three seeded sessions, newest first, and its two seeded attempts. */
const RANK_SESSIONS = [
	chat("chat_demo_rank", "Rank practice", "2026-11-08T07:54:30.000Z", { kind: "practice", pendingProblem: true, topics: ["rank"] }),
	chat("chat_demo_rank_take2", "Rank, second pass", "2026-11-03T14:32:01.000Z", { topics: ["rank"] }),
	chat("chat_demo_rank_take1", "Rank and the column space", "2026-10-30T16:45:01.000Z", { topics: ["rank"] }),
];
const RANK_RECORD = topicRecordOf(fixture("show.rank+task.json"), "rank", ["sheet-4"]);

const attempt = (id: string, date: string, over: Partial<TopicAttempt> = {}): TopicAttempt => ({
	id,
	date,
	recorded: `${date}T17:00:00.000Z`,
	result: "correct",
	unaided: true,
	grade: "solid",
	gaveUp: false,
	predicted: false,
	sure: null,
	chose: null,
	text: `Attempt ${id}`,
	...over,
});

const factsOf = (t: CourseMapTopic, sessions: ChatListItem[] = [], read: Parameters<typeof topicFacts>[0]["read"] = null): TopicFacts =>
	topicFacts({ course: COURSE, topic: t, chats: sessions.map((c) => ((c.topics ?? []).includes(t.handle) ? c : { ...c, topics: [...(c.topics ?? []), t.handle] })), read });
const line = (facts: TopicFacts) => trailDays(facts.sessions, facts.attempts, facts.today);

describe("the trail's days", () => {
	it("put Rank's sessions and attempts on three days, newest first, each session before the attempts of its day", () => {
		const days = line(factsOf(RANK, RANK_SESSIONS, { record: RANK_RECORD, plans: [] }));
		assert.deepEqual(
			days.map((day) => [day.label, day.sessions.map((entry) => entry.chat.title), day.attempts.map((a) => a.text)]),
			[
				["Today", ["Rank practice"], []],
				["Tue 3 Nov", ["Rank, second pass"], ["Row-reduced a 3x3 matrix and counted pivots, slipping once on a sign"]],
				["Fri 30 Oct", ["Rank and the column space"], ["Gave rank 3 for a 3x4 matrix whose third row is the sum of the first two"]],
			],
		);
	});

	it("keep a day that has only attempts and a day that has only a session", () => {
		const sessions = [chat("chat_a", "A lesson", "2026-11-07T10:00:00.000Z", { topics: ["span"] })];
		const days = line(factsOf(SPAN, sessions, { record: { attempts: [attempt("o9", "2026-11-05")], tasks: [] }, plans: [] }));
		assert.deepEqual(
			days.map((day) => [day.label, day.sessions.length, day.attempts.length]),
			[
				["Yesterday", 1, 0],
				["Thu 5 Nov", 0, 1],
			],
		);
	});

	it("order a day's sessions by their last message and its attempts by when the engine recorded them, then by id", () => {
		const sessions = [
			chat("chat_early", "Early", "2026-11-06T08:00:00.000Z", { topics: ["span"] }),
			chat("chat_late", "Late", "2026-11-06T20:00:00.000Z", { topics: ["span"] }),
		];
		const attempts = [
			attempt("o9", "2026-11-06", { recorded: "2026-11-06T09:00:00.000Z" }),
			attempt("o12", "2026-11-06", { recorded: "2026-11-06T18:00:00.000Z" }),
			attempt("o10", "2026-11-06", { recorded: "2026-11-06T09:00:00.000Z" }),
		];
		const [day] = trailDays(factsOf(SPAN, sessions).sessions, attempts, TODAY);
		assert.deepEqual(day!.sessions.map((entry) => entry.chat.title), ["Late", "Early"]);
		assert.deepEqual(day!.attempts.map((a) => a.id), ["o12", "o10", "o9"]);
	});

});
