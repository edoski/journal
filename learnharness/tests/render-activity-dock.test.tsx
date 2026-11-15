import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
// next/link schedules its prefetch on `self`.
(globalThis as Record<string, unknown>).self = globalThis;
import { dom } from "./helpers/radix-dom.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActivitySection, toBlobs, type ActivityFeed, type FeedRun } from "../components/activity-dock.tsx";
import { backgroundWorkWords, BACKGROUND_WORDS } from "../components/study-words.ts";
import { formatTokens } from "../components/usage-format.ts";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import { providerKeyMissing } from "../src/core/settings.ts";

// The section's pure layer: folds, formatting, and blob order — then the
// render (one row per process, the abort affordance, the always-present
// header, the "—" doctrine in the opened detail — the sidebar's
// background-agents strip).

const NOW = Date.parse("2026-09-09T12:00:00Z");

/** A full CallUsage (its fields are undefined-valued, not optional). */
function step(inputTokens: number, outputTokens: number) {
	return { inputTokens, outputTokens, cacheReadTokens: undefined, cacheWriteTokens: undefined, reasoningTokens: undefined };
}

function job(over: Partial<ActivityFeed["jobs"][number]> = {}): ActivityFeed["jobs"][number] {
	return {
		id: "job-1",
		kind: "research",
		chatId: "c1",
		toolCallId: "t1",
		status: "running",
		activity: 'web_search: "sigma.js v3"',
		createdAt: new Date(NOW - 45_000).toISOString(),
		updatedAt: new Date(NOW - 1000).toISOString(),
		title: "Limits lesson",
		contextLimit: null,
		...over,
	};
}

describe("activity dock pure layer", () => {
	it("merges jobs + background runs oldest-first (the stable blob order)", () => {
		const feed: ActivityFeed = {
			jobs: [job({ id: "new", createdAt: new Date(NOW - 10_000).toISOString() })],
			runs: [{ id: "algebra#course-map", chatId: "algebra", title: "Algebra", phase: "mapping", startedAt: NOW - 100_000 }],
		};
		const blobs = toBlobs(feed);
		assert.equal(blobs.length, 2);
		const first = blobs[0]!;
		assert.equal(first.id, "algebra#course-map"); // the map build started first
		assert.equal(first.process, "run");
		assert.equal(first.phase, "mapping");
		assert.equal(blobs[1]!.id, "new");
	});

	it("a map build and an arc grouping are one row each, keyed by their registry key; the close's own save has none (round 8)", () => {
		const rows: FeedRun[] = [
			{ id: "cx#digest", chatId: "cx", title: "Old lesson", phase: "digesting", startedAt: NOW - 1000 },
			{ id: "algebra#course-map", chatId: "algebra", title: "Algebra", phase: "mapping", startedAt: NOW - 500 },
			{ id: "calc#arcs", chatId: "calc", title: "Calculus", phase: "grouping", startedAt: NOW - 200 },
		];
		const blobs = toBlobs({ jobs: [], runs: rows });
		assert.deepEqual(blobs.map((b) => b.id), ["algebra#course-map", "calc#arcs"], "unique row ids — no duplicate React keys");
		assert.deepEqual(blobs.map((b) => b.chatId), ["algebra", "calc"], "the abort sends the key's course");
	});

	it("a connection-refused job reads as info — 'needs a sign-in'", () => {
		const refused = job({
			status: "error",
			activity: "failed",
			// the runner composes the envelope's error verbatim
			error: providerKeyMissing("claude-subscription").error,
		});
		const blob = toBlobs({ jobs: [refused], runs: [] })[0]!;
		assert.equal(blob.activity, "needs a sign-in");
	});

	it("a real failure keeps the runner's honest wording", () => {
		const crashed = job({ status: "error", activity: "failed", error: "FAILED: headless crashed" });
		const real = toBlobs({ jobs: [crashed], runs: [] })[0]!;
		assert.equal(real.activity, "failed");
	});

	it("a background run says in words what it is doing", () => {
		const [map, grouping] = toBlobs({
			jobs: [],
			runs: [
				{ id: "algebra#course-map", chatId: "algebra", title: "Algebra", phase: "mapping", startedAt: NOW },
				{ id: "calc#arcs", chatId: "calc", title: "Calculus", phase: "grouping", startedAt: NOW + 1 },
			],
		});
		assert.equal(map!.activity, "Reading the course's material to build its topic map");
		assert.match(grouping!.activity, /grouping the topics into arcs/);
	});

	it("formatTokens trims (never 38.0k)", () => {
		assert.equal(formatTokens(38_000), "38k");
		assert.equal(formatTokens(1_234_567), "1.2M");
		assert.equal(formatTokens(950), "950");
	});
});

/** Mounts the section, opens the detail of the row whose title is
 *  `title`, and hands back that detail's text and link. */
async function openDetail(feed: ActivityFeed, title: string) {
	const host = dom.document.createElement("div");
	dom.document.body.appendChild(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<ActivitySection feed={feed} />));
		const row = [...host.querySelectorAll('[data-slot="nav-row"]')].find((r) => r.textContent?.includes(title));
		assert.ok(row, `a row for ${title}`);
		await act(async () => row.dispatchEvent(new dom.window.Event("click", { bubbles: true })));
		const detail = host.querySelector('[data-testid="activity-blob-detail"]');
		return {
			expanded: row.getAttribute("aria-expanded"),
			text: detail?.textContent ?? "",
			href: detail?.querySelector("a")?.getAttribute("href"),
			totalCost: host.querySelector('[data-testid="activity-total-cost"]'),
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

describe("activity section render", () => {
	it("renders the ALWAYS-PRESENT header when idle — empty means empty, nothing hides", () => {
		const html = renderToStaticMarkup(<ActivitySection feed={{ jobs: [], runs: [] }} />);
		assert.match(html, /data-testid="activity-section"/);
		assert.match(html, /Background work/);
		assert.doesNotMatch(html, /activity-blob-(job|run)/, "no rows while idle");
		assert.doesNotMatch(html, /activity-total-cost/, "the cost span is population, not decoration");
	});

	it("renders one row per running process, what it does for which lesson or course in full, and the abort affordance; no timer anywhere", async () => {
		const feed: ActivityFeed = {
			jobs: [job({ id: "j1", kind: "demo", activity: "building sandbox…", title: "Chain-rule demo" })],
			runs: [{ id: "algebra#course-map", chatId: "algebra", title: "Algebra", phase: "mapping", startedAt: NOW - 60_000 }],
		};
		const html = renderToStaticMarkup(<ActivitySection feed={feed} />);
		assert.match(html, /data-testid="activity-section"/);
		assert.match(html, /data-testid="activity-blob-job"/);
		assert.match(html, /data-testid="activity-blob-run"/);
		assert.match(html, /Chain-rule demo/);
		assert.match(html, /Building the topic map of Algebra/);
		assert.match(html, /Building a demo for Chain-rule demo/);
		assert.equal(html.match(/data-testid="activity-blob-elapsed"/g), null, "no timer: a count he never asked for");
		assert.equal(html.match(/data-testid="activity-abort"/g)?.length, 2, "END on every row's face, detail-independent");
		assert.equal(html.match(/>Stop<\/button>/g)?.length, 2, "each stop button says Stop in a word beside its icon");
		assert.match(html, /aria-label="Stop: Building a demo for Chain-rule demo"/, "the stop button names what it stops");
		assert.match(html, /aria-label="Stop: Building the topic map of Algebra"/);
		assert.match(html, /Background work/);
		assert.doesNotMatch(html, /building sandbox…/, "what it is doing waits in the detail");

		const detail = await openDetail(feed, "Chain-rule demo");
		assert.equal(detail.expanded, "true");
		assert.match(detail.text, /building sandbox…/);
		assert.doesNotMatch(detail.text, /Running for|\d+s\b/, "no timer in the detail either");
		assert.match(detail.text, /Open the lesson/);
		assert.equal(detail.href, "/chat/c1");
		assert.doesNotMatch(detail.text, /Cost|Context|Model|Steps|tokens|\$|—/, "no counts or engine words");
	});

	it("a course-map run's detail opens its course page, with no counts", async () => {
		const detail = await openDetail(
			{ jobs: [], runs: [{ id: "algebra#course-map", chatId: "algebra", title: "Algebra", phase: "mapping", startedAt: NOW - 125_000 }] },
			"Algebra",
		);
		assert.match(detail.text, /Reading the course's material to build its topic map/);
		assert.match(detail.text, /Open the course/);
		assert.equal(detail.href, courseHref("algebra"), "a map build's key is its course, not a chat");
		assert.equal(detail.totalCost, null, "no running total in the header");
	});

	it("a grouping run names its course on the row, and its detail says what it does and opens the course page", async () => {
		const feed: ActivityFeed = { jobs: [], runs: [{ id: "calculus#arc-pass", chatId: "calculus", title: "Calculus", phase: "grouping", startedAt: NOW - 5_000 }] };
		assert.match(renderToStaticMarkup(<ActivitySection feed={feed} />), /Grouping the topics of Calculus into arcs/);
		const detail = await openDetail(feed, "Calculus");
		assert.match(detail.text, /Settling what each topic builds on, then grouping the topics into arcs/);
		assert.equal(detail.href, courseHref("calculus"));
	});

	it("a running map build's sidebar row says what it is doing before it is opened", () => {
		const html = renderToStaticMarkup(
			<ActivitySection
				feed={{ jobs: [], runs: [{ id: "gt#course-map", chatId: "gt", title: "Graph Theory", phase: "mapping", startedAt: NOW }] }}
			/>,
		);
		const label = html.match(/data-slot="nav-row-label"[^>]*>(?:<[^>]*>)*([^<]*)</)?.[1] ?? "";
		assert.equal(label, "Building the topic map of Graph Theory", "what it does and the course it works for, whole, on the row");
		assert.doesNotMatch(html, /activity-blob-detail/, "the row is closed");
	});
});

describe("background work's words", () => {
	it("gives it one name and says each piece in full, for which lesson or course", () => {
		assert.equal(BACKGROUND_WORDS.name, "Background work");
		assert.match(BACKGROUND_WORDS.followIt, /Background work/);
		assert.equal(backgroundWorkWords("mapping", "Graph Theory"), "Building the topic map of Graph Theory");
		assert.equal(backgroundWorkWords("visual", "Eigenvalues"), "Drawing a figure for Eigenvalues");
		assert.equal(backgroundWorkWords("digest", "Eigenvalues"), "Saving what you learned in Eigenvalues");
	});
});
