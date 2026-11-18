/**
 * Home's rows carry no clock beside their one status (round 8, 1 D8: "7d
 * ago · Planned today"; round 9, 1 D5: "Studied today" on a topic never
 * studied; round 11, 1 N9 and 1 N12: "Studied today · Mistake to fix · Your
 * turn", and "Studied today" on a session only opened). What he studied
 * today is the line under Home's heading.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { todayRows } from "../components/study-home/study-facts.ts";
import { rowStatus } from "../components/study-home/agenda-rows/row-standing.ts";
import type { TodayRow } from "../components/study-home/study-facts.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { COURSE, LA, LEFT, TODAY, chat, map, topic } from "./fixtures/round8-home.ts";

const words = (row: TodayRow) => {
	const status = rowStatus(row);
	return status?.kind === "why" ? status.why.short : status ? (status.facts.slip?.words ?? status.facts.standing.words) : null;
};

describe("Home's rows (1 D8, 1 D5)", () => {
	it("say the plan's reason alone on a topic he never studied", () => {
		const planned: StudyCourse = { ...COURSE, due: [], newToday: ["rank" as TopicHandle], lastActiveDaysAgo: 0, map: map({ topics: [topic("rank", "Rank", { level: "new", introduced: null })] }) };
		assert.equal(words(todayRows([planned], [], TODAY)[0]!), "Planned today");
	});

	it("give a session waiting on him its reason, never when he last studied it", () => {
		const waiting = chat({ id: "w", pendingQuestion: true, topics: ["rank"], ownTopics: ["rank"], updatedAt: new Date(2026, 10, 8, 10).toISOString(), course: LA });
		const row = todayRows([COURSE], [waiting, LEFT], TODAY).find((r) => r.kind === "session" && r.chat.id === "w")!;
		assert.doesNotMatch(words(row) ?? "", /Studied/);
	});
});
