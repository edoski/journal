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
		assert.deepEqual([studiedLabel(row!), whyOf(row!)?.short], ["Studied 7d ago", "Planned today"]);
		assert.equal(studiedLabel(todayRows([{ ...COURSE, lastActiveDaysAgo: 1 }], [], TODAY)[0]!), "Studied yesterday");
		assert.equal(studiedLabel(todayRows([{ ...COURSE, lastActiveDaysAgo: 0 }], [], TODAY)[0]!), "Studied today");
	});
});
