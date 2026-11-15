/**
 * A wider Home (Edo's notes, 15 Nov 2026, N1: "is there any super useful
 * info at all that we could cleanly fit into it"): Proposed widens Home to
 * the course page's frame and gives each Today row where he stands on its
 * one topic, which he picked over the course's exam day. Current keeps the
 * old width and draws none.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { foldLines } from "../components/study-home/agenda-rows/row-facts.ts";
import { rowStanding } from "../components/study-home/agenda-rows/row-standing.ts";
import { whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import type { TodayRow } from "../components/study-home/study-facts.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { lineTopics, needsYouNow } from "../components/study-home/needs-you.ts";
import { HOME_WIDTH } from "../components/study-home/study-home.tsx";
import { slipBeside, standingOf } from "../components/course-map/topic-map/topic-standing.ts";
import { CHATS, COURSES, TODAY } from "./fixtures/now-demo.ts";

const { rows } = needsYouNow(COURSES, CHATS, TODAY);
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const draw = (standing = false) =>
	parseHTML(
		`<html><body>${renderToStaticMarkup(
			<AppRouterContext.Provider value={router as never}>
				<HybridRows rows={rows} busy={false} onContinue={() => {}} standing={standing} />
			</AppRouterContext.Provider>,
		)}</body></html>`,
	).document;

describe("Home's width (N1)", () => {
	it("keeps Current at its width and widens Proposed to the course page's frame", () => {
		assert.equal(HOME_WIDTH.current, "max-w-[60rem]");
		assert.equal(HOME_WIDTH.proposed, "max-w-[80rem]");
	});
});

/** The row's one topic once started; a topic not started has no standing on a row. */
const topicOf = (row: TodayRow) => {
	const topics = lineTopics(row);
	const topic = topics.length === 1 ? row.course?.map.topics.find((t) => t.handle === topics[0]) : undefined;
	return topic?.level === "new" ? undefined : topic;
};
const titleOf = (row: TodayRow) => (h: string) => row.course?.map.topics.find((t) => t.handle === h)?.title ?? h;

describe("the standing", () => {
	it("says where he stands on a row's one topic as the map does, and nothing on a row of several, none, or a topic not started", () => {
		rows.forEach((row, i) => {
			const topic = topicOf(row);
			assert.deepEqual(rowStanding(row)?.standing ?? null, topic ? standingOf(topic) : null, `row ${i}`);
		});
		assert.ok(rows.some((row) => rowStanding(row) !== null));
		const row = rows.find((r) => rowStanding(r) !== null)!;
		const [handle] = lineTopics(row);
		const map = row.course!.map;
		const fresh = { ...row, course: { ...row.course!, map: { ...map, topics: map.topics.map((t) => (t.handle === handle ? { ...t, level: "new" as const } : t)) } } };
		assert.equal(rowStanding(fresh), null, "a topic not started: its row reads Start, never Not started beside it");
	});

	it("adds why the engine calls the topic weak, as the topic page's head does, unless the row's reason is the miss", () => {
		rows.forEach((row, i) => {
			const topic = topicOf(row);
			const slip = topic && whyOf(row)?.kind !== "missed" ? slipBeside(topic, titleOf(row) as never) : null;
			assert.deepEqual(rowStanding(row)?.slip ?? null, slip, `row ${i}`);
		});
		assert.ok(rows.some((row) => rowStanding(row)?.slip), "the demo day has a row on a weak topic");
	});
});

describe("the rows drawn", () => {
	it("draw the pie and the standing words on the lesson line, the slip with its own icon on the course line, and Current draws none", () => {
		const current = draw();
		assert.equal(current.querySelectorAll('[data-slot="today-standing"], [data-slot="today-slip"]').length, 0);
		const proposed = draw(true);
		const lines = [...proposed.querySelectorAll('[data-slot="today-line"]')];
		const shown = foldLines(rows).shown;
		assert.equal(lines.length, shown.length);
		shown.forEach((row, i) => {
			const facts = rowStanding(row);
			const cell = lines[i]!.querySelector('[data-slot="today-standing"]');
			assert.equal(cell?.textContent ?? null, facts?.standing.words ?? null, `row ${i}`);
			if (facts) assert.equal(cell!.querySelector('[data-slot="topic-glyph"]')?.getAttribute("data-fill"), String(facts.standing.fill), `row ${i}`);
			const slip = lines[i]!.querySelector('[data-slot="today-slip"]');
			assert.equal(slip?.textContent ?? null, facts?.slip?.words ?? null, `row ${i}`);
			if (facts?.slip) assert.equal(slip!.getAttribute("data-slip"), facts.slip.key, `row ${i}`);
		});
	});
});
