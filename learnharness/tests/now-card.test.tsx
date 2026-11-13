/**
 * A Today line as a sidebar card (components/unit-inbox/now-card.tsx): the
 * lead topic's title, the line's reason in the status slot and the line's
 * action, or a waiting session's own card. Same tsx classic-JSX shim as the
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
import { CHATS, COURSES, TODAY } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;

describe("NowCard", () => {
	const inbox = buildInbox(COURSES, CHATS, null);
	const { lines } = needsYouNow(COURSES, CHATS, TODAY);

	it("draws each line as its lead topic with Today's reason and the line's action", () => {
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
			["Eigenvalues and eigenvectors", "Rank and the column space", "Random variables and distributions", "Linear independence"],
		);
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-slot="why-mark"]')?.textContent?.replace(", ", "")),
			["Your turn", "Your turn", "3d overdue", "4d overdue"],
		);
		assert.deepEqual(
			cards.map((c) => c.querySelector('[data-slot="row-action"]')?.getAttribute("aria-label")),
			["Resume: Eigenvalues and eigenvectors", "Resume: Rank and the column space", "Review: Random variables and distributions", "Review: Linear independence"],
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

	it("takes Home's word for a course line's action", () => {
		assert.deepEqual(nowActionOf(lines[2]!), { label: "Review", workspace: "/s/prob" });
		assert.deepEqual(nowActionOf(lines[0]!), { label: "Resume", href: "/chat/chat_eigen" });
	});
});
