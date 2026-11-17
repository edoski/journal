/**
 * The shared page frame: the head's parts in order, the press as a link or
 * a button in the accent, and nothing drawn for a part a page leaves out.
 * Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { PageAction, PageFact, PageFrame, PageHead } from "../components/page-frame/page-frame.tsx";

const render = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(<>{node}</>)}</body></html>`).document;

describe("the page frame", () => {
	it("draws the eyebrow, the title with its actions, what to do next, the standing line and the lines under it, in that order", () => {
		const document = render(
			<PageFrame>
				<PageHead
					eyebrow="Linear Algebra"
					title="Eigenvalues"
					actions={<PageAction href="/chat/a">Resume</PageAction>}
					lead={<p data-slot="next">Eigenvalues and eigenvectors</p>}
					standing={
						<>
							<PageFact icon={<i />}>Right with help</PageFact>
							<PageFact icon={<i />}>Studied today</PageFact>
						</>
					}
				>
					<p data-slot="extra">A mistake</p>
				</PageHead>
				<main />
			</PageFrame>,
		);
		const head = document.querySelector('[data-slot="page-frame"] > [data-slot="page-head"]')!;
		assert.deepEqual(
			[...head.querySelectorAll("[data-slot]")].map((el) => el.getAttribute("data-slot")).filter((slot) => slot !== "button"),
			["page-eyebrow", "page-title", "page-actions", "page-lines", "page-lead", "next", "page-standing", "page-fact", "page-fact", "extra"],
		);
		assert.equal(document.querySelector('[data-slot="page-title"]')!.tagName, "H1");
		assert.match(document.querySelector('[data-slot="page-lead"]')!.className, /\btext-headline\b.*\btext-foreground\b/, "what to do next leads as a Headline in full ink");
		assert.match(document.querySelector('[data-slot="page-standing"]')!.className, /\*:not-first:before:w-px/, "a hairline between facts");
		assert.match(head.className, /border-b/, "a hairline closes the head");
		const press = document.querySelector('[data-slot="page-actions"] a')!;
		assert.equal(press.getAttribute("href"), "/chat/a");
		assert.match(press.className, /text-link/);
		assert.equal(press.textContent, "Resume");
		assert.ok(press.querySelector("svg"), "the arrow");
	});

	it("leaves out what a page does not give, and makes the press a button without an href", () => {
		const document = render(<PageHead title="Probability" actions={<PageAction disabled>Review</PageAction>} />);
		assert.ok(document.querySelector('[data-slot="page-standing"]') === null);
		assert.ok(document.querySelector('[data-slot="page-lead"]') === null);
		const press = document.querySelector('[data-slot="page-actions"] button')!;
		assert.ok(press.hasAttribute("disabled"));
	});

	it("stands the head's first row on the band's centre line: the title, or the line above it when a page has one", () => {
		const bare = render(<PageHead title="Probability" />).querySelector('[data-slot="page-head"]')!;
		assert.equal(bare.firstElementChild!.querySelector('[data-slot="page-title"]')?.textContent, "Probability", "no empty line above a title (Edo, 16 Nov 2026)");
		const topic = render(<PageHead eyebrow="Linear Algebra" title="Kernel" />).querySelector('[data-slot="page-eyebrow"]')!;
		assert.ok(topic.className.includes("h-8"), "the line above a title is a 32px row, so it centres on the line as a title row does");
		const frame = render(<PageFrame />).querySelector('[data-slot="page-frame"]')!;
		assert.ok(frame.className.includes("pt-[calc(var(--lh-band-centre)-1rem)]"), "the first 32px row's centre is the band's centre line");
	});
});
