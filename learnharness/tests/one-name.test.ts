/**
 * One piece of work keeps one name: a lesson opened on a topic is named
 * after it, and the calendar names an unfinished lesson's task as Home names
 * its session (round 8, 1 D9).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarEntries } from "../components/calendar/calendar-facts.ts";
import { openingTitle, type CalendarCourse } from "../src/core/index.ts";
import { COURSE, LA, LEFT, TODAY, chat, map, topic } from "./fixtures/round8-home.ts";

describe("one piece of work, one name (1 D9)", () => {
	it("names a lesson opened on a topic after the topic, never the verb that opened it; a review keeps its words", () => {
		assert.equal(openingTitle("Start Linear maps and their matrices", ["linmaps"]), "Linear maps and their matrices lesson", "named as its task will be, from its first turn (round 16, m4)");
		assert.equal(openingTitle("Invertible matrices", ["invertibility"]), "Invertible matrices lesson");
		assert.equal(openingTitle("Vector spaces check", ["vectors"], false), "Vector spaces check", "an arc's check or a practice round keeps its words");
		assert.equal(openingTitle("Continue Problem sheet 4: rank and nullity", ["rank"]), "Problem sheet 4: rank and nullity");
		assert.equal(openingTitle("Review Binomial distribution", ["binomial"]), "Review Binomial distribution");
		assert.equal(openingTitle("Start with the basics", []), "Start with the basics", "a typed opening keeps its words");
	});

	it("names an unfinished lesson's task on the calendar as Home names its session", () => {
		const course: CalendarCourse = {
			...COURSE,
			due: [],
			map: map({ tasks: [{ key: "eigen-lesson", title: "Eigenvalues lesson: eigenspaces and diagonalising", step: "Part 2", updated: "2026-11-08" }], topics: [topic("eigen", "Eigenvalues and eigenvectors", { tasks: ["eigen-lesson"] })] }),
			planned: [],
			doesNotFit: [],
			finalReview: null,
		};
		const task = calendarEntries({ courses: [course], chats: [LEFT], scope: null }).find((e) => e.kind === "task");
		assert.equal(task?.title, "Eigenvalues and eigenvectors");
	});
});
