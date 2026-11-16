/**
 * Round 14, m33 (4 free): Rank's sidebar card read "Left off today" after
 * the Rank close, then "Left off 6 Nov", Problem sheet 4's day, half an hour
 * later. In between he sent his working in Rank practice and its next turn
 * was cut off, then finished: a session cut off did not speak for its own
 * topic, and an open task's older day outranked his study since.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unitStatus } from "../components/unit-inbox/units.ts";
import { unitFor } from "../components/unit-inbox/now-inbox.ts";
import { chat, map, topic } from "./fixtures/now-demo.ts";
import type { StudyCourse } from "../src/core/index.ts";

const rank = topic("rank", "Rank and the column space", "assisted", { tasks: ["sheet-4"] });
const course: StudyCourse = { map: map({ workspace: "/s/la", title: "Linear Algebra", today: "2026-11-08", topics: [rank], tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: null, updated: "2026-11-06", topics: ["rank"] } as never] }), unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };
const practice = (over: Parameters<typeof chat>[1]) => chat("rp", { title: "Rank practice", kind: "practice", updatedAt: "2026-11-08T12:10:00.000Z", topics: ["rank"], ownTopics: ["rank"], course: { workspace: "/s/la", title: "Linear Algebra" }, ...over });
const status = (c: ReturnType<typeof chat>) => unitStatus(unitFor(course, rank, [c]), "2026-11-08");

describe("a topic's card after today's study on it (round 14, m33)", () => {
	it("says its own session's reply was cut off, never the task's older day", () => {
		assert.deepEqual(status(practice({ ended: "cut" })), { kind: "stopped", words: "Reply cut off" });
	});

	it("keeps today's study over an open task last changed before it", () => {
		const s = status(practice({ ended: "closed" }));
		assert.notEqual(s.kind, "task", JSON.stringify(s));
	});

	it("still says the task's day when the task changed since", () => {
		assert.deepEqual(status(practice({ ended: "closed", updatedAt: "2026-11-05T12:00:00.000Z" })), { kind: "task", words: "Left off 6 Nov" });
	});
});
