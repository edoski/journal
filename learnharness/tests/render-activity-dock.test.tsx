import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActivitySection, formatElapsed, toBlobs, type ActivityFeed, type FeedExtraction } from "../components/activity-dock.tsx";
import { formatTokens, formatUsd } from "../components/usage-format.ts";
import { jobCost } from "../src/server/pricing.ts";
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
		costUsd: jobCost({ usage: over.usage }),
		...over,
	};
}

describe("activity dock pure layer", () => {
	it("merges jobs + extractions oldest-first (the stable blob order)", () => {
		const feed: ActivityFeed = {
			jobs: [job({ id: "new", createdAt: new Date(NOW - 10_000).toISOString() })],
			extractions: [{ id: "cx", chatId: "cx", title: "Old lesson", phase: "auditing", startedAt: NOW - 100_000 }],
		};
		const blobs = toBlobs(feed);
		assert.equal(blobs.length, 2);
		const first = blobs[0]!;
		assert.equal(first.id, "cx"); // extraction started first
		assert.equal(first.process, "extraction");
		assert.equal(first.phase, "auditing");
		assert.equal(blobs[1]!.id, "new");
	});

	it("per-chunk jobs (owner, 2026-09-28): one source, N rows — unique ids (React keys), one chatId, part-suffixed titles", () => {
		const rows = [
			{ id: "src_a#1", chatId: "src_a", part: { i: 1, n: 2 }, title: "notes.md · 1/2", phase: "extracting", startedAt: NOW - 1000 },
			{ id: "src_a#2", chatId: "src_a", part: { i: 2, n: 2 }, title: "notes.md · 2/2", phase: "queued", startedAt: NOW - 500 },
		] as FeedExtraction[];
		const blobs = toBlobs({ jobs: [], extractions: rows });
		assert.equal(blobs.length, 2, "one blob per chunk job");
		assert.deepEqual(blobs.map((b) => b.id), ["src_a#1", "src_a#2"], "unique row ids — no duplicate React keys");
		assert.ok(blobs.every((b) => b.chatId === "src_a"), "abort/link identity stays source-scoped");
	});

	it("uses the server's Pi price projection; absent pricing is null, never zero", () => {
		const priced = job({
			usage: {
				model: "openrouter:z-ai/glm-5.3-flash",
				inputTokens: 10_000,
				outputTokens: 1000,
				cacheReadTokens: 5000,
				cacheWriteTokens: 0,
				reasoningTokens: 0,
				steps: 2,
			},
		});
		const blob = toBlobs({ jobs: [priced], extractions: [] })[0]!;
		// Pi-normalized fresh input is priced directly, never reduced by reads.
		assert.equal(blob.cost, 0.00215);
		const missingProjection = toBlobs({ jobs: [{ ...priced, costUsd: undefined }], extractions: [] })[0]!;
		assert.equal(missingProjection.cost, null, "the browser must not invent a fallback price");
		const absent = toBlobs({ jobs: [job()], extractions: [] })[0]!;
		assert.equal(absent.cost, null);
	});

	it("a connection-refused job reads as info — 'needs a sign-in'", () => {
		const refused = job({
			status: "error",
			activity: "failed",
			// the runner composes the envelope's error verbatim
			error: providerKeyMissing("claude-subscription").error,
		});
		const blob = toBlobs({ jobs: [refused], extractions: [] })[0]!;
		assert.equal(blob.activity, "needs a sign-in");
	});

	it("a real failure keeps the runner's honest wording", () => {
		const crashed = job({ status: "error", activity: "failed", error: "FAILED: headless crashed" });
		const real = toBlobs({ jobs: [crashed], extractions: [] })[0]!;
		assert.equal(real.activity, "failed");
	});

	it("context line = LAST step's tokens vs the model limit, never a cumulative sum", () => {
		const base = {
			model: "openrouter:z-ai/glm-5.3-flash",
			inputTokens: 400_000, // running total (much bigger — must NOT feed the line)
			outputTokens: 8_000,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			reasoningTokens: 0,
			steps: 5,
		};
		const withLast = job({
			usage: { ...base, lastStep: step(90_000, 2_000) },
			// The amendment (owner 2026-09-23): the limit is the server's
			// live-catalog join riding the feed — the dock never resolves it.
			contextLimit: 131_072,
		});
		const blob = toBlobs({ jobs: [withLast], extractions: [] })[0]!;
		assert.equal(blob.context?.used, 92_000);
		assert.equal(blob.context?.limit, 131_072);
		// No lastStep yet (capture pending) → "—", even though usage exists.
		const stripped = toBlobs({ jobs: [job({ usage: { ...base } })], extractions: [] })[0]!;
		assert.equal(stripped.context, null);
		// Model missing from the live catalog (historical session,
		// package update) → the feed carries null → no context line.
		const uncatalogued = toBlobs({
			jobs: [job({ usage: { ...base, model: "nope/unknown", lastStep: step(5, 5), } })],
			extractions: [],
		})[0]!;
		assert.equal(uncatalogued.context, null);
		// The numerator is the same cache-inclusive fold the session meter
		// uses (context-meter audit, owner 2026-09-23): provider "input"
		// EXCLUDES cacheRead/cacheWrite, so input+output alone reads wildly
		// low on cache-heavy jobs — 10k+0.5k+120k+30k = 160.5k, not 10.5k.
		const cached = toBlobs({
			jobs: [
				job({
					usage: {
						...base,
						lastStep: {
							inputTokens: 10_000,
							outputTokens: 500,
							cacheReadTokens: 120_000,
							cacheWriteTokens: 30_000,
							reasoningTokens: undefined,
						},
					},
					contextLimit: 200_000,
				}),
			],
			extractions: [],
		})[0]!;
		assert.equal(cached.context?.used, 160_500);
		assert.equal(cached.context?.limit, 200_000);
	});

	it("extraction blobs carry no money/context (—, the doctrine)", () => {
		const blob = toBlobs({
			jobs: [],
			extractions: [{ id: "cx", chatId: "cx", title: "T", phase: "extracting", startedAt: NOW }],
		})[0]!;
		assert.equal(blob.cost, null);
		assert.equal(blob.context, null);
	});

	it("formatElapsed ticks compactly", () => {
		assert.equal(formatElapsed(45_000), "45s");
		assert.equal(formatElapsed(184_000), "3m 04s");
		assert.equal(formatElapsed(4_320_000), "1h 12m");
	});

	it("formatUsd keeps four decimals under $1, two above", () => {
		assert.equal(formatUsd(0.0014), "$0.0014");
		assert.equal(formatUsd(1.5), "$1.50");
	});

	it("formatTokens trims (never 38.0k)", () => {
		assert.equal(formatTokens(38_000), "38k");
		assert.equal(formatTokens(1_234_567), "1.2M");
		assert.equal(formatTokens(950), "950");
	});
});

/** Mounts the section, opens the detail of the row whose title is
 *  `title`, and hands back that detail's text and cost. */
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
			cost: detail?.querySelector('[data-testid="activity-blob-cost"]')?.textContent,
			totalCost: host.querySelector('[data-testid="activity-total-cost"]'),
		};
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
}

describe("activity section render", () => {
	it("renders the ALWAYS-PRESENT header when idle — empty means empty, nothing hides", () => {
		const html = renderToStaticMarkup(<ActivitySection feed={{ jobs: [], extractions: [] }} />);
		assert.match(html, /data-testid="activity-section"/);
		assert.match(html, /Background agents/);
		assert.doesNotMatch(html, /activity-blob-(job|extraction)/, "no rows while idle");
		assert.doesNotMatch(html, /activity-total-cost/, "the cost span is population, not decoration");
	});

	it("renders one row per running process with elapsed time and the abort affordance; the detail carries activity and cost", async () => {
		const feed: ActivityFeed = {
			jobs: [job({ id: "j1", kind: "demo", activity: "building sandbox…", title: "Chain-rule demo" })],
			extractions: [{ id: "cx", chatId: "cx", title: "Old lesson", phase: "merging", startedAt: NOW - 60_000 }],
		};
		const html = renderToStaticMarkup(<ActivitySection feed={feed} />);
		assert.match(html, /data-testid="activity-section"/);
		assert.match(html, /data-testid="activity-blob-job"/);
		assert.match(html, /data-testid="activity-blob-extraction"/);
		assert.match(html, /Chain-rule demo/);
		assert.match(html, /Old lesson/);
		assert.equal(html.match(/data-testid="activity-blob-elapsed"/g)?.length, 2, "elapsed on every row");
		assert.equal(html.match(/data-testid="activity-abort"/g)?.length, 2, "END on every row's face, detail-independent");
		assert.match(html, /aria-label="End Demo builder in Chain-rule demo"/, "the stop button names what it stops");
		assert.match(html, /aria-label="End Extraction — merging in Old lesson"/);
		assert.match(html, /Background agents/);
		assert.doesNotMatch(html, /building sandbox…/, "what it is doing waits in the detail");

		const detail = await openDetail(feed, "Chain-rule demo");
		assert.equal(detail.expanded, "true");
		assert.match(detail.text, /Demo builder/);
		assert.match(detail.text, /building sandbox…/);
		// Unpriced job → "—", never $0.0000 (doctrine).
		assert.equal(detail.cost, "—");
	});

	it("shows a priced job's cost in its detail, with no running total", async () => {
		const usage = {
			model: "openrouter:z-ai/glm-5.3-flash",
			inputTokens: 10_000,
			outputTokens: 1000,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			reasoningTokens: 0,
			steps: 1,
		};
		const detail = await openDetail(
			{
				jobs: [
					job({ id: "a", usage, title: "Limits lesson" }),
					job({ id: "b", usage, title: "Series lesson", createdAt: new Date(NOW - 20_000).toISOString() }),
				],
				extractions: [],
			},
			"Limits lesson",
		);
		// glm-5.3-flash at pi's prices (drifted in pi-ai 0.87.1): $0.002 a job
		assert.equal(detail.cost, "$0.0020");
		assert.equal(detail.totalCost, null, "no running total in the header");
	});
});
