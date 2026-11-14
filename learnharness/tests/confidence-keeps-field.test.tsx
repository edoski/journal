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
import { createRoot, type Root } from "react-dom/client";
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
