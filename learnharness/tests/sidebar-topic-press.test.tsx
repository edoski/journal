/**
 * A topic's press in the sidebar is its topic page's press (`topicPress`,
 * audit 17 Nov 2026, finding 4): on a topic whose lesson he began, or
 * whose open task a session holds, it reads Continue and opens that
 * session, never "Study" and a second, fresh one (round 12, 1 D5).
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, StudyCourse } from "../src/core/index.ts";
import { unitFor } from "../components/unit-inbox/now-inbox.ts";
import { TopicCard } from "../components/unit-inbox/unit-row.tsx";
import { chat, LINALG, map, TODAY, topic } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;

const la = { workspace: "/s/linalg", title: "Linear Algebra" };

function action(course: StudyCourse, handle: string, chats: readonly ChatListItem[]) {
	const t = course.map.topics.find((x) => x.handle === handle)!;
	const doc = render(<TopicCard unit={unitFor(course, t, chats)} map={course.map} chats={chats} today={TODAY} active={false} />);
	const el = doc.querySelector('[data-slot="row-action"]')!;
	return { word: el.textContent, href: el.getAttribute("href") };
}

describe("a topic's press in the sidebar, as its page's", () => {
	it("continues a lesson he began and left, never a new one", () => {
		const lesson = chat("chat_det_lesson", { title: "Determinants", course: la, topics: ["det"], updatedAt: "2026-11-07T18:00:00.000Z" });
		assert.deepEqual(action(LINALG, "det", [lesson]), { word: "Continue", href: "/chat/chat_det_lesson" });
	});

	it("continues the open task that holds the topic in the session that holds it", () => {
		const task = { key: "sheet-4", title: "Problem sheet 4", step: "Question 2", updated: "2026-11-07" };
		const course: StudyCourse = { ...LINALG, map: map({ ...LINALG.map, tasks: [task], topics: [...LINALG.map.topics.filter((t) => t.handle !== "eigen"), topic("eigen", "Eigenvalues and eigenvectors", "introduced", { tasks: [task.key] })] }) };
		const sheet = chat("chat_sheet", { title: "Problem sheet 4", course: la, topics: [], tasks: [task.key], ended: "left", updatedAt: "2026-11-07T18:00:00.000Z" });
		const pressed = action(course, "eigen", [sheet]);
		assert.equal(pressed.word, "Continue");
		assert.ok(pressed.href?.startsWith("/chat/chat_sheet"), `opens the sheet's session, not a new one: ${pressed.href}`);
	});

	it("starts a topic he never began", () => {
		assert.deepEqual(action(LINALG, "diag", []), { word: "Start", href: null });
	});
});
