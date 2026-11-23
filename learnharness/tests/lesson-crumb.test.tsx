/**
 * The lesson's topic crumb is a link even when the lesson is named after its
 * topic, and no crumb is cut at a fixed width (round 8, 2 m8 and 3 m7).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { LessonTopBar, crumbEnd } from "../components/lesson/lesson-top-bar.tsx";

describe("the lesson's top bar (2 m8, 3 m7)", () => {
	const render = (node: React.ReactNode) => parseHTML(`<html><body><header>${renderToStaticMarkup(node)}</header></body></html>`).document;

	it("ends on the topic as a link when the lesson is named after it", () => {
		assert.equal(crumbEnd("Eigenvalues and eigenvectors", "Eigenvalues and eigenvectors"), null);
		const doc = render(<LessonTopBar title={null} course="Linear Algebra" courseHref="/unit/la" topic={{ title: "Eigenvalues and eigenvectors", href: "/unit/la/eigen" }} />);
		const topicLink = doc.querySelector('[data-slot="crumb"][data-kind="topic"]');
		assert.equal(topicLink?.tagName, "A");
		assert.equal(topicLink?.getAttribute("href"), "/unit/la/eigen");
		assert.equal(doc.querySelectorAll('[data-slot="crumb-chevron"]').length, 1, "one chevron between two crumbs, none trailing");
	});

	it("cuts no crumb at a fixed width", () => {
		const doc = render(<LessonTopBar title={<span>Rank practice</span>} course="Linear Algebra" courseHref="/unit/la" topic={{ title: "Rank and the column space", href: "/unit/la/rank" }} />);
		for (const crumb of doc.querySelectorAll('[data-slot="crumb"][data-kind="course"], [data-slot="crumb"][data-kind="topic"]')) assert.doesNotMatch(crumb.getAttribute("class") ?? "", /max-w-/);
	});
});
