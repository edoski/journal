/**
 * Home's clock says what it counts, so it never reads as a second status
 * beside the line's reason (round 8, 1 D8: "7d ago · Planned today").
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { todayRows } from "../components/study-home/study-facts.ts";
import { studiedLabel, whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { COURSE, LA, LEFT, TODAY, chat, map, topic } from "./fixtures/round8-home.ts";

describe("Home's clock (1 D8)", () => {
	it("says what it counts, so it never reads as a second status beside the reason", () => {
		const planned: StudyCourse = { ...COURSE, due: [], newToday: ["rank" as TopicHandle], lastActiveDaysAgo: 7, map: map({ topics: [topic("rank", "Rank", { level: "new", introduced: null })] }) };
		const [row] = todayRows([planned], [], TODAY);
		assert.deepEqual([studiedLabel(row!), whyOf(row!)?.short], [null, "Planned today"]);
	});

	it("dates only a line with its own session, never a topic by its course's last study (round 9, 1 D5)", () => {
		const planned: StudyCourse = { ...COURSE, due: [], newToday: ["rank" as TopicHandle], lastActiveDaysAgo: 0, map: map({ topics: [topic("rank", "Rank", { level: "new", introduced: null })] }) };
		assert.equal(studiedLabel(todayRows([planned], [], TODAY)[0]!), null, "no Studied today on a topic never studied");
		assert.equal(studiedLabel(todayRows([{ ...COURSE, lastActiveDaysAgo: 0 }], [], TODAY)[0]!), null, "a review row is about its topics, not the course");
		const waiting = chat({ id: "w", pendingQuestion: true, topics: ["rank"], ownTopics: ["rank"], updatedAt: new Date(2026, 10, 8, 10).toISOString(), course: LA });
		const row = todayRows([COURSE], [waiting, LEFT], TODAY).find((r) => r.kind === "session" && r.chat.id === "w")!;
		assert.equal(studiedLabel(row), "Studied yesterday");
	});
});
