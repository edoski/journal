/** His own words show exactly as he typed them (prose.md, "His words"):
 *  no Markdown, no link hardening, and maths only inside a delimiter he
 *  typed on purpose. The tutor's messages keep their rich rendering. */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnerBubble } from "../components/lesson/prose/learner-bubble.tsx";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { buildAnswer } from "../src/core/index.ts";
import { proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";

const visible = (html: string) =>
	html
		.replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g, "")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"');

describe("his words in the lesson", () => {
	const typed = "Y=1: 3*C(4,2)=18 … Y=2: C(3,2)*4=12\n84 = 2*30 + 24, decreasing on [2, ∞).\nIt costs $5 and $10. _x_ # not a heading\n1) first";

	it("shows his message character for character, line breaks kept", () => {
		const html = renderToStaticMarkup(<LearnerBubble text={typed} />);
		assert.equal(visible(html).trim(), typed);
		assert.doesNotMatch(html, /<em>|<strong>|<h1|<ol|<a |katex|blocked/, "nothing he typed turns into formatting, a list, a link or maths");
		assert.match(html, /whitespace-pre-wrap/);
	});

	it("typesets only maths he wrapped in a delimiter", () => {
		const html = renderToStaticMarkup(<LearnerBubble text={"So $\\lambda = 3$ and \\(x^2\\)."} />);
		assert.equal(html.match(/class="katex"/g)?.length, 2);
		assert.doesNotMatch(visible(html), /\$|\\\(/);
	});

	it("shows his answer and the thinking he added to it as typed", () => {
		const check = { question: "Which way does $A$ stretch?", correctAnswer: "Along $(1,1)$.", type: "check" };
		const spec = proseQuestionSpec("explain", "c1", check)!;
		const output = buildAnswer(spec.data, { text: "2*30 + 24 on [2, ∞)", confidence: "confident" }, "explain");
		const html = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="c1" input={check} output={{ ...output, thinking: "since 2*3 = 6" }} open={false} />);
		assert.match(visible(html), /2\*30 \+ 24 on \[2, ∞\)/);
		assert.match(visible(html), /since 2\*3 = 6/);
		assert.doesNotMatch(html, /blocked/);
	});
});
