/**
 * The sidebar holds two things, like T3 Code's (Edo, 16 Nov 2026): Today's
 * cards on top and one folded Sessions list, every session newest first.
 * The Learning and On your own shelves are gone (the course page, Home's
 * map and the topic page show each topic's standing), and Other sessions
 * became Sessions (components/unit-inbox/now-shelves.md).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { nowFor } from "../components/unit-inbox/now-inbox.ts";
import type { NowListProps } from "../components/unit-inbox/now-list-props.ts";
import { TodayList } from "../components/unit-inbox/today/today-list.tsx";
import { buildInbox } from "../components/unit-inbox/units.ts";
import type { ChatListItem } from "../src/core/index.ts";
import { CHATS, chat, COURSES, TODAY } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };

function renderList(over: Partial<NowListProps> & { open?: boolean; scope?: string | null } = {}, chats: readonly ChatListItem[] = CHATS) {
	const { open = false, scope = null, ...rest } = over;
	const props: NowListProps = {
		needs: scope === null ? needsYouNow(COURSES, chats, TODAY) : nowFor(COURSES, chats, scope, TODAY),
		inbox: buildInbox(COURSES, chats, scope),
		courses: COURSES,
		unreadable: [],
		chats,
		today: TODAY,
		unavailable: false,
		folded: { sessions: !open },
		fold() {},
		pathname: "/",
		s: { pathname: rest.pathname ?? "/" } as NowListProps["s"],
		...rest,
	};
	const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, React.createElement(TodayList, props)));
	return parseHTML(`<html><body><ul>${html}</ul></body></html>`).document;
}

const headers = (doc: Document) => [...doc.querySelectorAll('[data-slot="unit-section-header"]')].map((h) => h.textContent);
const rows = (doc: Document) => [...doc.querySelectorAll('[data-slot="unit-shelf"] [data-testid="session-row"]')].map((r) => r.querySelector('[data-slot="unit-row-title"]')?.textContent);

describe("the sidebar's Sessions list", () => {
	it("is the one list under Today: no Learning, no On your own, no Other sessions", () => {
		assert.deepEqual(headers(renderList()), ["Sessions, your turn"]);
		assert.deepEqual(headers(renderList({ open: true })), ["Sessions"]);
		assert.ok(renderList({ open: true }).querySelector('[data-slot="unit-slim"]') === null, "no topic row under Today's cards");
	});

	it("holds every session newest first, one line each, less the one Today draws as its own card", () => {
		// Eigenvalues lesson is Today's fifth card; Rank practice and Determinants are on topics, which used to hide them under Learning.
		assert.deepEqual(rows(renderList({ open: true })), ["Rank practice", "Determinants as volume", "Why are vectors columns?", "Determinants, second pass"]);
	});

	it("keeps in view while folded the open session and one the tutor writes in, with Tutor writing", () => {
		const running = CHATS.map((c) => (c.id === "chat_det" ? { ...c, busy: true } : c));
		const doc = renderList({ pathname: "/chat/chat_general" }, running);
		assert.deepEqual(rows(doc), ["Determinants as volume", "Why are vectors columns?"]);
		const det = [...doc.querySelectorAll('[data-testid="session-row"]')].find((r) => r.textContent?.includes("Determinants as volume"));
		assert.match(det?.querySelector('[data-slot="unit-status-slot"]')?.textContent ?? "", /Tutor writing/);
	});

	it("gives a repeated title its day", () => {
		const again = [...CHATS, chat("chat_rank_old", { title: "Rank practice", course: { workspace: "/s/linalg", title: "Linear Algebra" }, updatedAt: "2026-11-02T09:00:00.000Z" })];
		const twins = [...renderList({ open: true }, again).querySelectorAll('[data-slot="session-twin"]')].map((t) => t.textContent);
		assert.deepEqual(twins, [", 8 Nov", ", 2 Nov"]);
	});

	it("keeps only the chosen course's sessions under the course filter", () => {
		// Rank practice is a card on Linear Algebra's own Today; the general question is on no course.
		assert.deepEqual(rows(renderList({ open: true, scope: "/s/linalg" })), ["Determinants as volume", "Determinants, second pass"]);
	});
});
