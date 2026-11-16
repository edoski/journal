/**
 * A lesson map's cards fit its pane, every title whole (round 14, m34: 3 N8,
 * 1, 2; "One-to-one against onto for square…" on Invertible's map and "What
 * random variables and…" on Binomial's and Random variables' maps). Fixed
 * wider cards broke the four-across rule in the pane (round 13's
 * integrator), so a card's width is the measured pane's clear middle split
 * into the plan's widest row, at most four, no wider than its longest title
 * needs on one line; every card as tall as the tallest title needs. The
 * measuring is the browser's (lesson-map.tsx); these are the rules it feeds.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { SessionPlan } from "../src/core/contracts/topic.ts";
import { PLAN_MAP_CAP } from "../src/core/contracts/plan.ts";
import { NODE_GAP } from "../components/course-map/topic-map/topic-map-layout.ts";
import { STEP_SIZE, stepCard, stepsAcross, stepsLayout } from "../components/unit-inbox/topic-page/steps/steps-facts.ts";
import { STEP_CARD, StepFace } from "../components/unit-inbox/topic-page/steps/step-node.tsx";

/** The topic page's map pane at 1512×982 with the sidebar open (measured in the running app, 16 Nov 2026), and its fade. */
const PANE = 864;
const FADE = { x: 24 };

const plan = (nodes: string[], edges: Array<[string, string]>): SessionPlan => ({
	id: "chat_x",
	tree: { nodes: nodes.map((id) => ({ id, title: id })), edges: edges.map(([from, to]) => ({ from, to })) },
	current: null,
	visited: [],
});

/** Lens 3's Invertible lesson: twelve steps, five side by side in its widest row. */
const INVERTIBLE = plan(
	["undo", "collisions", "reach", "square-case", "det-test", "inverse-matrix", "inverse-2x2", "row-reduce", "product-inverse", "det-inverse", "solve-inverse", "imt"],
	[
		["undo", "collisions"], ["undo", "reach"], ["collisions", "square-case"], ["reach", "square-case"], ["square-case", "det-test"], ["undo", "inverse-matrix"],
		["inverse-matrix", "inverse-2x2"], ["inverse-matrix", "row-reduce"], ["square-case", "row-reduce"], ["inverse-matrix", "product-inverse"], ["product-inverse", "det-inverse"],
		["inverse-matrix", "solve-inverse"], ["det-test", "imt"], ["row-reduce", "imt"], ["solve-inverse", "imt"],
	],
);
/** The seeded Random variables lesson: four steps in a chain. */
const CHAIN = plan(["meaning", "rule", "example", "own"], [["meaning", "rule"], ["rule", "example"], ["example", "own"]]);

describe("a lesson map's cards (m34)", () => {
	it("are sized for the plan's widest row, at most four across", () => {
		assert.equal(PLAN_MAP_CAP.across, 4);
		assert.equal(stepsAcross(stepsLayout(INVERTIBLE).layout), 4, "five side by side are sized four across");
		assert.equal(stepsAcross(stepsLayout(CHAIN).layout), 1);
	});

	it("split the pane's clear middle into those columns, so four side by side fit at full size", () => {
		const column = Math.floor((PANE - FADE.x * 2 - 3 * NODE_GAP) / 4);
		const card = stepCard(4, PANE, FADE, 500, () => 80);
		assert.deepEqual(card, { width: column, height: 80 });
		const four = plan(["a", "b", "c", "d", "e"], [["a", "b"], ["a", "c"], ["a", "d"], ["a", "e"]]);
		const { layout } = stepsLayout(four, card);
		assert.ok(layout.width <= PANE - FADE.x * 2, `the row of four, ${layout.width}px, fits the ${PANE - FADE.x * 2}px clear middle`);
	});

	it("grow no wider than the longest title needs on one line, and keep the least size the pane allows", () => {
		assert.equal(stepCard(1, PANE, FADE, 330.4, () => 0).width, 331, "a chain's cards hold its longest title on one line");
		assert.equal(stepCard(1, PANE, FADE, 120, () => 0).width, STEP_SIZE.width, "short titles keep the least card");
		assert.equal(stepCard(4, 600, FADE, 400, () => 0).width, Math.floor((600 - 48 - 72) / 4), "a narrow pane narrows the card below the least");
	});

	it("are all as tall as the tallest title needs at that width, at least two lines' room", () => {
		const asked: number[] = [];
		const card = stepCard(4, PANE, FADE, 600, (width) => {
			asked.push(width);
			return 101.2;
		});
		assert.deepEqual(asked, [card.width], "the height is measured at the chosen width");
		assert.equal(card.height, 102);
		assert.equal(stepCard(4, PANE, FADE, 600, () => 40).height, STEP_SIZE.height);
		const { layout } = stepsLayout(INVERTIBLE, card);
		assert.deepEqual(layout.node, card, "one box for every step");
	});

	it("draw every title whole, never clamped to two lines", () => {
		const html = renderToStaticMarkup(<div className={STEP_CARD}><StepFace status="current" title="One-to-one against onto for square matrices" /></div>);
		const title = parseHTML(`<html><body>${html}</body></html>`).document.querySelector('[data-slot="topic-step-title"]');
		assert.ok(title !== null, "the step's title");
		const classes = (title.getAttribute("class") ?? "").split(/\s+/);
		assert.ok(!classes.some((c) => /^(line-clamp-\d|truncate)$/.test(c)), `never cut: ${classes.join(" ")}`);
		assert.match(STEP_CARD, /\bpy-3\b/, "the card pads a wrapped title clear of its edges");
	});
});
