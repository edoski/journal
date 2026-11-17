/**
 * The linked columns (components/linked-columns/linked-columns.md): the
 * list beside the map on the course page and the topic page, with nothing
 * around them and no line between them. Same tsx classic-JSX shim as the
 * other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { LinkedColumns } from "../components/linked-columns/linked-columns.tsx";

describe("the linked columns", () => {
	const render = () =>
		parseHTML(`<html><body>${renderToStaticMarkup(<LinkedColumns data-slot="topic-panes" list={<div data-slot="topic-history" />} map={<div data-slot="topic-lesson-map" />} />)}</body></html>`).document;

	it("lays the list beside the map with nothing around or between them, keeping the page's slot", () => {
		const root = render().querySelector('[data-slot="topic-panes"]')!;
		assert.match(root.getAttribute("class")!, /grid-cols-\[minmax\(0,24rem\)_minmax\(0,1fr\)\]/);
		assert.match(root.getAttribute("class")!, /gap-6/);
		assert.doesNotMatch(root.getAttribute("class")!, /border|rounded|bg-/, "no frame and no fill");
		assert.deepEqual([...root.children].map((column) => column.firstElementChild!.getAttribute("data-slot")), ["topic-history", "topic-lesson-map"]);
		assert.ok(root.querySelector("svg") === null, "no line between a row and its card");
	});
});
