import katex from "katex";
import { Fragment, useMemo } from "react";

/** A piece of a one-line label: plain words, or a formula's TeX body. */
export type MathPiece = { kind: "text"; text: string } | { kind: "math"; tex: string };

/** `\(`…`\)`, `\[`…`\]`, `$$`…`$$`, or a `$`…`$` that hugs its formula
 *  (no space inside either dollar, no digit right after the closing one),
 *  so "$5 and $10" stays money. `\$` is a literal dollar. */
const MATH = /\\\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\$(?!\s)((?:\\\$|[^$])+?)(?<!\s)\$(?!\d)/g;

/** A label cut into words and formulas. Pure. */
export function mathPieces(text: string): MathPiece[] {
	const pieces: MathPiece[] = [];
	let words = "";
	let at = 0;
	for (const match of text.matchAll(MATH)) {
		words += text.slice(at, match.index);
		at = match.index + match[0].length;
		const tex = match[1] ?? match[2] ?? match[3] ?? match[4];
		if (tex === undefined) {
			words += "$";
			continue;
		}
		if (words) pieces.push({ kind: "text", text: words });
		words = "";
		pieces.push({ kind: "math", tex: tex.trim() });
	}
	words += text.slice(at);
	if (words) pieces.push({ kind: "text", text: words });
	return pieces;
}

/** A label's formulas flattened to plain words, for an attribute that
 *  takes text only (an `aria-label`, a tooltip, a window title):
 *  "$\sigma$-algebras" reads "σ-algebras" where KaTeX knows the symbol's
 *  character, else the command's name. Pure. */
export function mathPlain(text: string): string {
	return mathPieces(text)
		.map((piece) => (piece.kind === "text" ? piece.text : texPlain(piece.tex)))
		.join("")
		.replace(/\s+([,.;:!?)])/g, "$1")
		.replace(/\s{2,}/g, " ")
		.trim();
}

const SYMBOL: Record<string, string> = {
	alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
	Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
	infty: "∞", in: "∈", times: "×", cdot: "·", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", to: "→", rightarrow: "→", mapsto: "↦", partial: "∂", nabla: "∇", sum: "Σ", prod: "Π", int: "∫", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩", forall: "∀", exists: "∃", emptyset: "∅", approx: "≈", pm: "±",
	R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ",
};

/** A formula as plain words, or nothing when it holds a command with
 *  arguments this cannot read: "Combinations and binomial coefficients
 *  binomnj" stood in a placeholder (round 19, m25), where a dropped formula
 *  leaves the title's words whole. */
function texPlain(tex: string): string {
	const plain = tex
		.replace(/\\[,;:! ]/g, " ")
		.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
		.replace(/\\binom\{([^{}]*)\}\{([^{}]*)\}/g, "C($1, $2)")
		.replace(/\\(?:mathbb|mathbf|mathrm|mathcal|text|operatorname)\{([^{}]*)\}/g, (_, inner: string) => SYMBOL[inner] ?? inner)
		.replace(/\\([a-zA-Z]+)(?![a-zA-Z]|\s*[{[])/g, (_, name: string) => SYMBOL[name] ?? name);
	if (/\\[a-zA-Z]+\s*[{[]/.test(plain)) return "";
	return plain
		.replace(/[{}]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** KaTeX's HTML for one inline formula; a formula KaTeX cannot read shows
 *  its TeX in the error ink rather than breaking the label. */
function formula(tex: string): string {
	return holdBrackets(katex.renderToString(tex, { throwOnError: false, strict: "ignore", trust: false, output: "htmlAndMathml" }));
}

const HTML_ROOT = '<span class="katex-html" aria-hidden="true">';

/** The top-level spans of a run of KaTeX's HTML, each whole, up to the
 *  close of the span the run sits in. */
function topSpans(html: string): string[] {
	const spans: string[] = [];
	let depth = 0;
	let start = 0;
	for (const tag of html.matchAll(/<span\b|<\/span>/g)) {
		if (tag[0] === "</span>") {
			depth -= 1;
			// The close of the span the run sits in: the run ends.
			if (depth < 0) break;
			if (depth === 0) spans.push(html.slice(start, tag.index + tag[0].length));
		} else {
			if (depth === 0) start = tag.index;
			depth += 1;
		}
	}
	return spans;
}

/**
 * KaTeX's inline formula with the pieces between an open bracket and its
 * close held on one line (`katex-hold`): KaTeX may break a line after any
 * top-level relation or operator, and a bracket is no group in TeX, so a
 * wrapping formula broke inside one ("P(X =" | "0)"). Where a formula may
 * wrap (an Earlier row, globals.css), it now breaks only at a relation or
 * operator outside every bracket (round 14, m37). Pure.
 */
export function holdBrackets(html: string): string {
	const at = html.indexOf(HTML_ROOT);
	if (at < 0) return html;
	const from = at + HTML_ROOT.length;
	const pieces = topSpans(html.slice(from));
	const inner = pieces.join("");
	if (pieces.length < 2 || !html.startsWith(inner, from)) return html;
	const out: string[] = [];
	let held: string[] = [];
	let open = 0;
	for (const piece of pieces) {
		open += (piece.match(/class="mopen\b/g) ?? []).length - (piece.match(/class="mclose\b/g) ?? []).length;
		if (open > 0 || held.length > 0) held.push(piece);
		else out.push(piece);
		if (open <= 0 && held.length > 0) {
			out.push(held.length > 1 ? `<span class="katex-hold">${held.join("")}</span>` : held[0]!);
			held = [];
			open = 0;
		}
	}
	if (held.length > 0) out.push(held.length > 1 ? `<span class="katex-hold">${held.join("")}</span>` : held[0]!);
	return html.slice(0, from) + out.join("") + html.slice(from + inner.length);
}

/** A label's words, cut at its spaces: each word is the run of plain
 *  text and formulas between two spaces, so a formula keeps the letters
 *  that touch it ("$\varepsilon$-moves" is one word), and the spaces
 *  between are their own pieces. Pure. */
export function mathWords(pieces: readonly MathPiece[]): (MathPiece | MathPiece[])[] {
	const out: (MathPiece | MathPiece[])[] = [];
	let word: MathPiece[] = [];
	const flush = () => {
		if (word.length) out.push(word);
		word = [];
	};
	for (const piece of pieces) {
		if (piece.kind === "math") {
			word.push(piece);
			continue;
		}
		for (const part of piece.text.split(/(\s+)/)) {
			if (!part) continue;
			if (/^\s+$/.test(part)) {
				flush();
				out.push({ kind: "text", text: part });
			} else word.push({ kind: "text", text: part });
		}
	}
	flush();
	return out;
}

/** A word the line must not break inside: one holding a formula, whose
 *  inline box would otherwise let the line break between it and the
 *  letters it touches ("ε" | "-moves"), or one whose hyphen follows a
 *  lone symbol ("ε-closure", "k-means", "p-value"). Pure. */
export function keepWhole(word: readonly MathPiece[]): boolean {
	if (word.some((piece) => piece.kind === "math")) return true;
	const text = word.map((piece) => (piece.kind === "text" ? piece.text : "")).join("");
	return /^[([{"'“‘]?[^\s\p{N}]-/u.test(text);
}

/**
 * A one-line label that may hold TeX (spec: math-text.md): the words as
 * they are and each formula typeset by KaTeX inline, at the label's own
 * size, so a title like "$\sigma$-algebras" reads as it would in the
 * lesson. A formula and the letters touching it, or a lone symbol and its
 * hyphenated word, wrap as one word (`keepWhole`). A label with neither
 * renders as plain text. The caller's element keeps its own truncation: a
 * formula is inline, so an ellipsis still cuts the line. Its words are one
 * run of text, as a plain label's are, so a flex parent (a press, a menu
 * item) wraps them as words, never as columns of pieces (round 17, M3:
 * "Review Permutations, | k-permutations | and factorials today").
 */
export function MathText({ children }: { children: string }) {
	const words = useMemo(() => mathWords(mathPieces(children)), [children]);
	if (!words.some((word) => Array.isArray(word) && keepWhole(word))) return <>{children}</>;
	return (
		<span data-slot="math-run">
			{words.map((word, index) => {
				if (!Array.isArray(word)) return <Fragment key={index}>{word.kind === "text" ? word.text : null}</Fragment>;
				const parts = word.map((piece, at) =>
					piece.kind === "text" ? (
						<Fragment key={at}>{piece.text}</Fragment>
					) : (
						<span key={at} data-slot="math-text" dangerouslySetInnerHTML={{ __html: formula(piece.tex) }} />
					),
				);
				// A formula joined to letters ("$k$-permutations") is held whole where a formula may wrap (globals.css).
				const joined = word.some((piece) => piece.kind === "math") && word.some((piece) => piece.kind === "text");
				return keepWhole(word) ? (
					<span key={index} data-slot="math-word" data-joined={joined ? "" : undefined} className="whitespace-nowrap">
						{parts}
					</span>
				) : (
					<Fragment key={index}>{parts}</Fragment>
				);
			})}
		</span>
	);
}
