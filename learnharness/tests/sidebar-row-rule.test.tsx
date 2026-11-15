/**
 * Every sidebar row follows one height rule (components/unit-inbox/row-card.md):
 * its title, two lines at most, and one 20px line that holds its status, so
 * a row's height follows from its title alone. A card's status stays on its
 * course line whatever its length (the course name gives way); a shelf
 * row's status always has its own line under the title, never beside it.
 * Round 5: rows ran 36, 60, 80 or 100px as statuses dropped when titles wrapped.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { buildInbox } from "../components/unit-inbox/units.ts";
import { SessionSlimRow, TopicCard, TopicSlimRow } from "../components/unit-inbox/unit-row.tsx";
import { CHATS, COURSES, TODAY } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;
const classes = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

describe("the sidebar's one row rule", () => {
	const unit = buildInbox(COURSES, CHATS, null).active[0]!;

	it("keeps a card's status on its course line, the name giving way, and its title to two lines", () => {
		const doc = render(<TopicCard unit={unit} today={TODAY} active={false} />);
		const slot = doc.querySelector('[data-slot="unit-status-slot"]')!;
		const line = slot.parentElement!;
		assert.ok(line.querySelector('[data-slot="unit-card-course"]'), "the status shares the course line");
		assert.ok(!classes(line).includes("flex-wrap"), "the course line never wraps the status under the name");
		const name = doc.querySelector('[data-slot="unit-card-course"]');
		assert.ok(!classes(name).includes("truncate"), "never a cut name, \"Linear Alg…\" (round 10, 1 m8)");
		assert.ok(["flex-wrap", "overflow-hidden", "h-5"].every((c) => classes(name).includes(c)), "a name too long for the room wraps out of sight whole; the badge still names the course");
		assert.equal(name?.textContent, unit.course.title, "a screen reader still reads it");
		assert.ok(classes(doc.querySelector('[data-slot="unit-row-title"]')).includes("line-clamp-2"), "two title lines at most");
	});

	it("gives a shelf row's status a line of its own under a title of two lines at most", () => {
		for (const doc of [
			render(<TopicSlimRow unit={unit} today={TODAY} active={false} />),
			render(<SessionSlimRow chat={CHATS[0]!} today={TODAY} active={false} onOpen={() => {}} />),
		]) {
			const row = doc.querySelector('[data-testid="unit-row"], [data-testid="session-row"]')!;
			const title = row.querySelector('[data-slot="unit-row-title"]')!;
			assert.ok(classes(title).includes("line-clamp-2"), "two title lines at most");
			const statusLine = row.querySelector('[data-slot="unit-status-slot"]')!;
			assert.ok(statusLine.parentElement === row, "the status is a line of the row");
			assert.ok(row.lastElementChild === statusLine, "the status is always the row's last line");
			assert.ok(classes(statusLine).includes("h-5"), "one 20px line, as a card's course line");
			assert.ok(classes(row).includes("py-2") && classes(row).includes("flex-col"), "a card's padding, lines stacked");
		}
	});
});
