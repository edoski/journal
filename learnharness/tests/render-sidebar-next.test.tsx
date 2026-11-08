/**
 * The Proposed sidebar (polish pass, 9 Nov 2026): sessions grouped by
 * course, a compact trailing time, and a dot when the session waits on the
 * learner. Same tsx classic-JSX shim as render-sidebar.test.tsx.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionRowNext, groupByCourse, shortTimeAgo } from "../components/sidebar-next.tsx";
import type { ChatListItem } from "../src/core/index.ts";

function item(overrides: Partial<ChatListItem>): ChatListItem {
	return {
		id: "c1",
		title: "Test session",
		kind: "teach",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-02T00:00:00.000Z",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		busy: false,
		compacting: false,
		...overrides,
	};
}

const algebra = { workspace: "/courses/linear-algebra", title: "Linear Algebra" };
const probability = { workspace: "/courses/probability", title: "Probability" };

describe("groupByCourse", () => {
	it("groups by course in the order of each course's most recent session, unlinked sessions last", () => {
		const groups = groupByCourse([
			item({ id: "a", course: algebra }),
			item({ id: "old" }),
			item({ id: "p", course: probability }),
			item({ id: "b", course: algebra }),
		]);
		assert.deepEqual(
			groups.map((g) => [g.label, g.sessions.map((s) => s.id)]),
			[
				["Linear Algebra", ["a", "b"]],
				["Probability", ["p"]],
				["No course", ["old"]],
			],
		);
	});

	it("an empty list has no groups, and no 'No course' header", () => {
		assert.deepEqual(groupByCourse([]), []);
	});
});

describe("shortTimeAgo", () => {
	const now = new Date("2026-11-08T10:00:00.000Z");
	const ago = (ms: number) => shortTimeAgo(new Date(now.getTime() - ms).toISOString(), now);
	it("fits a trailing column at every age", () => {
		assert.equal(ago(20_000), "now");
		assert.equal(ago(40 * 60_000), "40m");
		assert.equal(ago(16 * 3_600_000), "16h");
		assert.equal(ago(3 * 86_400_000), "3d");
		assert.equal(ago(17 * 86_400_000), "2w");
		assert.equal(ago(100 * 86_400_000), "3mo");
		assert.equal(ago(400 * 86_400_000), "1y");
	});
});

describe("SessionRowNext", () => {
	const render = (chat: ChatListItem) => renderToStaticMarkup(<SessionRowNext chat={chat} active={false} onOpen={() => {}} />);

	it("a waiting question shows the dot, named for screen readers", () => {
		const html = render(item({ pendingQuestion: true }));
		assert.ok(html.includes('data-testid="session-waiting"'));
		assert.ok(html.includes("Waiting for input"));
	});

	it("a posed practice problem shows the dot and the practice glyph", () => {
		const html = render(item({ kind: "practice", pendingProblem: true }));
		assert.ok(html.includes("Problem waiting"));
		assert.ok(html.includes('aria-label="Practice session"'));
	});

	it("an idle session shows only its time", () => {
		const html = render(item({}));
		assert.ok(!html.includes("session-waiting"));
		assert.ok(html.includes("<time"));
	});

	it("a running turn replaces the time and the dot with the spinner", () => {
		const html = render(item({ busy: true, pendingQuestion: true }));
		assert.ok(!html.includes("<time"));
		assert.ok(!html.includes("session-waiting"));
		assert.ok(html.includes("braille-spinner"));
	});
});
