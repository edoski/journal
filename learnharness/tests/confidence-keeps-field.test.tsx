/**
 * Setting how sure he is never takes his field's focus (round 6, new
 * course D3: after a click on the meter, Enter pressed the meter again,
 * so his confidence changed and nothing was sent).
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { ConfidenceIcon } from "../components/lesson/prose/prose-composer.tsx";

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
});

test("a press on the meter leaves focus in his field, so Enter sends with the confidence he chose", async () => {
	const host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const picks: string[] = [];
	await act(async () => root!.render(<ConfidenceIcon value="neutral" onChange={(next) => picks.push(next)} />));
	const meter = document.querySelector<HTMLElement>('[data-testid="confidence-choice"]')!;
	const down = new dom.window.Event("mousedown", { bubbles: true, cancelable: true });
	await act(async () => meter.dispatchEvent(down));
	assert.equal(down.defaultPrevented, true, "the press does not move focus out of his field");
	await act(async () => meter.click());
	assert.deepEqual(picks, ["confident"]);
});

test("the meter's bars are wider than an icon's 2px stroke, with round ends (Edo, 15 Nov 2026)", async () => {
	const host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => root!.render(<ConfidenceIcon value="neutral" onChange={() => {}} />));
	const svg = document.querySelector('[data-testid="confidence-choice"] svg')!;
	assert.equal(svg.querySelectorAll("line").length, 3, "three bars");
	assert.ok(Number(svg.getAttribute("stroke-width")) > 3, `bars wider than a hairline: ${svg.getAttribute("stroke-width")}`);
	assert.equal(svg.getAttribute("stroke-linecap"), "round");
});
