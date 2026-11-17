/**
 * Round 15, 1 m8 (m28): the course page's arc list cut "Random variables
 * and distribu…" beside an empty map half. A course page row's title wraps
 * to a second line before its fact gives way, and is never cut.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { CourseTopicRow } from "../components/course-page/course-topic-row.tsx";
import type { CourseTopic } from "../components/course-page/course-model.ts";

const ROW = {
	topic: { handle: "rv", title: "Random variables and distributions", level: "assisted" },
	href: "/unit/prob/rv",
	group: "now",
	current: true,
	standing: { fill: 0.75, slipping: false, words: "Right with help", short: "Right with help" },
	fact: { kind: "here", words: "You are here" },
	factWords: "You are here",
} as unknown as CourseTopic;

describe("a course page row's title", () => {
	for (const compact of [false, true]) {
		it(`shows whole, wrapping rather than cut${compact ? " (compact)" : ""}`, () => {
			const html = renderToStaticMarkup(<ul><CourseTopicRow row={ROW} compact={compact} /></ul>);
			const { document } = parseHTML(`<html><body>${html}</body></html>`);
			const title = document.querySelector('[data-slot="course-topic-title"]')!;
			assert.ok(title.textContent!.startsWith("Random variables and distributions"), title.textContent!);
			const cutting = [title, ...title.querySelectorAll("*")].flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/)).filter((c) => /^(truncate|line-clamp-\d|whitespace-nowrap)$/.test(c));
			assert.deepEqual(cutting, [], "nothing cuts the title");
			const row = document.querySelector('[data-slot="course-topic-row"]')!;
			assert.doesNotMatch(row.getAttribute("class") ?? "", /(^|\s)h-(8|9)(\s|$)/, "the row grows with a second line");
		});
	}
});
