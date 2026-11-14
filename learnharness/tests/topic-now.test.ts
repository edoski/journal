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
import { buildInbox } from "../components/unit-inbox/units.ts";
import { chat, LINALG, TODAY } from "./fixtures/now-demo.ts";

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
		const found = searchInbox(buildInbox([], [older, newer], null), [older, newer], "total prob", []);
		assert.deepEqual(found.sessions.map((c) => c.id), ["chat_b", "chat_a"]);
	});
});
