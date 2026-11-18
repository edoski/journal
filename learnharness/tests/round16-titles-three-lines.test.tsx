/**
 * Round 16, m25 (1 m10): a combined review's title clamped where there was
 * room: "Review Random variables and distributions, Binomial…" in the
 * sidebar and "…distributions,…" on the calendar's week. Both wrap to a
 * third line before they cut.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { calendarEntries } from "../components/calendar/calendar-facts.ts";
import { CalendarEntryView } from "../components/calendar/calendar-entry.tsx";
import { rowTitle } from "../components/unit-inbox/row-card.tsx";
import type { CalendarCourse } from "../src/core/index.ts";
import { COURSE, TODAY, chat } from "./fixtures/round8-home.ts";

const TITLE = "Review Random variables and distributions, Binomial distribution";

describe("a combined review's title wraps to three lines (round 16, m25)", () => {
	it("in the sidebar, loud or quiet", () => {
		for (const loud of [true, false]) assert.match(rowTitle(loud), /\bline-clamp-3\b/);
	});

	it("on the calendar's week", () => {
		const review = chat({ id: "r", title: TITLE, topics: ["binomial"], ownTopics: ["binomial"], ended: "closed" });
		const course: CalendarCourse = { ...COURSE, due: [], planned: [], doesNotFit: [], finalReview: null };
		const entry = calendarEntries({ courses: [course], chats: [review], scope: null }).find((e) => e.kind === "session")!;
		const doc = parseHTML(`<html><body>${renderToStaticMarkup(<CalendarEntryView entry={entry} today={TODAY} onStart={() => {}} />)}</body></html>`).document;
		const title = doc.querySelector('[data-slot="calendar-entry-title"]')!;
		assert.equal(title.textContent, TITLE);
		assert.match(title.getAttribute("class") ?? "", /\bline-clamp-3\b/);
	});
});
