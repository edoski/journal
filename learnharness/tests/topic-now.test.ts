/**
 * A topic reads the same in search as on its page and on Today's top
 * (round 6, visual polish: Eigenvalues read "Back in 1d" in search while
 * the sidebar and Home said "Your turn"). The shelves keep their own rule:
 * a lesson belongs to no topic until its plan names one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nowOf, unitStatus } from "../components/unit-inbox/units.ts";
import { searchInbox } from "../components/unit-inbox/unit-sidebar.tsx";
import { filterSessions } from "../components/sidebar-state.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import { chat, LINALG, PROB, TODAY, topic } from "./fixtures/now-demo.ts";
import type { StudyCourse } from "../src/core/index.ts";

const la = { workspace: LINALG.map.workspace, title: LINALG.map.title };

describe("a topic in search", () => {
	it("reads Your turn when a lesson tied to it waits, though the lesson names no topic of its own", () => {
		const free = chat("chat_free", { title: "Let's start eigenvalues", course: la, topics: ["eigen"], ownTopics: [], pendingQuestion: true, updatedAt: `${TODAY}T09:00:00.000Z` });
		assert.equal(nowOf([free], "eigen"), null, "the shelves' rule stands");
		const found = searchInbox(buildInbox([LINALG], [free], null), [free], "Eigen", [LINALG]);
		const eigen = found.units.find((u) => u.topic.handle === "eigen")!;
		assert.deepEqual(unitStatus(eigen, TODAY), { kind: "your-turn" });
	});
});

describe("search's sessions", () => {
	it("come newest first, however closely each title matches", () => {
		const older = chat("chat_a", { title: "Total probability practice", updatedAt: "2026-10-10T09:00:00.000Z" });
		const newer = chat("chat_b", { title: "Probability review, total", updatedAt: "2026-10-25T09:00:00.000Z" });
		const found = searchInbox(buildInbox([], [older, newer], null), [older, newer], "prob", []);
		assert.deepEqual(found.sessions.map((c) => c.id), ["chat_b", "chat_a"]);
	});
});

describe("search's ranking", () => {
	it("matches the starts of a title's words: a title that starts with the query outranks a later word that does", () => {
		const later = chat("chat_s", { title: "Rank practice" });
		const start = chat("chat_p", { title: "Probability" });
		assert.deepEqual(filterSessions([later, start], "pr").map((c) => c.id), ["chat_p", "chat_s"]);
		assert.deepEqual(filterSessions([later, start], "rnk"), [], "never scattered letters (round 16, m29)");
	});

	it("lists only titles that hold the word, and Enter opens the topic named (round 16, m29)", () => {
		const prob: StudyCourse = { ...PROB, map: { ...PROB.map, topics: [...PROB.map.topics, topic("poisson", "Poisson distribution", "new")] } };
		const linalg: StudyCourse = { ...LINALG, map: { ...LINALG.map, topics: [...LINALG.map.topics, topic("matmul", "Matrix multiplication as composition", "new")] } };
		const comp = chat("chat_m", { title: "Matrix multiplication as composition" });
		const found = searchInbox(buildInbox([prob, linalg], [comp], null), [comp], "Poisson", [prob, linalg]);
		assert.deepEqual(found.units.map((u) => u.topic.title), ["Poisson distribution"], "Matrix multiplication as composition held P, o, i, s, s, o, n in order, and was listed");
		assert.deepEqual(found.sessions, []);
		assert.equal(found.top, found.units[0]!.key, "Enter opens the Poisson topic");
	});
});
