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
		.join("");
}

const SYMBOL: Record<string, string> = {
	alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
	Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
	infty: "∞", in: "∈", times: "×", cdot: "·", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", to: "→", rightarrow: "→", mapsto: "↦", partial: "∂", nabla: "∇", sum: "Σ", prod: "Π", int: "∫", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩", forall: "∀", exists: "∃", emptyset: "∅", approx: "≈", pm: "±",
	R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ",
};

function texPlain(tex: string): string {
	return tex
		.replace(/\\[,;:! ]/g, " ")
		.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
		.replace(/\\(?:mathbb|mathbf|mathrm|mathcal|text|operatorname)\{([^{}]*)\}/g, (_, inner: string) => SYMBOL[inner] ?? inner)
		.replace(/\\([a-zA-Z]+)/g, (_, name: string) => SYMBOL[name] ?? name)
		.replace(/[{}]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** KaTeX's HTML for one inline formula; a formula KaTeX cannot read shows
 *  its TeX in the error ink rather than breaking the label. */
function formula(tex: string): string {
	return katex.renderToString(tex, { throwOnError: false, strict: "ignore", trust: false, output: "htmlAndMathml" });
}

/**
 * A one-line label that may hold TeX (spec: math-text.md): the words as
 * they are and each formula typeset by KaTeX inline, at the label's own
 * size, so a title like "$\sigma$-algebras" reads as it would in the
 * lesson. A label with no formula renders as plain text. The caller's
 * element keeps its own truncation: a formula is inline, so an ellipsis
 * still cuts the line.
 */
export function MathText({ children }: { children: string }) {
	const pieces = useMemo(() => mathPieces(children), [children]);
	if (pieces.every((piece) => piece.kind === "text")) return <>{children}</>;
	return (
		<>
			{pieces.map((piece, index) =>
				piece.kind === "text" ? (
					<Fragment key={index}>{piece.text}</Fragment>
				) : (
					<span key={index} data-slot="math-text" className="[&_.katex]:text-[1.05em]" dangerouslySetInnerHTML={{ __html: formula(piece.tex) }} />
				),
			)}
		</>
	);
}
