import remend, { type RemendHandler, type RemendOptions } from "remend";

/**
 * Link completion that never reads a bracket inside maths (round 4, 14 Nov
 * 2026). Streamdown runs remend on every reply, finished ones included, and
 * remend's link repair takes the `[` of a half-open interval such as
 * `$[2,\infty)$` for an unfinished link: it appended
 * `](streamdown:incomplete-link)`, which stayed in the reply as raw text.
 * Here the brackets inside `$…$` and `$$…$$` (an unclosed one while it
 * streams, too) are hidden from that repair and put back after it, so the
 * TeX reaches KaTeX byte for byte. Everything else about links is remend's.
 */

// Private-use characters: never in a reply, so they map back exactly.
const OPEN = "";
const CLOSE = "";

/** Every other repair off: this pass completes links and images only. */
const LINKS_ONLY: RemendOptions = {
	bold: false, boldItalic: false, comparisonOperators: false, htmlTags: false, inlineCode: false,
	inlineKatex: false, italic: false, katex: false, setextHeadings: false, singleTilde: false,
	strikethrough: false, links: true, images: true,
};

/** Hide the brackets inside maths, read the way remend reads dollars: an
 *  unescaped `$$` toggles display maths, a lone `$` inline maths. Pure. */
function maskMathBrackets(text: string): string {
	if (!text.includes("$")) return text;
	let out = "";
	let inline = false;
	let display = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (ch === "\\" && text[i + 1] === "$") { out += "\\$"; i++; continue; }
		if (ch === "$") {
			if (text[i + 1] === "$") { display = !display; inline = false; out += "$$"; i++; }
			else { if (!display) inline = !inline; out += ch; }
			continue;
		}
		out += (inline || display) && (ch === "[" || ch === "]") ? (ch === "[" ? OPEN : CLOSE) : ch;
	}
	return out;
}

export function completeLinksOutsideMath(text: string): string {
	const masked = maskMathBrackets(text);
	const done = remend(masked, LINKS_ONLY);
	return masked === text ? done : done.replaceAll(OPEN, "[").replaceAll(CLOSE, "]");
}

/** Runs where remend's own link repair runs (its priority 20). */
export const mathSafeLinks: RemendHandler = { name: "links-outside-math", handle: completeLinksOutsideMath, priority: 20 };
