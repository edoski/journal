/**
 * Builds on says how ready each topic it builds on is, in its pie's
 * standing words, never a session's status (round 14, m38: 2 n5 and 3's
 * round-13 table, "Basis and dimension · Your turn" and "Rank and the
 * column space · Your turn" under Builds on said nothing of either's
 * readiness).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { standingOf } from "../components/course-map/topic-map/topic-standing.ts";

const TODAY = "2026-11-08";
const WORKSPACE = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: handle as TopicHandle, title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });

const BASIS = topic("basis", { title: "Basis and dimension", level: "retained", introduced: "2026-10-20", review: { kind: "scheduled", date: "2026-11-20" } });
const EIGEN = topic("eigen", { title: "Eigenvalues and eigenvectors", level: "attempted", introduced: "2026-11-06" });
const DIAG = topic("diag", { title: "Diagonalization", starts: "2026-11-17" });
const MAP: CourseMap = {
	workspace: WORKSPACE, title: "Linear Algebra", today: TODAY, revision: 1, exam: null, current: "eigen" as TopicHandle, focus: null, tasks: [],
	topics: [BASIS, EIGEN, DIAG],
	edges: [
		{ kind: "needs", prerequisite: "basis" as TopicHandle, topic: "diag" as TopicHandle },
		{ kind: "needs", prerequisite: "eigen" as TopicHandle, topic: "diag" as TopicHandle },
	],
};
const waiting = (id: string, handle: string): ChatListItem => ({
	id, title: handle, createdAt: `${TODAY}T08:00:00.000Z`, updatedAt: `${TODAY}T08:30:00.000Z`, kind: "teach", messageCount: 6, phase: "teach",
	pendingQuestion: true, pendingProblem: false, course: { workspace: WORKSPACE, title: "Linear Algebra" }, topics: [handle], ownTopics: [handle], busy: false,
});

describe("Builds on (m38)", () => {
	it("gives each topic its standing words while a session on it waits on him", () => {
		const chats = [waiting("c-basis", "basis"), waiting("c-eigen", "eigen")];
		const facts = topicFacts({ course: { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 }, topic: DIAG, chats, read: { record: null, plans: [] } });
		assert.deepEqual(
			facts.builds.map((b) => [b.topic.handle, b.words]),
			[
				["basis", standingOf(BASIS).words],
				["eigen", standingOf(EIGEN).words],
			],
		);
		assert.ok(facts.builds.every((b) => b.words !== "Your turn"), "never a session's status");
	});
});
