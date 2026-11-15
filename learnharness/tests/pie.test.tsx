/**
 * The app's progress glyphs (components/ui/pie.tsx): an amount at rest,
 * never a loading spinner. Both draw the same full, solid outline at their
 * ink, the whole the share is of; a topic's share is a wedge from the
 * centre, a course's a band inside the outline with its centre hollow;
 * nothing started is the outline alone. Round 5: a partial arc on a faint
 * track, and a dashed empty ring, both read as spinners.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { Pie, Ring } from "../components/ui/pie.tsx";

const svg = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document.querySelector("svg")!;
const outline = (el: Element) => el.querySelector('[data-part="outline"]');

describe("the progress glyphs", () => {
	for (const [name, draw] of [
		["a topic's pie", (share: number) => svg(<Pie share={share} />)],
		["a course's ring", (share: number) => svg(<Ring share={share} />)],
	] as const) {
		it(`${name} draws its whole as a full, solid outline in its own ink`, () => {
			for (const share of [0, 0.3, 1]) {
				const line = outline(draw(share));
				assert.ok(line, `an outline at ${share}`);
				assert.equal(line.getAttribute("stroke-dasharray"), null, "solid, never dashed");
				assert.equal(line.getAttribute("stroke-opacity"), null, "at the ink, never a faint track");
			}
		});

		it(`${name} shows nothing started as the outline alone`, () => {
			assert.equal(draw(0).querySelector('[data-part="share"]'), null);
			assert.ok(draw(0.3).querySelector('[data-part="share"]'));
		});
	}

	it("tells a topic from a course: a wedge from the centre against a band with a hollow centre", () => {
		const wedge = svg(<Pie share={0.3} />).querySelector('[data-part="share"]')!;
		assert.equal(wedge.getAttribute("fill"), "currentColor");
		const band = svg(<Ring share={0.3} />).querySelector('[data-part="share"]')!;
		assert.equal(band.getAttribute("fill"), "none");
		const inner = Number(band.getAttribute("r")) - Number(band.getAttribute("stroke-width")) / 2;
		const outer = Number(band.getAttribute("r")) + Number(band.getAttribute("stroke-width")) / 2;
		const ring = outline(svg(<Ring share={0.3} />))!;
		assert.ok(inner > 2, "the centre stays hollow");
		assert.ok(outer < Number(ring.getAttribute("r")) - Number(ring.getAttribute("stroke-width")) / 2, "the band sits inside the outline, apart from it");
	});

	it("an empty topic is drawn dimmer than a started one, and solid", () => {
		const empty = svg(<Pie share={0} tone="empty" />);
		assert.match(empty.getAttribute("class")!, /text-muted-foreground\/60/);
		assert.equal(outline(empty)!.getAttribute("stroke-dasharray"), null);
	});
});
