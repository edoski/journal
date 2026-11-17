/**
 * A course line's sidebar card takes up the work as Home's line does, never
 * the course page (round 8, 2 m9).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { NowCard, cardPress } from "../components/unit-inbox/now-card.tsx";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import type { StudyCourse } from "../src/core/index.ts";
import { TODAY, chat, map } from "./fixtures/round8-home.ts";

describe("the sidebar card of a course line (2 m9)", () => {
	const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
	const render = (node: React.ReactNode) =>
		parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;
	const sheet: StudyCourse = {
		map: map({ workspace: "/s/exam", title: "Exam prep", current: null, topics: [], tasks: [{ key: "paper", title: "Past paper 2024", step: "Question 3", updated: TODAY }], focus: "paper" }),
		unready: null,
		due: [],
		lastActiveDaysAgo: 0,
		newToday: [],
	};

	it("takes up the work, as Home's line does, and never goes to the course page", () => {
		const [line] = needsYouNow([sheet], [], TODAY).lines;
		const doc = render(<NowCard line={line!} unit={null} active={false} />);
		const card = doc.querySelector('[data-testid="unit-row"]')!;
		assert.notEqual(card.getAttribute("href"), courseHref("/s/exam"));
		assert.equal(card.tagName, "BUTTON", "it starts the lesson on the work");
		assert.ok("move" in cardPress(line!, []));
		const holder = chat({ id: "paper-session", course: { workspace: "/s/exam", title: "Exam prep" }, topics: [], ownTopics: [], tasks: ["paper"], ended: "left", updatedAt: "2026-11-09T09:00:00.000Z" });
		const held = render(<NowCard line={line!} unit={null} active={false} chats={[holder]} />);
		assert.equal(held.querySelector('[data-testid="unit-row"]')?.getAttribute("href"), "/chat/paper-session?continue=task", "the session that holds it opens, asked to take the task up (round 13, 2 M1)");
	});
});
