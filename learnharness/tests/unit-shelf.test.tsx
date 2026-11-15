/**
 * A sidebar shelf (components/unit-inbox/unit-shelf.tsx) names its one
 * "more" action one way: open, it shows its first rows, then Show the rest,
 * and one press shows every row.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { UnitShelf } from "../components/unit-inbox/unit-shelf.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(async () => {
	await act(async () => root?.unmount());
	host?.remove();
});

async function mount(count: number) {
	const items = Array.from({ length: count }, (_, i) => `Session ${i + 1}`);
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<ul>
				<UnitShelf id="other" label="Other sessions" items={items} folded={false} onFoldedChange={() => {}} isActive={() => false} waits={() => false} renderItem={(item) => <li key={item} data-testid="row">{item}</li>} />
			</ul>,
		),
	);
}
const rows = () => document.querySelectorAll('[data-testid="row"]').length;
const more = () => document.querySelector('[data-slot="unit-shelf-more"]') as HTMLElement | null;

test("a long shelf offers Show the rest, and one press shows every row", async () => {
	await mount(60);
	assert.equal(rows(), 10);
	assert.equal(more()!.textContent, "Show the rest");
	await act(async () => more()!.click());
	assert.equal(rows(), 60);
	assert.ok(more() === null);
});

test("a shelf that fits shows no more row", async () => {
	await mount(10);
	assert.equal(rows(), 10);
	assert.ok(more() === null);
});
