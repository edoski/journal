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
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { foldLines } from "../components/study-home/agenda-rows/row-facts.ts";
import { rowStandings } from "../components/study-home/agenda-rows/row-aside.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { lineTopics } from "../components/study-home/needs-you.ts";
import { HOME_WIDTH } from "../components/study-home/study-home.tsx";
import { standingOf } from "../components/course-map/topic-map/topic-standing.ts";
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

describe("the standing", () => {
	it("says where he stands on a row's one topic in the map's words, and nothing on a row of several or none", () => {
		const asides = rowStandings(rows);
		rows.forEach((row, i) => {
			const topics = lineTopics(row);
			const topic = topics.length === 1 ? row.course?.map.topics.find((t) => t.handle === topics[0]) : undefined;
			assert.equal(asides[i], topic ? standingOf(topic).words : null, `row ${i}`);
		});
		assert.ok(asides.some((a) => a !== null));
	});
});

describe("the rows drawn", () => {
	it("draw the standing in its own column, and Current draws none", () => {
		assert.equal(draw().querySelectorAll('[data-slot="today-aside"]').length, 0);
		const words = [...draw(true).querySelectorAll('[data-slot="today-aside"]')].map((el) => el.textContent);
		const shown = foldLines(rows).shown.length;
		assert.deepEqual(words, rowStandings(rows).slice(0, shown).filter((a) => a !== null));
		assert.ok(words.length > 0);
	});
});
