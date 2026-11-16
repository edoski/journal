/**
 * One status per line on Home and in the sidebar (round 12, 1 m3 and 2 n2):
 * the Eigen lesson waiting on him read "Mistake to fix" on Home and "Your
 * turn" in the sidebar; an untouched review of a lapsed topic "Not right
 * last time" and "Your turn"; the Eigen review due today "Check again
 * another day" and "Due today". Each Today line says the same words on
 * Home's row and on the sidebar's card.
 */
import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { NowCard } from "../components/unit-inbox/now-card.tsx";
import { topicUnit } from "../components/unit-inbox/now-inbox.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const TODAY = "2026-11-08";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) => parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;

/** Each Today line's words on Home's row and on the sidebar's card. */
function bothSay(course: StudyCourse, chats: ChatListItem[]): { home: string; sidebar: string }[] {
	const { rows, lines } = needsYouNow([course], chats, TODAY);
	const home = [...render(<HybridRows rows={rows} busy={false} onContinue={() => {}} />).querySelectorAll('[data-slot="today-line"]')].map(
		(line) => (line.querySelector('[data-slot="today-why"]') ?? line.querySelector('[data-slot="today-standing"]'))?.textContent?.trim() ?? "",
	);
	const inbox = buildInbox([course], chats, null);
	return lines.map((line, i) => {
		const unit = line.lead ? topicUnit(inbox, course, line.lead, chats) : null;
		const card = render(<NowCard line={line} unit={unit} active={false} chats={chats} />);
		return { home: home[i]!, sidebar: card.querySelector('[data-slot="why-mark"]')?.textContent?.replace(", ", "").trim() ?? "" };
	});
}

const mistake = { ...QUIET, gap: "Read −x + y = 0 as (1, −1)", mistake: true };

describe("one status per line on Home and in the sidebar (1 m3, 2 n2)", () => {
	it("a lesson waiting on him on a topic with a mistake to fix says Your turn on both", () => {
		const course: StudyCourse = { map: map({ today: TODAY, topics: [topic("eigen", "Eigenvalues and eigenvectors", { level: "assisted", signals: mistake })] }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 0 };
		const eigen = chat({ id: "eigen", pendingQuestion: true, studied: true, updatedAt: "2026-11-08T09:00:00.000Z" });
		assert.deepEqual(bothSay(course, [eigen]), [{ home: "Your turn", sidebar: "Your turn" }]);
	});

	it("an untouched review of a lapsed topic says Your turn on both", () => {
		const gauss = topic("gauss", "Gaussian elimination", { level: "independent", review: { kind: "due", date: TODAY, overdue: 0 }, signals: { ...QUIET, lapsed: true, mistake: true } });
		const course: StudyCourse = { map: map({ today: TODAY, current: "gauss" as TopicHandle, topics: [gauss] }), unready: null, due: ["gauss" as TopicHandle], newToday: [], lastActiveDaysAgo: 0 };
		const review = chat({ id: "review", title: "Review Gaussian elimination", topics: ["gauss"], ownTopics: ["gauss"], review: true, pendingQuestion: true, untouched: true, updatedAt: "2026-11-08T08:30:00.000Z" });
		assert.deepEqual(bothSay(course, [review]), [{ home: "Your turn", sidebar: "Your turn" }]);
	});

	it("a review due today on a topic he fixed on his own says Due today on both, never Check again another day", () => {
		const eigen = topic("eigen", "Eigenvalues and eigenvectors", { level: "independent", review: { kind: "due", date: TODAY, overdue: 0 }, signals: { ...QUIET, gap: "Read −x + y = 0 as (1, −1)", repaired: true } });
		const course: StudyCourse = { map: map({ today: TODAY, topics: [eigen] }), unready: null, due: ["eigen" as TopicHandle], newToday: [], lastActiveDaysAgo: 1 };
		const said = bothSay(course, []);
		assert.equal(said.length, 1);
		assert.equal(said[0]!.home, said[0]!.sidebar);
		assert.equal(said[0]!.home, "Due today");
	});
});
