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
			["page-eyebrow", "page-title", "page-actions", "page-lead", "next", "page-standing", "page-fact", "page-fact", "extra"],
		);
		assert.equal(document.querySelector('[data-slot="page-title"]')!.tagName, "H1");
		assert.match(document.querySelector('[data-slot="page-lead"]')!.className, /text-control font-medium text-foreground/, "what to do next leads in full ink");
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
		assert.equal(document.querySelector('[data-slot="page-eyebrow"]'), null);
		assert.equal(document.querySelector('[data-slot="page-standing"]'), null);
		assert.equal(document.querySelector('[data-slot="page-lead"]'), null);
		const press = document.querySelector('[data-slot="page-actions"] button')!;
		assert.ok(press.hasAttribute("disabled"));
	});
});
