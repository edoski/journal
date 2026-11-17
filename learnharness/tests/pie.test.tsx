/**
 * A topic's pie (components/ui/pie.tsx): an amount at rest, never a
 * loading spinner. A full, solid outline at its ink, the whole the share
 * is of, and the share a wedge from the centre; nothing started is the
 * outline alone. Round 5: a partial arc on a faint track, and a dashed
 * empty ring, both read as spinners.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { Pie } from "../components/ui/pie.tsx";

const svg = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document.querySelector("svg")!;
const outline = (el: Element) => el.querySelector('[data-part="outline"]');

describe("a topic's pie", () => {
	const draw = (share: number) => svg(<Pie share={share} />);
	it("draws its whole as a full, solid outline in its own ink", () => {
		for (const share of [0, 0.3, 1]) {
			const line = outline(draw(share));
			assert.ok(line, `an outline at ${share}`);
			assert.equal(line.getAttribute("stroke-dasharray"), null, "solid, never dashed");
			assert.equal(line.getAttribute("stroke-opacity"), null, "at the ink, never a faint track");
		}
	});

	it("shows nothing started as the outline alone, and a share as a wedge from the centre", () => {
		assert.ok(draw(0).querySelector('[data-part="share"]') === null);
		assert.equal(draw(0.3).querySelector('[data-part="share"]')!.getAttribute("fill"), "currentColor");
	});

	it("an empty topic is drawn dimmer than a started one, and solid", () => {
		const empty = svg(<Pie share={0} tone="empty" />);
		assert.match(empty.getAttribute("class")!, /text-muted-foreground\/60/);
		assert.equal(outline(empty)!.getAttribute("stroke-dasharray"), null);
	});
});
