/**
 * The tutor names a review's day only from the plan, in words it copies
 * (round 3: "tomorrow's eigenvalue review" for a review the plan put on
 * Thursday, and "next time, the rank retest" for one on Saturday).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { plannedDayWords, studyDay, withDayWords } from "../src/core/day-words.ts";
import { RIGHT_WORDS, STANDING_WORDS } from "../components/study-words.ts";

describe("a planned day in words", () => {
	it("says today, tomorrow, or any other day by its date, never a count of days (round 14, m9)", () => {
		assert.equal(plannedDayWords("2026-11-08", "2026-11-08"), "today");
		assert.equal(plannedDayWords("2026-11-09", "2026-11-08"), "tomorrow, Monday 9 November");
		assert.equal(plannedDayWords("2026-11-12", "2026-11-08"), "Thursday 12 November");
		assert.equal(plannedDayWords("2026-11-22", "2026-11-08"), "Sunday 22 November");
		assert.equal(plannedDayWords("2026-12-03", "2026-11-08"), "Thursday 3 December");
		assert.equal(plannedDayWords("2026-11-07", "2026-11-08"), "Saturday 7 November, yesterday");
		assert.equal(plannedDayWords("2026-11-01", "2026-11-08"), "Sunday 1 November");
	});

	it("puts words beside every planned day and start the course tools return, from the output's own today", () => {
		const show = { items: { eigen: { review: { due: "2026-11-09", by: "engine", planned: "2026-11-12" } } } };
		assert.deepEqual(withDayWords(show, "2026-11-08"), {
			items: { eigen: { review: { due: "2026-11-09", by: "engine", planned: "2026-11-12", planned_words: "Thursday 12 November" } } },
		});
		const resume = withDayWords({ today: "2026-11-10", due_later: [{ topic: "rank", planned: "2026-11-11" }] }, "2026-11-08") as { due_later: { planned_words: string }[] };
		assert.equal(resume.due_later[0]!.planned_words, "tomorrow, Wednesday 11 November");
		assert.equal((withDayWords({ items: { t: { starts: "2026-11-15" } } }, "2026-11-08") as { items: { t: { starts_words: string } } }).items.t.starts_words, "Sunday 15 November");
	});

	it("names the day a moved day was told for, so the tutor says it moved without counting", () => {
		const moved = { from: "2026-11-10", by: "study", courses: ["Probability"], day: "today" as const };
		const show = withDayWords({ items: { eigen: { review: { planned: "2026-11-11" }, moved } } }, "2026-11-09") as { items: { eigen: { moved: Record<string, unknown> } } };
		assert.deepEqual(show.items.eigen.moved, { ...moved, from_words: "Tuesday 10 November" });
	});

	it("reads the study day the engine's clock reads", () => {
		assert.equal(studyDay({ LEARNING_TODAY: "2026-11-08" }), "2026-11-08");
		assert.equal(studyDay({}, new Date(2026, 10, 14, 23, 30)), "2026-11-14");
	});
});

describe("what the course doctrine tells the tutor", () => {
	const doctrine = fs.readFileSync(path.join(import.meta.dirname, "../src/agent/prompts/course/10-record.md"), "utf8");

	it("names a review's day only from the plan's words, never from due or a count of its own", () => {
		assert.match(doctrine, /name only the plan's day, copied as written: the `planned_words`/);
		assert.match(doctrine, /Never a day from `due`/);
	});

	it("says where he stands in the app's words, every one of them, and never a level's name", () => {
		for (const words of [...Object.values(STANDING_WORDS), ...Object.values(RIGHT_WORDS)]) assert.ok(doctrine.includes(words), words);
		assert.match(doctrine, /`assisted`.*never say them to him/s);
	});
});
