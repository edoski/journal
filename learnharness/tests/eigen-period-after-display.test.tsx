/** Edo's note N8 (15 Nov 2026): in the Eigen chat's predict question the
 *  paragraph after the lifted matrix began ". Before computing anything".
 *  Rendered from the demo chat's own words, as the lesson draws them. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { MessageResponse } from "../components/ai-elements/message.tsx";

const chat = readFileSync(new URL("./fixtures/topic/chat_demo_eigen.json", import.meta.url), "utf8");
function predictInput(): unknown {
	const found: unknown[] = [];
	JSON.parse(chat, (key, value) => {
		if (value && typeof value === "object" && (value as { id?: string }).id === "toolu_eig_predict") found.push((value as { arguments: unknown }).arguments);
		return value;
	});
	assert.equal(found.length, 1, "the demo chat's predict question");
	return found[0];
}

describe("a full stop after a display formula (N8)", () => {
	it("starts the Eigen question's next paragraph at its words, the full stop kept with the matrix", () => {
		const html = renderToStaticMarkup(<ProseQuestion tool="explain" toolCallId="toolu_eig_predict" input={predictInput()} open />);
		const { document } = parseHTML(html);
		const paragraphs = [...document.querySelectorAll("p")].map((p) => p.textContent!.trim()).filter(Boolean);
		assert.ok(paragraphs.some((p) => p.startsWith("Before computing anything: which two directions")), `a paragraph starts at "Before computing": ${JSON.stringify(paragraphs)}`);
		assert.ok(paragraphs.every((p) => !/^[.,;:!?]/.test(p)), "no paragraph starts with punctuation");
		assert.ok(document.querySelector(".katex-display .mtable"), "the matrix stands in a display");
	});

	for (const [name, raw] of [
		["a $$ display closed with the full stop on its line", "Take\n$$\nA = 2\n$$. Before computing anything, guess."],
		["a $$ display with the full stop on the next line", "Take\n$$\nA = 2\n$$\n. Before computing anything, guess."],
		["a \\[ display with the full stop on the next line", "Take\n\\[\nA = 2\n\\]\n. Before computing anything, guess."],
		["a lifted matrix with a space before its comma", "Take $A = \\begin{pmatrix} 2 \\\\ 1 \\end{pmatrix}$ , before computing anything, guess."],
	] as const) {
		it(`${name}: the words after it keep every word and start at a letter`, () => {
			const { document } = parseHTML(renderToStaticMarkup(<MessageResponse mode="static">{raw}</MessageResponse>));
			const paragraphs = [...document.querySelectorAll("p")].map((p) => p.textContent!.trim()).filter(Boolean);
			assert.deepEqual(paragraphs.map((p) => p.replace(/^Before/, "before")), ["Take", "before computing anything, guess."], JSON.stringify(paragraphs));
			assert.equal(document.querySelectorAll(".katex-display").length, 1, "one display");
			assert.match(document.querySelector(".katex-display annotation")!.textContent!, /[.,]$/, "the punctuation ends the display");
		});
	}
});
