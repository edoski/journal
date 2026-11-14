import React from "react";
(globalThis as Record<string, unknown>).React = React;

import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	CoverageRingDetail,
	CoverageRingGlyph,
	coverageItem,
	ringFill,
	type SessionCoverage,
} from "../components/extraction-coverage.tsx";

/**
 * The extraction-coverage surfaces (extraction-UX redesign, owner-locked
 * dispatch 2026-09-24): the session menu's coverage item (its label and
 * the manual Extract) and the chat top bar's ring meter. The pure
 * folds and the presentational bodies are pinned here; the live fetch
 * chains (menu-open read, the 2s running poll, the turn-settle bump, the
 * settings signal) are Playwright's beat.
 */

function coverage(over: Partial<SessionCoverage> = {}): SessionCoverage {
	return {
		totalMessages: 12,
		coveredCount: 7,
		uncoveredCount: 5,
		coveredTokens: 30_000,
		uncoveredTokens: 2_048,
		running: false,
		lastFoldedAt: null,
		...over,
	};
}

describe("ringFill (the donut's fold, pure)", () => {
	it("fills uncovered/chunk, clamped to [0,1]", () => {
		assert.equal(ringFill(0, 4096), 0);
		assert.equal(ringFill(2048, 4096), 0.5);
		assert.equal(ringFill(4096, 4096), 1);
		assert.equal(ringFill(999_999, 4096), 1, "past the threshold reads full, never >1");
	});

	it("a non-positive threshold reads zero (never NaN, never a fake full)", () => {
		assert.equal(ringFill(2048, 0), 0);
		assert.equal(ringFill(2048, -5), 0);
	});
});

describe("CoverageRingGlyph — the donut", () => {
	it("half fill: the arc covers half the circumference", () => {
		const html = renderToStaticMarkup(<CoverageRingGlyph fill={0.5} running={false} />);
		const C = 2 * Math.PI * 6;
		assert.ok(html.includes(`stroke-dasharray="${0.5 * C} ${C}"`), "fill = uncovered share of the ring");
		assert.ok(html.includes("rotate(-90"), "the arc starts at 12 o'clock");
		assert.ok(!html.includes("animate-pulse"), "steady state is still");
	});

	it("empty fill renders the bare track (no arc beyond a hairline)", () => {
		const html = renderToStaticMarkup(<CoverageRingGlyph fill={0} running={false} />);
		const C = 2 * Math.PI * 6;
		assert.ok(html.includes(`stroke-dasharray="0 ${C}"`));
	});

	it("running: the whole ring pulses (motion = the working-state signal)", () => {
		const html = renderToStaticMarkup(<CoverageRingGlyph fill={0.3} running />);
		assert.ok(html.includes("animate-pulse"), "the implementer's visual call: pulse, not a spinner");
	});
});

describe("CoverageRingDetail — the popover's exact numbers", () => {
	it("carries covered/uncovered tokens, messages, the threshold, the last fold", () => {
		const html = renderToStaticMarkup(
			<CoverageRingDetail
				coverage={coverage({ lastFoldedAt: "2026-09-24T10:00:00Z" })}
				chunkTokens={4096}
			/>,
		);
		assert.match(html, /Uncovered.*2k tokens/s);
		assert.match(html, /Covered.*30k tokens/s);
		assert.match(html, /7 \/ 12/);
		assert.match(html, /Chunk threshold.*4\.1k tokens/s);
		assert.match(html, /Last extraction/);
		assert.ok(!html.includes('data-testid="coverage-ring-running"'), "idle: no status line");
	});

	it("no fold yet renders '—' (never a fake timestamp)", () => {
		const html = renderToStaticMarkup(<CoverageRingDetail coverage={coverage()} chunkTokens={4096} />);
		assert.match(html, /Last extraction.*—/s);
	});

	it("running: the extracting… status line", () => {
		const html = renderToStaticMarkup(
			<CoverageRingDetail coverage={coverage({ running: true })} chunkTokens={4096} />,
		);
		assert.ok(html.includes('data-testid="coverage-ring-running"'));
		assert.match(html, /extracting…/);
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
