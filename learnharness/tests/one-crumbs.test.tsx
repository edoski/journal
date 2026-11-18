/**
 * "Where am I" is one trail (`Crumbs`, components/nav/crumbs.tsx; audit 17
 * Nov 2026, finding 14): the lesson's top bar (Course › Topic › title) and
 * the topic page's head (Course › Arc) draw the same crumbs part, with the
 * same chevron and the same link, and the arc is its one label
 * (`ArcLabel`), its number then its name. Before, each drew its own
 * chevrons and links, the topic head's chevron at full muted ink.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { LessonTopBar } from "../components/lesson/lesson-top-bar.tsx";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { TopicHead } from "../components/unit-inbox/topic-page/topic-head.tsx";
import { arcHref, courseHref } from "../components/unit-inbox/unit-href.ts";
import { LINALG_ARCS } from "./fixtures/now-demo.ts";

const render = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;

const rank = LINALG_ARCS.map.topics.find((t) => t.handle === "rank")!;
const lesson = render(<LessonTopBar title={<span>Rank practice</span>} course="Linear Algebra" courseHref={courseHref("/s/linalg")} topic={{ title: rank.title, href: "/unit/la/rank" }} />);
const head = render(<TopicHead facts={topicFacts({ course: LINALG_ARCS, topic: rank, chats: [], read: null })} />);

/** The trail's crumbs, as kind and words, with the class every chevron and every course link wears. */
function trail(doc: Document) {
	const crumbs = doc.querySelectorAll('[data-slot="crumbs"]');
	assert.equal(crumbs.length, 1, "one trail");
	const box = crumbs[0]!;
	const chevrons = [...box.querySelectorAll('[data-slot="crumb-chevron"]')].map((c) => c.getAttribute("class"));
	assert.equal(new Set(chevrons).size, 1, "every chevron alike");
	return {
		kinds: [...box.querySelectorAll('[data-slot="crumb"]')].map((c) => c.getAttribute("data-kind")),
		chevron: chevrons[0],
		link: box.querySelector('[data-slot="crumb"][data-kind="course"]')?.getAttribute("class"),
	};
}

describe("where am I, one trail", () => {
	it("the lesson's top bar and the topic page's head draw the same crumbs, chevron and link", () => {
		const a = trail(lesson);
		const b = trail(head);
		assert.deepEqual(a.kinds, ["course", "topic"]);
		assert.deepEqual(b.kinds, ["course", "arc"]);
		assert.ok(a.chevron && a.chevron === b.chevron, "the same chevron");
		assert.match(a.chevron, /text-muted-foreground\/60/, "at 60%");
		assert.ok(a.link && a.link === b.link, "the same course link");
	});

	it("the topic head's arc is its one label, a link opening the course page on that arc", () => {
		const arc = head.querySelector('[data-slot="crumbs"] [data-slot="crumb"][data-kind="arc"]')!;
		assert.equal(arc.getAttribute("href"), arcHref("/s/linalg", "systems"));
		const label = arc.querySelector('[data-slot="arc-label"]')!;
		assert.equal(label.getAttribute("data-arc"), "systems");
		assert.equal(label.querySelector('[data-slot="arc-number"]')?.textContent, "2");
		assert.doesNotMatch(head.querySelector('[data-slot="crumbs"]')!.textContent ?? "", /·/, "never Course · Arc");
	});
});
