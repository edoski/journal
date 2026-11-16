/**
 * "You are here" is one topic on every surface: Home and the course page,
 * the sidebar and a topic page's maps all read it from the same session
 * list (`withLessonHere`), so a lesson in progress moves it everywhere at
 * once (round 14, m6: topic maps put it on Random variables while Home and
 * the course page put it on Poisson).
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { useStudyHome } from "../components/study-home/use-study-home.ts";
import { useUnitInbox } from "../components/unit-inbox/use-unit-inbox.ts";
import { useUnitRead } from "../components/unit-inbox/unit-page.tsx";
import { chat, PROB } from "./fixtures/now-demo.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	window: dom.window,
	document: dom.document,
	Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement,
	CustomEvent: dom.window.CustomEvent,
	IS_REACT_ACT_ENVIRONMENT: true,
	localStorage: { getItem: () => null, setItem() {} },
});

const originalFetch = globalThis.fetch;
let root: Root | undefined;

// A lesson on Total probability waits on his answer, while the engine's
// current topic is Bayes' rule.
const LESSON = chat("lesson", { course: { workspace: "/s/prob", title: "Probability" }, topics: ["total"], ownTopics: ["total"], pendingQuestion: true, updatedAt: "2026-11-08T09:00:00.000Z" });

const source: NotifySource = { close() {}, onOpen() {}, onEvent() {} };

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	globalThis.fetch = originalFetch;
});

describe('"You are here" (round 14, m6)', () => {
	it("is the lesson in progress on Home, in the sidebar and on a topic page", async () => {
		assert.equal(PROB.map.current, "bayes", "the engine's current topic is another");
		globalThis.fetch = (async (input: string) => {
			const url = String(input).split("?")[0]!;
			if (url === "/api/chats") return Response.json({ chats: [LESSON] });
			return Response.json({ available: true, courses: [PROB], failed: [] });
		}) as typeof fetch;
		const seen: Record<string, string | null> = {};
		function Views() {
			const home = useStudyHome().state;
			const inbox = useUnitInbox([LESSON]).state;
			const topic = useUnitRead("/s/prob");
			if (home.status === "ready") seen.home = home.courses[0]?.map.current ?? null;
			if (inbox.status === "ready") seen.sidebar = inbox.courses[0]?.map.current ?? null;
			if (topic.status === "ready") seen.topic = topic.course.map.current;
			return null;
		}
		const host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
		await act(async () => root!.render(<ServerEventsProvider connect={() => source}><Views /></ServerEventsProvider>));
		await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
		assert.deepEqual(seen, { home: "total", sidebar: "total", topic: "total" });
	});
});
