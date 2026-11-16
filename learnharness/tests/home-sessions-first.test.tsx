/**
 * Home's sessions never wait on the engine (round 13, 3 N3 and 1 n1).
 * Back on Home mid-lesson, Today showed the Home read before the lesson
 * began until the courses' read landed, so the live lesson was missing for
 * 6.5 s and more; after a close, the finished lesson's line stayed for
 * about 15 s. The session list reads in milliseconds and lands on its own;
 * a session that settled after the courses' read began ends its line.
 * (Round 12's e34f4a56 kept the last Home for a visit, sessions included,
 * until the slow courses' read landed.)
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { forgetStudyHome, useStudyHome, type StudyHomeState } from "../components/study-home/use-study-home.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { chat, COURSE, TODAY } from "./fixtures/round8-home.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
after(() => {
	globalThis.fetch = originalFetch;
	forgetStudyHome();
});

const source: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
let latest: StudyHomeState = { status: "loading" };
function Home() {
	latest = useStudyHome().state;
	return null;
}

/** The lesson he is in: started from the topic page, a question waiting on him. */
const LIVE = chat({ id: "live", title: "Rank and the column space", topics: ["rank"], ownTopics: ["rank"], pendingQuestion: true, createdAt: "2026-11-09T09:00:00.000Z", updatedAt: "2026-11-09T09:05:00.000Z" });

/** /api/chats answers with these sessions; /api/study at once, or never (a busy engine). */
function serve(chats: unknown[], study: boolean) {
	globalThis.fetch = (async (input: string) => {
		if (String(input).startsWith("/api/chats")) return Response.json({ chats });
		return study ? Response.json({ available: true, courses: [COURSE], failed: [] }) : new Promise<Response>(() => {});
	}) as typeof fetch;
}

async function visit() {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(<ServerEventsProvider connect={() => source}><Home /></ServerEventsProvider>));
	await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	return root;
}

const rowIds = (state: StudyHomeState) => (state.status === "ready" ? needsYouNow(state.courses, state.chats, TODAY, state.readAt).rows.map((r) => (r.kind === "session" ? `session:${r.chat.id}` : `${r.step.kind}:${r.step.kind === "none" ? "" : r.step.topics.join(",")}`)) : []);

describe("Home's sessions land without waiting on the courses' read", () => {
	it("back on Home mid-lesson, Today lists the live lesson while the engine is still reading (3 N3)", async () => {
		forgetStudyHome();
		serve([], true);
		const first = await visit();
		await act(async () => first.unmount());
		serve([LIVE], false);
		const second = await visit();
		try {
			assert.equal(latest.status, "ready");
			assert.ok(rowIds(latest).includes("session:live"), `Today: ${rowIds(latest).join(" | ")}`);
		} finally {
			await act(async () => second.unmount());
		}
	});

	it("a session finished since the courses' read began ends its line until the next read knows it (1 n1)", () => {
		const read = "2026-11-09T09:00:00.000Z";
		const review = chat({ id: "rev", title: "Review Eigenvalues and eigenvectors", review: true, topics: ["eigen"], ownTopics: ["eigen"], createdAt: "2026-11-09T09:10:00.000Z", updatedAt: "2026-11-09T09:30:00.000Z" });
		const before = needsYouNow([COURSE], [], TODAY, read).rows;
		assert.ok(before.some((r) => r.kind === "course" && r.step.kind === "review"), "the review is on Today before it is done");
		const afterClose = needsYouNow([COURSE], [review], TODAY, read).rows;
		assert.ok(!afterClose.some((r) => r.kind === "course" && r.step.kind === "review"), "the finished review's line is gone at once");
		const older = needsYouNow([COURSE], [{ ...review, updatedAt: "2026-11-09T08:00:00.000Z" }], TODAY, read).rows;
		assert.ok(older.some((r) => r.kind === "course" && r.step.kind === "review"), "a session the read already knew leaves the engine's line as it is");
	});
});
