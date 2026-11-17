/**
 * The calendar calls a review session a review and draws an overdue review
 * as Home and the sidebar do (round 8, 2 m5 and 1 §6).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HistoryIcon } from "lucide-react";
import { calendarEntries, lookOf, lookWords, sessionType } from "../components/calendar/calendar-facts.ts";
import { lookFact } from "../components/calendar/calendar-entry.tsx";
import { factIcon, factInk } from "../components/unit-inbox/fact-icon.ts";
import type { CalendarCourse } from "../src/core/index.ts";
import { COURSE, LA, LEFT, TODAY, chat, map, topic } from "./fixtures/round8-home.ts";

describe("the calendar's words and marks (2 m5, 1 §6)", () => {
	it("calls a review session a review", () => {
		const review = chat({ id: "r", title: "Review Binomial distribution", topics: ["binomial"], ownTopics: ["binomial"], ended: "closed" });
		assert.equal(sessionType(review), "review");
		const course: CalendarCourse = { ...COURSE, due: [], planned: [], doesNotFit: [], finalReview: null };
		const entry = calendarEntries({ courses: [course], chats: [review], scope: null }).find((e) => e.kind === "session")!;
		assert.equal(lookWords(entry, TODAY), "Review");
		assert.equal(sessionType(LEFT), "lesson");
		assert.equal(sessionType(chat({ title: "Chain rule review", review: true })), "review", "a review named another way is still one, by its opening");
	});

	it("keeps Review on a review that turned into teaching and left work open (round 9, 2 m4: it read Unfinished)", () => {
		const task = { key: "binomial-formula", title: "Building the binomial formula", step: "Count the sequences with 3 successes", updated: TODAY };
		const course: CalendarCourse = {
			...COURSE,
			map: map({ tasks: [task], topics: [topic("binomial", "Binomial distribution", { tasks: [task.key] })] }),
			due: [],
			planned: [],
			doesNotFit: [],
			finalReview: null,
		};
		const review = chat({ id: "r", title: "Review Binomial distribution", topics: ["binomial"], ownTopics: ["binomial"], tasks: [task.key], ended: "left", updatedAt: `${TODAY}T10:00:00.000Z` });
		const entries = calendarEntries({ courses: [course], chats: [review], scope: null });
		const entry = entries.find((e) => e.kind === "session")!;
		assert.equal(entry.kind === "session" && entry.task?.key, task.key, "the open task folds into the review's entry");
		assert.equal(lookWords(entry, TODAY), "Review");
		assert.equal(entries.filter((e) => e.kind === "task").length, 0, "one entry for the one piece of work");
	});

	it("draws an overdue review with the review's History icon, muted, as Home and the sidebar do", () => {
		assert.equal(factIcon(lookFact("overdue")), HistoryIcon);
		assert.equal(factInk(lookFact("overdue").kind), "text-muted-foreground");
		const overdue: CalendarCourse = { ...COURSE, map: map({ topics: [topic("eigen", "Eigen", { review: { kind: "due", date: TODAY, overdue: 3 } })] }), planned: [], doesNotFit: [], finalReview: null };
		const entry = calendarEntries({ courses: [overdue], chats: [], scope: null }).find((e) => e.kind === "review")!;
		assert.equal(lookOf(entry), "overdue");
	});
});
