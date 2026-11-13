/**
 * The Link switch on the hybrid topic page: how the list and
 * the lesson map are tied. Split draws both in one surface with a hairline
 * between them; connected draws the panes as they are with a line layer
 * whose path runs down the gap and across to the step. Same tsx
 * classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { LINK_OPTIONS, POLISH_GROUPS } from "../components/design-variant.ts";
import { LINK_PANES } from "../components/unit-inbox/topic-page/link/link-options.ts";
import { PlainPanes, type PanesProps } from "../components/unit-inbox/topic-page/link/link-panes.tsx";
import { connectorPath } from "../components/unit-inbox/topic-page/link/connected-panes.tsx";

const side = <div data-slot="topic-history" />;
const map = <div data-slot="topic-lesson-map" />;
const panes = (Panes: React.ComponentType<PanesProps>) => parseHTML(`<html><body>${renderToStaticMarkup(<Panes side={side} map={map} />)}</body></html>`).document.querySelector('[data-slot="topic-panes"]')!;

describe("the Link switch", () => {
	it("offers split and connected, needing no other switch", () => {
		assert.deepEqual(LINK_OPTIONS, ["split", "connected"]);
		assert.equal(POLISH_GROUPS.find((group) => group.id === "link")?.requires, undefined);
	});

	it("draws the list and the map in every option, and names the option on the panes for the rows to answer", () => {
		assert.equal(panes(PlainPanes).getAttribute("data-link"), null);
		for (const option of LINK_OPTIONS) {
			const root = panes(LINK_PANES[option]);
			assert.equal(root.getAttribute("data-link"), option);
			assert.ok(root.querySelector('[data-slot="topic-history"]') && root.querySelector('[data-slot="topic-lesson-map"]'), option);
		}
	});

	it("runs the connector down the gap from the row, then across to the step, with one bend", () => {
		assert.equal(connectorPath({ from: { x: 400, y: 50 }, to: { x: 640, y: 300 } }), "M 400 50 V 292 Q 400 300, 408 300 H 640");
		assert.equal(connectorPath({ from: { x: 400, y: 300 }, to: { x: 640, y: 50 } }), "M 400 300 V 58 Q 400 50, 408 50 H 640");
		assert.match(connectorPath({ from: { x: 400, y: 100 }, to: { x: 640, y: 104 } }), /^M 400 100 C .* H 640$/);
	});
});
