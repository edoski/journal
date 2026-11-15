import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	activeCompactionOf,
	compactionInstructions,
	compactionTriggerTokens,
	newCompactionMarker,
	newUserMessage,
	planTreeToText,
	COMPACTED_HISTORY_HEADER,
	COMPACTION_RESERVE_TOKENS,
	DEFAULT_COMPACTION_THRESHOLD_TOKENS,
	type LhMessage,
} from "../src/core/index.ts";
import { projectView } from "../src/core/view.ts";

/**
 * COMPACTION: Claude Code compacts a lesson's session itself; the app keeps
 * the trigger, the lesson's instructions, and the marker the transcript
 * shows. The laws pinned here:
 * - the trigger is the 150k bound, or the window less its reserve;
 * - the active marker is the NEWEST one (chained compactions rule last);
 * - the instructions demand the four sections in order, plan tree included.
 */

describe("compactionTriggerTokens", () => {
	it("the 150k bound rules big windows; the window rule binds small ones", () => {
		assert.equal(compactionTriggerTokens(1_000_000), DEFAULT_COMPACTION_THRESHOLD_TOKENS);
		assert.equal(compactionTriggerTokens(200_000), 150_000);
		assert.equal(compactionTriggerTokens(100_000), 100_000 - COMPACTION_RESERVE_TOKENS);
		assert.equal(compactionTriggerTokens(undefined), 150_000);
	});
});

// ─── the marker + the active scan ───────────────────────────────────────────

describe("the compaction marker", () => {
	it("content is the header + summary; details carry the cut", () => {
		const marker = newCompactionMarker("The learner knows X.", {
			firstKeptMessageId: "m9",
			tokensBefore: 180_000,
			model: "openai:gpt-5.2",
			at: "2026-10-05T12:00:00.000Z",
		});
		assert.equal(marker.customType, "compaction");
		assert.ok(marker.content.startsWith(COMPACTED_HISTORY_HEADER));
		assert.ok(marker.content.endsWith("The learner knows X."));
		assert.equal((marker.details as { firstKeptMessageId: string }).firstKeptMessageId, "m9");
	});

	it("activeCompactionOf: the NEWEST marker rules (chained compactions)", () => {
		const old = newCompactionMarker("old", { firstKeptMessageId: "m1", tokensBefore: 1, at: "t" });
		const fresh = newCompactionMarker("fresh", { firstKeptMessageId: "m5", tokensBefore: 2, at: "t" });
		const active = activeCompactionOf([old as never, newUserMessage("x"), fresh as never]);
		assert.equal(active!.content.endsWith("fresh"), true);
	});

	it("a marker with malformed details is not an active compaction (defensive)", () => {
		const broken = { ...newCompactionMarker("s", { firstKeptMessageId: "m1", tokensBefore: 1, at: "t" }), details: {} };
		assert.equal(activeCompactionOf([broken as never]), null);
	});
});

describe("compactionInstructions + planTreeToText", () => {
	it("the instructions demand the four sections in order and carry the plan tree verbatim", () => {
		const text = compactionInstructions("teach", "- [done] A (a1)\n- A → B");
		const order = ["## The learner's understanding", "## The teaching arc", "## The plan dependency tree", "## The current moment"].map((s) => text.indexOf(s));
		assert.ok(order.every((i) => i >= 0), "every section is present");
		assert.deepEqual(order, [...order].sort((a, b) => a - b), "sections appear in the ruled order");
		const tree = text.indexOf("- [done] A (a1)\n- A → B");
		assert.ok(tree > order[2]! && tree < order[3]!, "the plan tree sits in its own section");
		assert.ok(compactionInstructions("teach", null).includes("No plan tree exists"), "a lesson without a tree says so");
	});

	it("planTreeToText: statuses derive from the transcript; edges render; empty tree → null", () => {
		assert.equal(planTreeToText(undefined, []), null);
		const tree = {
			nodes: [
				{ id: "a", title: "Alpha", summary: "first" },
				{ id: "b", title: "Beta" },
			],
			edges: [{ from: "a", to: "b" }],
			version: 1,
		};
		const text = planTreeToText(tree as never, [])!;
		assert.ok(text.includes("Alpha (a) — first"));
		assert.ok(text.includes("Alpha → Beta"));
	});
});

// ---------------------------------------------------------------------------
// THE VIEW FOLD (owner round 14): two dividers from one marker —
// the minimal moment divider where the user is, the longer cut divider
// at the kept boundary. Both carry the full summary payload.
// ---------------------------------------------------------------------------
describe("projectView compaction dividers", () => {
	const record = (): LhMessage[] => [
		{ id: "old1", role: "user", content: "earliest", timestamp: 1 },
		{ id: "kept", role: "user", content: "recent", timestamp: 2 },
		newCompactionMarker("SUMMARY TEXT", {
			firstKeptMessageId: "kept",
			tokensBefore: 12345,
			at: new Date(0).toISOString(),
		}) as unknown as LhMessage,
	];

	it("emits the cut divider BEFORE the first kept message", () => {
		const view = projectView(record());
		const idx = view.findIndex((m) => m.parts.some((p) => p.type === "data-compaction-cut"));
		const keptIdx = view.findIndex((m) => m.parts.some((p) => p.type === "text" && p.text === "recent"));
		assert.ok(idx !== -1, "the cut divider exists");
		assert.ok(keptIdx !== -1);
		assert.equal(idx, keptIdx - 1, "immediately before the kept message");
		const part = view[idx]!.parts.find((p) => p.type === "data-compaction-cut")!;
		assert.equal((part.data as { content: string }).content.includes("SUMMARY TEXT"), true);
	});

	it("Claude Code's own compaction keeps no verbatim tail: the cut draws at the marker, before what came after it (round 6, report 6 minor 4)", () => {
		const view = projectView([
			{ id: "old1", role: "user", content: "earliest", timestamp: 1 },
			newCompactionMarker("SUMMARY TEXT", { firstKeptMessageId: "", tokensBefore: 52000, at: new Date(0).toISOString() }) as unknown as LhMessage,
			{ id: "next", role: "user", content: "after it", timestamp: 3 },
		]);
		const cut = view.findIndex((m) => m.parts.some((p) => p.type === "data-compaction-cut"));
		const earliest = view.findIndex((m) => m.parts.some((p) => p.type === "text" && p.text === "earliest"));
		const next = view.findIndex((m) => m.parts.some((p) => p.type === "text" && p.text === "after it"));
		assert.ok(cut > earliest && cut < next, "one divider, between the summarized history and what follows");
		assert.equal(view.filter((m) => m.parts.some((p) => p.type === "data-compaction-cut")).length, 1);
	});

	it("emits the moment divider at the marker (the transcript tail)", () => {
		const view = projectView(record());
		const moment = view.find((m) => m.parts.some((p) => p.type === "data-compaction"));
		assert.ok(moment, "the moment divider exists");
		const part = moment!.parts.find((p) => p.type === "data-compaction")!;
		assert.equal((part.data as { details: { tokensBefore: number } }).details.tokensBefore, 12345);
		// and it renders AFTER the kept message (the compaction moment is
		// the tail — where the user is when it happens)
		const keptIdx = view.findIndex((m) => m.parts.some((p) => p.type === "text" && p.text === "recent"));
		assert.ok(view.indexOf(moment!) > keptIdx);
	});
});
