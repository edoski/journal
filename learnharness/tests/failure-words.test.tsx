/**
 * Round 8 (4 #8): failure words say what happened and what to do, and
 * nothing false.
 * - "The app isn't allowed to open its files." gave no next step.
 * - The tutor told him "I can't confirm your last answer was saved, so it
 *   may not show in your study app" about an answer saved on 4 November,
 *   because the record could not be read for one save.
 * - The background save of what he learned had a Stop.
 * - A reply he stopped himself read "Reply cut off" in the sidebar.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).self = globalThis;
import { dom } from "./helpers/radix-dom.ts";
import { createRoot } from "react-dom/client";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";

import { UNREADABLE_WORDS } from "../components/study-words.ts";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";
import { ActivitySection, type ActivityFeed } from "../components/activity-dock.tsx";
import { stoppedByHim } from "../src/core/turn-cut.ts";
import { pausedWords } from "../components/nav/session-state.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

test("a course the app may not open says how to let it", () => {
	assert.match(UNREADABLE_WORDS.denied, /Get Info/);
});

test("a save the record refused tells the tutor his earlier answers are still saved, and not to guess at it with him", async () => {
	const ctx: CourseToolContext = {
		course: { workspace: "/study/ra", title: "Real Analysis" },
		records: { run: async () => ({ ok: false, kind: "io", message: "[Errno 13] Permission denied: '/study/ra/course.json'" }) } as unknown as CourseToolContext["records"],
		arcs: false,
	};
	await assert.rejects(courseTools(ctx).course_save!.execute("t1", { changes: { topics: {} } } as never), (error: Error) => {
		assert.match(error.message, /Permission denied/);
		assert.match(error.message, /saved before are still saved/);
		assert.match(error.message, /never tell him an answer may not have been saved/);
		return true;
	});
});

test("the background save of what he learned has no Stop; a figure being made keeps its Stop", async () => {
	const feed: ActivityFeed = {
		jobs: [],
		runs: [{ id: "c1#digest", chatId: "c1", title: "Binomial review", phase: "digesting", startedAt: 1 }],
	};
	const host = dom.document.createElement("div");
	dom.document.body.appendChild(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<ActivitySection feed={feed} />));
		assert.equal(host.querySelector('[data-testid="activity-abort"]'), null);
		const withJob: ActivityFeed = { ...feed, jobs: [{ id: "j1", kind: "visual", chatId: "c1", toolCallId: "t", status: "running", activity: "", createdAt: new Date(2).toISOString(), updatedAt: new Date(2).toISOString(), title: "Eigen lesson", contextLimit: null }] };
		await act(async () => root.render(<ActivitySection feed={withJob} />));
		assert.equal(host.querySelectorAll('[data-testid="activity-abort"]').length, 1);
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
});

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
} as const;
const user = (id: string): LhMessage => ({ id, role: "user", content: [{ type: "text", text: "next" }], timestamp: 1 }) as LhMessage & UserMessage;
const reply = (id: string, stopReason: "aborted" | "error" | "stop", text = "The kernel is"): LhMessage => ({ id, role: "assistant", content: [{ type: "text", text }], timestamp: 2, ...STAMPS, stopReason }) as LhMessage & AssistantMessage;

test("a reply he stopped reads as his stop; one a restart cut reads as cut off", () => {
	assert.equal(stoppedByHim([user("u1"), reply("a1", "aborted")]), true);
	assert.equal(stoppedByHim([user("u1"), reply("a1", "aborted", "")]), true, "before its first word too");
	assert.equal(stoppedByHim([user("u1")]), false, "the app restarted before any reply");
	assert.equal(stoppedByHim([user("u1"), reply("a1", "error")]), false);
	assert.equal(pausedWords({ stopped: true }), "You stopped the tutor");
	assert.equal(pausedWords({}), "Reply cut off");
});
