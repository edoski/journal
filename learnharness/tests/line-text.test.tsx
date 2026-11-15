/**
 * One-line labels from page text (line-text.tsx): what he reads in a
 * folded question, a session named by its first message, a tutor's
 * sentence about an attempt.
 */

import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { LineText, lineRuns, lineTex, lineWords } from "../components/line-text.tsx";

const doc = (node: React.ReactElement) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;

describe("a one-line label from page text", () => {
	it("draws bold and italics instead of printing their stars", () => {
		const label = doc(<span><LineText>{"You know it stretches *something* by **two**"}</LineText></span>);
		assert.equal(label.querySelector("em")?.textContent, "something");
		assert.equal(label.querySelector("strong")?.textContent, "two");
		assert.doesNotMatch(label.body.textContent!, /\*/);
	});

	it("keeps a matrix on the line as a small matrix a size up, its entries at the label's size, never dots", () => {
		assert.equal(lineTex("B = \\begin{pmatrix} 2 & 0 \\\\ 0 & 3 \\end{pmatrix}"), "B = {\\large\\left(\\begin{smallmatrix} 2 & 0 \\\\ 0 & 3 \\end{smallmatrix}\\right)}");
		assert.equal(lineTex("\\begin{bmatrix} a \\end{bmatrix}"), "{\\large\\left[\\begin{smallmatrix} a \\end{smallmatrix}\\right]}");
		assert.equal(lineTex("\\begin{matrix} a \\end{matrix}"), "{\\large\\begin{smallmatrix} a \\end{smallmatrix}}");
		assert.equal(lineTex("f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{else} \\end{cases}"), "f(x) = {\\large\\left\\{\\begin{smallmatrix} 1 & x > 0 \\\\ 0 & \\text{else} \\end{smallmatrix}\\right.}");
		assert.equal(lineTex("\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}"), "a = b ,\\quad c = d");
		assert.equal(lineTex("\\dfrac{a}{b}"), "\\tfrac{a}{b}");
		const label = doc(<span><LineText>{"Take $$B = \\begin{pmatrix} 2 & 0 \\\\ 0 & 3 \\end{pmatrix}$$ now"}</LineText></span>);
		assert.equal(label.querySelectorAll(".katex").length, 1);
		assert.doesNotMatch(label.body.textContent!, /⋯/);
	});

	it("never reads a star or a bar inside a formula as markdown", () => {
		assert.deepEqual(lineRuns("$a*b*c$ and $|x|$"), [{ text: "$a*b*c$ and $|x|$" }]);
	});

	it("drops block marks and a table's rules, and keeps a literal dollar", () => {
		assert.equal(lineWords("## Two boxes\n- **Box A** holds red\n\n| Box | Red |\n|---|---|\n| A | 3 |"), "Two boxes Box A holds red Box · Red A · 3");
		assert.equal(lineWords("It costs \\$5 and \\$10"), "It costs $5 and $10");
		const money = doc(<span><LineText>{"It costs \\$5 and \\$10"}</LineText></span>);
		assert.equal(money.body.textContent, "It costs $5 and $10");
		assert.equal(money.querySelectorAll(".katex").length, 0);
	});

	it("sets a bare number in the label's own type", () => {
		assert.equal(lineWords("stretches it by $2$, not $-1$"), "stretches it by 2, not −1");
	});

	it("leaves snake_case and a lone star alone", () => {
		assert.equal(lineWords("call course_show on rank_nullity, 5 * 3"), "call course_show on rank_nullity, 5 * 3");
	});
});
