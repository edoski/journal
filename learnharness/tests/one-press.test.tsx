/**
 * The press that resumes or continues is one press (audit 17 Nov 2026,
 * finding 2): the same session reads the same word on the topic page's
 * Now, the course page's Now and the sidebar, and both pages' Now draw
 * the one `PagePress`. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, StudyCourse } from "../src/core/index.ts";
import { courseRead } from "../components/course-page/course-model.ts";
import { CourseNow } from "../components/course-page/course-head/course-now.tsx";
import { HybridTopic } from "../components/unit-inbox/topic-page/hybrid/hybrid-topic.tsx";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { openSessions } from "../components/study-home/study-facts.ts";
import { NowCard } from "../components/unit-inbox/now-card.tsx";
import { TopicCard } from "../components/unit-inbox/unit-row.tsx";
import { unitFor } from "../components/unit-inbox/now-inbox.ts";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { columnsOf } from "./helpers/course-columns.ts";
import { chat, LINALG_ARCS, TODAY } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(
		`<html><body><ul>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close: () => {} }) as never}>{node}</ServerEventsProvider>
			</AppRouterContext.Provider>,
		)}</ul></body></html>`,
	).document;

/** Linear Algebra in arcs with nothing due today, so the session leads its Today line. */
const course: StudyCourse = { ...LINALG_ARCS, due: [] };
const eigen = course.map.topics.find((t) => t.handle === "eigen")!;
/** The Eigenvalues lesson, the tutor writing in it this morning. */
const writing = chat("chat_eigen", { title: "Eigenvalues lesson", course: { workspace: course.map.workspace, title: course.map.title }, topics: ["eigen"], busy: true, updatedAt: `${TODAY}T09:20:00.000Z` });
const chats: readonly ChatListItem[] = [writing];

const topicPage = () => render(<HybridTopic facts={topicFacts({ course, topic: eigen, chats, read: { record: null, plans: [] } })} busy={false} onAct={() => {}} onTask={() => {}} />);

function coursePage() {
	const read = courseRead({ status: "ready", courses: [course], failed: [], open: openSessions(chats), chats: [...chats] }, course.map.workspace);
	assert.equal(read.status, "ready");
	return render(<CourseNow {...columnsOf((read as Extract<typeof read, { status: "ready" }>).view)} />);
}

describe("the press that resumes or continues", () => {
	it("reads the same word for a session the tutor is writing in on the topic page, the course page and the sidebar", () => {
		const topicNow = topicPage().querySelector('[data-slot="pickup-now-press"]')!;
		const courseNow = coursePage().querySelector('[data-slot="course-now"] [data-slot="course-action"]')!;
		assert.equal(courseNow.getAttribute("href"), "/chat/chat_eigen", "the course page's Now picks up the same session");
		const sidebarRow = render(<TopicCard unit={unitFor(course, eigen, chats)} map={course.map} chats={chats} today={TODAY} active={false} />).querySelector('[data-slot="row-action"]')!;
		const line = needsYouNow([course], [...chats], TODAY).lines.find((l) => l.row.kind === "session" && l.row.chat.id === writing.id)!;
		const sidebarCard = render(<NowCard line={line} unit={unitFor(course, eigen, chats)} active={false} chats={chats} />).querySelector('[data-slot="row-action"]')!;
		assert.deepEqual(
			{ topicPage: topicNow.textContent, coursePage: courseNow.lastElementChild?.textContent, sidebarTopic: sidebarRow.textContent, sidebarToday: sidebarCard.textContent },
			{ topicPage: "Resume", coursePage: "Resume", sidebarTopic: "Resume", sidebarToday: "Resume" },
		);
	});

	it("is one component on both pages' Now: the same slot and the same look", () => {
		const onTopic = topicPage().querySelector('[data-slot="pickup-now"] [data-slot="page-press"]');
		const onCourse = coursePage().querySelector('[data-slot="course-now"] [data-slot="page-press"]');
		assert.ok(onTopic !== null, "the topic page's Now draws the page's press");
		assert.ok(onCourse !== null, "the course page's Now draws the page's press");
		assert.equal(onTopic.getAttribute("class"), onCourse.getAttribute("class"));
		assert.match(onTopic.getAttribute("class") ?? "", /rounded-full/, "the pill Edo saw last on the course page (17 Nov 2026)");
	});
});
