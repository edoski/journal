/**
 * His typed text, as typed (typed-text.tsx): his answer and his thinking
 * keep his stars, and only his LaTeX is typeset.
 */

import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { TypedText } from "../components/typed-text.tsx";
import { ThinkingBlock } from "../components/thinking-block.tsx";

const doc = (node: React.ReactElement) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;

describe("his typed text, as typed", () => {
	it("keeps his stars as stars and typesets only his LaTeX", () => {
		const typed = doc(<TypedText>{"0.5*0.10 + 0.3*0.05 + 0.2*0.02, so $P(B) = 0.069$"}</TypedText>);
		assert.match(typed.body.textContent!, /^0\.5\*0\.10 \+ 0\.3\*0\.05 \+ 0\.2\*0\.02, so /);
		assert.equal(typed.querySelector("em"), null, "no italics he never asked for");
		assert.equal(typed.querySelectorAll(".katex").length, 1);
	});

	it("is what Your thinking shows", () => {
		const block = doc(<ThinkingBlock text={"2*v and 3*v are both in it"} defaultOpen />);
		assert.match(block.body.textContent!, /2\*v and 3\*v are both in it/);
		assert.equal(block.querySelector("em"), null);
	});
});
