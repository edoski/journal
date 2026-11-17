/**
 * The sidebar's row titles follow T3 Code's sidebar (docs/visual-system.md,
 * Type; components/unit-inbox/row-card.md): a card's title is T3 Code's
 * thread title, 14px on a 20px line at 500 in full ink, and a shelf row at
 * rest is its quiet row, 400 at 75% ink. Round 14: the Visual system set
 * the cards in Headline, 13px at 700, and Edo read it as bold beside T3
 * Code's ("This text should not be bold").
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { buildInbox } from "../components/unit-inbox/units.ts";
import { SessionSlimRow, TopicCard } from "../components/unit-inbox/unit-row.tsx";
import { CHATS, COURSES, TODAY } from "./fixtures/now-demo.ts";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const titleClasses = (node: React.ReactNode) => {
	const { document } = parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`);
	return (document.querySelector('[data-slot="unit-row-title"]')?.getAttribute("class") ?? "").split(/\s+/);
};
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const token = (name: string) => css.match(new RegExp(`--text-${name}:\\s*([^;]+);`))?.[1]?.trim();

describe("the sidebar's titles are T3 Code's", () => {
	const unit = buildInbox(COURSES, CHATS, null).active[0]!;

	it("sets T3 Code's thread title, 14 on 20 at 500, and its quiet row at 400", () => {
		assert.equal(token("sidebar-title"), "14px");
		assert.equal(token("sidebar-title--line-height"), "calc(20 / 14)");
		assert.equal(token("sidebar-title--font-weight"), "500", "medium, as T3 Code's font-medium, never bold");
		assert.equal(token("sidebar-title-quiet"), "14px");
		assert.equal(token("sidebar-title-quiet--line-height"), "calc(20 / 14)");
		assert.equal(token("sidebar-title-quiet--font-weight"), "400", "T3 Code's font-normal on a quiet row");
	});

	it("gives every card its full-ink title and never Headline's bold", () => {
		const card = titleClasses(<TopicCard unit={unit} map={COURSES.find((c) => c.map.workspace === unit.course.workspace)!.map} chats={CHATS} today={TODAY} active={false} />);
		assert.ok(card.includes("text-sidebar-title") && card.includes("text-foreground"), `a card's title: ${card.join(" ")}`);
		assert.ok(!card.includes("text-headline"), "Headline is 700: Edo read it as bold");
	});

	it("keeps a shelf row quiet at rest and full ink when open or waiting on him", () => {
		for (const quiet of [
			titleClasses(<SessionSlimRow chat={CHATS[3]!} today={TODAY} active={false} onOpen={() => {}} />),
		]) {
			assert.ok(quiet.includes("text-sidebar-title-quiet") && quiet.includes("text-foreground/75"), `a quiet row: ${quiet.join(" ")}`);
			assert.ok(quiet.includes("group-hover/sidebar-row:text-foreground"), "full ink on hover, as T3 Code's");
		}
		for (const loud of [
			titleClasses(<SessionSlimRow chat={CHATS[3]!} today={TODAY} active onOpen={() => {}} />),
			titleClasses(<SessionSlimRow chat={CHATS[0]!} today={TODAY} active={false} onOpen={() => {}} />),
		]) {
			assert.ok(loud.includes("text-sidebar-title") && loud.includes("text-foreground"), `the open row or a session waiting on him: ${loud.join(" ")}`);
			assert.ok(!loud.includes("text-sidebar-title-quiet"));
		}
	});
});
