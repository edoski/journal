/**
 * The Proposed sidebar (polish pass, 9 Nov 2026; T3 Code's folder anatomy
 * the same day): sessions under collapsible course headers, one trailing
 * item per row ("Your turn", the spinner or how long ago), no mark for
 * teaching or practice. Same tsx classic-JSX shim as render-sidebar.test.tsx.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { SessionRowNext, groupByCourse, sessionState, shortTimeAgo } from "../components/sidebar-next.tsx";
import { NavGroup } from "../components/nav/nav-group.tsx";
import { coverageItem, type SessionCoverage } from "../components/extraction-coverage.tsx";
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

describe("sessionState", () => {
	it("a question and a posed practice problem are the same state: the learner's turn", () => {
		assert.equal(sessionState(item({ pendingQuestion: true })), "your-turn");
		assert.equal(sessionState(item({ kind: "practice", pendingProblem: true })), "your-turn");
	});

	it("a running turn or a compaction outranks the learner's turn", () => {
		assert.equal(sessionState(item({ busy: true, pendingQuestion: true })), "working");
		assert.equal(sessionState(item({ compacting: true })), "working");
	});

	it("nothing pending is idle", () => {
		assert.equal(sessionState(item({})), "idle");
	});
});

describe("SessionRowNext", () => {
	const row = (chat: ChatListItem) => {
		const { document } = parseHTML(
			`<!doctype html><html><body>${renderToStaticMarkup(<SessionRowNext chat={chat} active={false} onOpen={() => {}} />)}</body></html>`,
		);
		const button = document.querySelector('[data-testid="session-row"]');
		assert.ok(button, "the row renders");
		return { button, trailing: button.querySelector('[data-slot="nav-row-trailing"]') };
	};

	it("a waiting question says Your turn in the one trailing slot, and lifts the title", () => {
		const { button, trailing } = row(item({ pendingQuestion: true }));
		assert.equal(trailing?.textContent, ", Your turn");
		assert.equal(trailing?.children.length, 1);
		assert.match(button.getAttribute("class") ?? "", /font-medium text-foreground/);
	});

	it("a posed practice problem reads the same, with no practice mark", () => {
		const { button, trailing } = row(item({ kind: "practice", pendingProblem: true }));
		assert.equal(trailing?.textContent, ", Your turn");
		assert.equal(button.querySelector("svg"), null);
		assert.ok(!button.outerHTML.toLowerCase().includes("practice"));
	});

	it("an idle session shows only its time, muted", () => {
		const { button, trailing } = row(item({}));
		assert.equal(trailing?.children.length, 1);
		assert.equal(trailing?.firstElementChild?.tagName, "TIME");
		assert.doesNotMatch(button.getAttribute("class") ?? "", /font-medium/);
	});

	it("a running turn shows the spinner instead, and the title stays muted", () => {
		const { button, trailing } = row(item({ busy: true, pendingQuestion: true }));
		assert.equal(trailing?.querySelector("time"), null);
		assert.equal(trailing?.querySelector('[data-testid="session-waiting"]'), null);
		assert.ok(trailing?.innerHTML.includes("braille-spinner"));
		assert.doesNotMatch(button.getAttribute("class") ?? "", /font-medium/);
	});

	it("starts its title on the course name's edge", () => {
		assert.match(row(item({})).button.getAttribute("class") ?? "", /\bpl-8\b/);
	});
});

describe("NavGroup (the course header)", () => {
	const header = (props: { open: boolean; trailing?: string; attention?: boolean }) => {
		const html = renderToStaticMarkup(
			<NavGroup icon={<svg />} title="Linear Algebra" onOpenChange={() => {}} {...props}>
				<span data-testid="child" />
			</NavGroup>,
		);
		const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
		const button = document.querySelector('[data-slot="nav-group-header"]');
		assert.ok(button, "the header renders");
		return { document, button };
	};

	it("is a 32px button that says whether it is open", () => {
		const { button } = header({ open: true });
		assert.equal(button.tagName, "BUTTON");
		assert.equal(button.getAttribute("aria-expanded"), "true");
		assert.match(button.getAttribute("class") ?? "", /\bh-8\b.*\btext-control\b.*\bfont-medium\b/);
	});

	it("open, it shows the countdown and its sessions", () => {
		const { document, button } = header({ open: true, trailing: "Exam in 21 days" });
		assert.match(button.textContent ?? "", /Exam in 21 days/);
		assert.ok(document.querySelector('[data-testid="child"]'));
	});

	it("folded, it hides the countdown and the sessions, and marks a waiting session with the dot", () => {
		const { document, button } = header({ open: false, trailing: "Exam in 21 days", attention: true });
		assert.equal(button.getAttribute("aria-expanded"), "false");
		assert.doesNotMatch(button.textContent ?? "", /Exam/);
		assert.equal(document.querySelector('[data-testid="child"]'), null);
		assert.ok(button.querySelector('[data-slot="nav-group-attention"]'));
	});

	it("folded with nothing waiting, it shows no dot", () => {
		const { button } = header({ open: false, attention: false });
		assert.equal(button.querySelector('[data-slot="nav-group-attention"]'), null);
	});
});

describe("the session menu's extraction item", () => {
	const coverage = (over: Partial<SessionCoverage>) => ({ uncoveredTokens: 81, uncoveredCount: 2, running: false, ...over }) as SessionCoverage;

	it("offers Extract notes with the backlog beside it", () => {
		assert.deepEqual(coverageItem(coverage({}), false), {
			label: "Extract notes",
			detail: "81 tok · 2 messages",
			running: false,
			disabled: false,
		});
	});

	it("is disabled and says so while extracting, optimistic or not, and once everything is extracted", () => {
		assert.equal(coverageItem(coverage({ running: true }), false).label, "Extracting notes…");
		assert.equal(coverageItem(coverage({}), true).disabled, true);
		const done = coverageItem(coverage({ uncoveredTokens: 0, uncoveredCount: 0 }), false);
		assert.deepEqual([done.label, done.detail, done.disabled], ["Notes fully extracted", null, true]);
	});
});
