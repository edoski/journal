/**
 * A Today line as a sidebar card (components/unit-inbox/now-card.tsx):
 * Home's name for the line, the line's reason in the status slot and the
 * line's action, on its lead topic, its course, or a waiting session's own
 * card. Same tsx classic-JSX shim as the
 * other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { NowCard, nowActionOf } from "../components/unit-inbox/now-card.tsx";
import { topicUnit } from "../components/unit-inbox/now-inbox.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import type { StudyCourse } from "../src/core/index.ts";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import { CHATS, COURSES, map, TODAY } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;

describe("NowCard", () => {
	const inbox = buildInbox(COURSES, CHATS, null);
	/** The demo's two waiting sessions, then its first two course lines:
	 *  Today lists the sessions after the plan, folded (round 10, 1 m2), and
	 *  a card draws the same either way. */
	const lines = (() => {
		const { lines, also } = needsYouNow(COURSES, CHATS, TODAY);
		const all = [...lines, ...also];
		return [...all.filter((l) => l.row.kind === "session"), ...all.filter((l) => l.row.kind === "course").slice(0, 2)];
	})();

	it("draws each line on its lead topic, under Home's name for it, with Today's reason and the line's action", () => {
		const doc = render(
			<>
				{lines.map((line) => (
					<NowCard key={line.key} line={line} unit={topicUnit(inbox, line.row.course!, line.lead!, CHATS)} active={false} />
				))}
			</>,
		);
		const cards = [...doc.querySelectorAll('[data-slot="unit-card"]')];
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-testid="unit-row"] > span:last-child')?.textContent),
			["Eigenvalues lesson", "Rank practice", "Review Random variables and distributions, Law of total probability, Bayes' rule", "Review Linear independence"],
		);
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-slot="why-mark"]')?.textContent?.replace(", ", "")),
			["Your turn", "Your turn", "Due since 5 Nov", "Due since 4 Nov"],
		);
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-slot="row-action"]')?.getAttribute("aria-label")),
			["Resume: Eigenvalues lesson", "Resume: Rank practice", "Review: Review Random variables and distributions, Law of total probability, Bayes' rule", "Review: Review Linear independence"],
		);
		assert.equal(cards[0]!.querySelector('[data-slot="row-action"]')?.getAttribute("href"), "/chat/chat_eigen");
		assert.equal(cards[2]!.querySelector('[data-testid="unit-row"]')?.getAttribute("href")?.startsWith("/unit/"), true);
	});

	it("draws a waiting session on no topic as its own card, opening the session, with no action", () => {
		const loose = needsYouNow([], [{ ...CHATS[1]!, course: undefined }], TODAY).lines[0]!;
		const doc = render(<NowCard line={loose} unit={null} active />);
		const link = doc.querySelector('[data-testid="unit-row"]')!;
		assert.equal(link.getAttribute("href"), "/chat/chat_eigen");
		assert.equal(link.getAttribute("data-sidebar-row"), "chat:chat_eigen");
		assert.equal(link.getAttribute("aria-current"), "page");
		assert.match(link.textContent ?? "", /No course.*Your turn.*Eigenvalues lesson/);
		assert.equal(doc.querySelector('[data-slot="row-action"]'), null);
	});

	it("draws a course line with no topic to lead with as its course's card, under Home's name, taking up the work as Home's line does, with Home's action", () => {
		const exam: StudyCourse = {
			map: map({ workspace: "/s/exam", title: "Exam prep", tasks: [{ key: "paper", title: "Past paper 2024", step: "Question 3", updated: TODAY }], focus: "paper" }),
			unready: null,
			due: [],
			lastActiveDaysAgo: 0,
			newToday: [],
		};
		const [line] = needsYouNow([exam], [], TODAY).lines;
		assert.equal(line!.lead, null, "the task holds no topic");
		const doc = render(<NowCard line={line!} unit={null} active={false} />);
		const link = doc.querySelector('[data-testid="unit-row"]')!;
		assert.notEqual(link.getAttribute("href"), courseHref("/s/exam"), "never the course page (round 8, 2 m9)");
		assert.equal(link.tagName, "BUTTON");
		assert.equal(link.getAttribute("data-sidebar-row"), "course:/s/exam");
		assert.match(link.textContent ?? "", /Exam prep.*Left off today.*Continue Past paper 2024/);
		assert.equal(doc.querySelector('[data-slot="row-action"]')?.textContent, "Continue");
	});

	it("takes Home's word for a course line's action", () => {
		const row = lines[2]!.row;
		assert.deepEqual(nowActionOf(lines[2]!), { label: "Review", workspace: "/s/prob", step: row.kind === "course" ? row.step : null }, "the line's own step, so it starts that lesson");
		assert.deepEqual(nowActionOf(lines[0]!), { label: "Resume", href: "/chat/chat_eigen" });
	});
});
