/**
 * A sidebar card's status never runs past the card's edge (round 14, m35:
 * 1 n7, "↳ After Random variables and distri" cut at the pane edge with no
 * ellipsis). The course name gives way first, whole (round 10, 1 m8); words
 * still longer than the line then end in an ellipsis, the icon before them
 * kept. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { RowCard } from "../components/unit-inbox/row-card.tsx";
import { StatusMark } from "../components/unit-inbox/status-mark.tsx";
import { UnitStatusMark } from "../components/unit-inbox/unit-row.tsx";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body><ul>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</ul></body></html>`).document;
const classes = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

const LONG = "After Random variables and distributions";

function card(status: React.ReactNode) {
	return render(<RowCard href="/unit/x/poisson" active={false} rowKey="u:poisson" mark={<span />} course="Probability" status={status} title="Start Poisson distribution" />);
}

describe("a sidebar card's status at the card's edge (m35)", () => {
	it("lets the slot shrink once the course name has given way, so the words end in an ellipsis", () => {
		const doc = card(<StatusMark data-slot="why-mark" size="slot" fact={{ kind: "after" }} words={LONG} />);
		const slot = doc.querySelector('[data-slot="unit-status-slot"]');
		assert.ok(slot !== null, "the status slot");
		assert.ok(!classes(slot).includes("shrink-0"), `the slot shrinks past the name's room: ${classes(slot).join(" ")}`);
		assert.ok(classes(slot).includes("min-w-0"), "and may shrink below its words' width");
		const words = [...slot.querySelectorAll("span")].find((el) => el.textContent === LONG && !classes(el).includes("sr-only"));
		assert.ok(words !== undefined, "the status's words");
		assert.ok(classes(words).includes("truncate") && classes(words).includes("min-w-0"), `the words end in an ellipsis: ${classes(words).join(" ")}`);
		const icon = slot.querySelector("svg")?.parentElement;
		assert.ok(classes(icon).includes("shrink-0"), "the icon is kept whole");
	});

	it("cuts every kind of status the same way, never at the card's edge", () => {
		for (const status of [
			{ kind: "task", words: "Left off yesterday" },
			{ kind: "review", words: "Due since 8 Nov" },
			{ kind: "none", words: "Not started" },
			{ kind: "studied", words: "3d ago" },
			{ kind: "working" },
		] as const) {
			const doc = card(<UnitStatusMark status={status as never} />);
			const words = [...doc.querySelectorAll('[data-slot="unit-status"] > span')].filter((el) => !classes(el).includes("sr-only") && !el.querySelector("svg") && !classes(el).includes("flex"));
			assert.ok(words.length === 1, `${status.kind}: one run of words`);
			assert.ok(classes(words[0]).includes("truncate"), `${status.kind}: ${classes(words[0]).join(" ")}`);
		}
	});
});
