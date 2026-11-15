import { Fragment, useMemo } from "react";
import { MathText, mathPieces } from "@/components/ui/math-text";
import { plainNumber } from "@/components/plain-numbers";

/**
 * A one-line label made from text written for a page (spec: line-text.md):
 * a folded question, a session named by its first message, the tutor's
 * sentence about an attempt. Its inline marks are drawn (bold, italics,
 * code, a link's words), its block marks dropped (headings, quotes,
 * bullets, a table's rules and bars), and its formulas typeset inline by
 * MathText, a matrix small enough to sit on the line, a bare number in the
 * label's own type (plain-numbers.ts). Code reads as its
 * words: the app sets no mono type. Pure parts below.
 */

/** A run of the line: words that may hold `$…$` formulas, and its marks. */
export interface LineRun {
	text: string;
	strong?: true;
	em?: true;
}

/** A formula's stand-in while the marks are read, so a `*` or a `|` inside
 *  TeX is never taken for markdown. */
const SLOT = /\u0000(\d+)\u0000/g;

/** The fences a small matrix keeps for each matrix environment. */
const FENCES: Record<string, [string, string] | null> = {
	matrix: null,
	smallmatrix: null,
	array: null,
	pmatrix: ["(", ")"],
	bmatrix: ["[", "]"],
	Bmatrix: ["\\{", "\\}"],
	vmatrix: ["|", "|"],
	Vmatrix: ["\\|", "\\|"],
	cases: ["\\{", "."],
};

/** Environments whose rows are equations: one line holds them side by side. */
const ROWS = new Set(["aligned", "align", "align*", "gathered", "gather", "gather*", "split", "eqnarray", "eqnarray*"]);

/** A formula as one line can hold it: a matrix or a case split as a small
 *  matrix (KaTeX's `smallmatrix`) set one size up (`\large`), so its
 *  entries read at the label's size where a bare `smallmatrix` shrank them
 *  to script size (round 5: 7px digits), at the cost of a few pixels of
 *  line height; rows of equations side by side, a tall fraction as a text
 *  one. Pure. */
export function lineTex(tex: string): string {
	return tex
		.replace(/\\begin\{(\w+\*?)\}(\{[^}]*\})?([\s\S]*?)\\end\{\1\}/g, (whole, env: string, _cols: string | undefined, body: string) => {
			if (ROWS.has(env)) return body.replace(/\\\\/g, ",\\quad ").replace(/&/g, "");
			if (!(env in FENCES)) return "\\cdots";
			const small = `\\begin{smallmatrix}${body}\\end{smallmatrix}`;
			const fence = FENCES[env];
			return `{\\large${fence ? `\\left${fence[0]}${small}\\right${fence[1]}` : small}}`;
		})
		.replace(/\\dfrac/g, "\\tfrac")
		.replace(/\s+/g, " ")
		.trim();
}

/** A markdown table's rule row (`|---|:--:|`). */
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** The block marks a line drops: a heading's hashes, a quote's bar, a
 *  bullet or a number, at the start of each source line. */
const BLOCK_MARK = /^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/;

/** The inline marks a line draws, first match wins: bold, italics (a `_`
 *  only at a word's edge, so snake_case stays), code, a link's words. */
const MARK = /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*|__(?=\S)([\s\S]+?)(?<=\S)__|\*(?=[^\s*])([\s\S]+?)(?<=[^\s*])\*|(?<![\p{L}\p{N}])_(?=\S)([\s\S]+?)(?<=\S)_(?![\p{L}\p{N}])|`([^`]+)`|\[([^\]]+)\]\([^)\s]*\)/gu;

function runsOf(text: string, marks: Omit<LineRun, "text">, into: LineRun[]): void {
	let at = 0;
	for (const match of text.matchAll(MARK)) {
		if (match.index > at) into.push({ text: text.slice(at, match.index), ...marks });
		at = match.index + match[0].length;
		const [, strongA, strongB, emA, emB, code, link] = match;
		const strong = strongA ?? strongB;
		const em = emA ?? emB;
		if (strong !== undefined) runsOf(strong, { ...marks, strong: true }, into);
		else if (em !== undefined) runsOf(em, { ...marks, em: true }, into);
		else if (code !== undefined) into.push({ text: code, ...marks });
		else if (link !== undefined) runsOf(link, marks, into);
	}
	if (at < text.length) into.push({ text: text.slice(at), ...marks });
}

/** A page's text as the runs of one line: formulas kept whole (each as an
 *  inline `$…$` for MathText, `lineTex`'d), block marks and a table's
 *  rules dropped, a table's bars as separators, then the inline marks read
 *  as runs. A literal dollar stays literal. Pure. */
export function lineRuns(source: string): LineRun[] {
	const formulas: string[] = [];
	const protectedText = mathPieces(source)
		.map((piece) => {
			if (piece.kind === "text") return piece.text.replace(/\$/g, "\\$");
			const number = plainNumber(piece.tex);
			if (number !== null) return number;
			formulas.push(`$${lineTex(piece.tex)}$`);
			return `\u0000${formulas.length - 1}\u0000`;
		})
		.join("");
	const line = protectedText
		.split("\n")
		.filter((row) => !TABLE_RULE.test(row))
		.map((row) => row.replace(BLOCK_MARK, "").replace(/^\s*\|/, "").replace(/\|\s*$/, "").replace(/\s\|\s/g, " · "))
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	const runs: LineRun[] = [];
	runsOf(line, {}, runs);
	// MathText reads `\$` as a dollar only beside a formula; a run with none
	// prints as given, so its dollars go back to plain.
	return runs.map((run) => ({
		...run,
		text: run.text.includes("\u0000") ? run.text.replace(SLOT, (_, index: string) => formulas[Number(index)] ?? "") : run.text.replace(/\\\$/g, "$"),
	}));
}

/** The line as plain words, for an attribute that takes text only: the
 *  marks dropped, each formula left as its `$…$`. Pure. */
export function lineWords(source: string): string {
	return lineRuns(source)
		.map((run) => run.text)
		.join("");
}

/** A one-line label from a page's text: its inline marks drawn, its block
 *  marks dropped, its formulas typeset inline. The caller's element keeps
 *  its truncation. */
export function LineText({ children }: { children: string }) {
	const runs = useMemo(() => lineRuns(children), [children]);
	return (
		<>
			{runs.map((run, index) => {
				let node = <MathText>{run.text}</MathText>;
				if (run.em) node = <em>{node}</em>;
				if (run.strong) node = <strong className="font-semibold">{node}</strong>;
				return <Fragment key={index}>{node}</Fragment>;
			})}
		</>
	);
}
