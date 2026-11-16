/** Shared Markdown/TeX boundaries for legacy delimiter compatibility and
 * display-only tool-content recovery. Source arguments are never rewritten. */
import {
	canParseTex, knownTexCommand, mapMathContent, numericPercentEscape, outsideTexComments,
	readContentSpans, recoverDocumentLayout, texRanges,
} from "./content-reader.ts";

const escaped = (text: string, i: number) => {
	let n = 0; while (i > 0 && text[--i] === "\\") n++;
	return n % 2 === 1;
};

/** Preserve the legacy list-continuation policy: indented display math
 * degrades to inline rather than disrupting list structure. Literal code
 * indentation is already protected by the shared reader. */
function indented(text: string, i: number): boolean {
	const prefix = text.slice(text.lastIndexOf("\n", i - 1) + 1, i);
	return prefix.length > 0 && /^[ \t]+$/.test(prefix);
}
function blockPosition(text: string, i: number): boolean {
	return /^[ \t]*$/.test(text.slice(text.lastIndexOf("\n", i - 1) + 1, i));
}

/** The container prefix of a line that holds nothing but the span at
 * [start, end): "" or blockquote markers such as "> ". Null when the span
 * shares its line with prose, or sits indented (a list continuation). */
function lonePrefix(text: string, start: number, end: number): string | null {
	const prefix = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
	const eol = text.indexOf("\n", end);
	const rest = text.slice(end, eol < 0 ? text.length : eol);
	return /^(?:[ \t]{0,3}>[ \t]?)*$/.test(prefix) && /^[ \t]*$/.test(rest) ? prefix : null;
}

/** micromark closes native single-dollar spans at escaped dollars too.
 * Replace an intended literal dollar with equivalent dollar-free TeX before
 * tokenization. Code, prose, unbalanced spans and display dollars stay raw. */
function replaceEscapedDollars(content: string): string {
	let out = "";
	for (let i = 0; i < content.length; i++) {
		if (content[i] === "\\" && content[i + 1] === "$" && !escaped(content, i)) {
			out += "\\text{\\textdollar}"; i++;
		} else out += content[i];
	}
	return out;
}

/** A display sets fractions at full size: `\tfrac` keeps the text size it
 * was written for inline, tiny inside a display (round 8: Bin(n, 4/n) and
 * (1/6)³ in displays). */
const fullSizeFractions = (body: string) => body.replace(/\\tfrac(?![A-Za-z])/g, "\\frac");

/** One argument of a TeX command at `i`: a braced group (its inside) or a
 *  single token. Null past the end. */
function texArg(body: string, i: number): { arg: string; end: number } | null {
	while (body[i] === " ") i++;
	if (i >= body.length) return null;
	if (body[i] === "{") {
		let depth = 0;
		for (let j = i; j < body.length; j++) {
			if (body[j] === "\\") { j++; continue; }
			if (body[j] === "{") depth++;
			else if (body[j] === "}" && --depth === 0) return { arg: body.slice(i + 1, j), end: j + 1 };
		}
		return null;
	}
	const command = /^\\[A-Za-z]+/.exec(body.slice(i));
	return command ? { arg: command[0], end: i + command[0].length } : { arg: body[i]!, end: i + 1 };
}

/** Whether TeX has a + or − at its own level past its first character:
 *  as a numerator over a slash it needs parentheses. */
function sumAtTop(tex: string): boolean {
	let depth = 0;
	for (let i = 0; i < tex.length; i++) {
		const c = tex[i]!;
		if (c === "\\") {
			if (depth === 0 && /^\\(?:pm|mp)(?![A-Za-z])/.test(tex.slice(i))) return true;
			i += (/^\\(?:[A-Za-z]+|.)/.exec(tex.slice(i))?.[0].length ?? 1) - 1;
		} else if (c === "{" || c === "(" || c === "[") depth++;
		else if (c === "}" || c === ")" || c === "]") depth--;
		else if ((c === "+" || c === "-") && depth === 0 && tex.slice(0, i).trim() !== "") return true;
	}
	return false;
}

/** A denominator that reads as one thing after a slash: a number, a letter
 *  or a command with its groups, with its index, power or factorial ("n",
 *  "k!", "x_1", "\sqrt{x}"). */
const ATOM = /^(?:-?[0-9.]+|[A-Za-z]|\\[A-Za-z]+(?:\{[^{}]*\})*)(?:[!']|[_^](?:\{[^{}]*\}|[A-Za-z0-9]))*$/;

/** The commands that join or space terms rather than stand as one: a slash
 *  beside them reads one way. Any other command (`\binom`, `\lambda`,
 *  `\sqrt`, `\left`) is a factor. */
const JOINS = new Set(["cdot", "times", "div", "pm", "mp", "le", "leq", "ge", "geq", "ne", "neq", "to", "in", "notin", "approx", "sim", "equiv", "quad", "qquad", "right", "mid", "implies", "iff", "ldots", "cdots", "dots", "text", "mathrm", "end"]);

/** Whether a slash fraction would take in a factor beside it ("1/2I",
 *  "1/nᵏ (n k)", round 11, 3 n11): a letter, digit, bracket or command
 *  that is a term straight after it, or one that ends a term straight
 *  before it. */
function besideFactor(before: string, after: string): boolean {
	const next = after.trimStart();
	const nextCommand = /^\\([A-Za-z]+)/.exec(next);
	const follows = nextCommand ? !JOINS.has(nextCommand[1]!) : /^[A-Za-z0-9({[]/.test(next);
	const prev = before.trimEnd();
	const prevCommand = /\\([A-Za-z]+)$/.exec(prev);
	const precedes = prevCommand ? !JOINS.has(prevCommand[1]!) && prevCommand[1] !== "left" : /[A-Za-z0-9)\]}!]$/.test(prev) && !/\\[{}]$/.test(prev);
	return follows || precedes;
}

/** An inline fraction set as a slash: `\frac` and `\dfrac` shrink or stack a fraction inside a
 *  line of prose to two thirds of the text (round 9: "−15/n", "1/n" and the
 *  binomial expansion too small to read), and a slash keeps the line's
 *  height and size. Parentheses only where the slash would misread. */
function slashFractions(body: string): string {
	let out = "";
	let i = 0;
	while (i < body.length) {
		// `\dfrac` too, which inline stacked a full-size fraction and
		// doubled the line (round 10, 3 m5: P(X = k) = c·3ᵏ/k!).
		const frac = /^\\[td]?frac(?![A-Za-z])/.exec(body.slice(i));
		if (!frac) {
			out += body[i];
			i++;
			continue;
		}
		const top = texArg(body, i + frac[0].length);
		const bottom = top && texArg(body, top.end);
		if (!top || !bottom) {
			out += body.slice(i);
			break;
		}
		const n = slashFractions(top.arg).trim();
		const d = slashFractions(bottom.arg).trim();
		const slash = `${sumAtTop(n) || n.includes("/") ? `(${n})` : n}/${ATOM.test(d) ? d : `(${d})`}`;
		out += besideFactor(out, body.slice(bottom.end)) ? `(${slash})` : slash;
		i = bottom.end;
	}
	return out;
}

/** Maths inside a line of prose keeps the line's size: fractions as a
 *  slash, and no `\displaystyle`, which set a limit's subscript under it
 *  and doubled the line (round 9). */
const inlineSized = (body: string) => slashFractions(body.replace(/\\displaystyle(?![A-Za-z])\s*/g, ""));

/** A matrix is read as a picture, so it stands in a display of its own,
 * never inside a line of prose, where it doubles the line's height (round
 * 8: a 2 × 2 matrix inline in a question). */
const MATRIX_ENV = /\\begin\{[pbvBV]?matrix\}/;

/** Read old \(...\)/\[...\] syntax without touching literal content or
 * reparsing native math as Markdown. Dollar authoring remains native. */
export function transformMathDelimiters(markdown: string): string {
	return transformDelimiters(markdown).replace(/\$\$([\s\S]*?)\$\$/g, (whole, body: string) => (body.includes("\\tfrac") ? `$$${fullSizeFractions(body)}$$` : whole));
}

/** A list item's or a table row's line, which a display would break. */
function inListOrTable(text: string, i: number): boolean {
	const line = text.slice(text.lastIndexOf("\n", i - 1) + 1, i);
	return /^\s*(?:[-*+]|\d+[.)])\s/.test(line) || /^\s*\|/.test(line);
}

/** The punctuation that ends a clause, after a display or a formula lifted
 *  out of the line, on its line or the next: it goes into the display with
 *  it, so the next paragraph never starts with it (round 9: ". Before
 *  computing anything"). */
const TRAILING = /^\s*([.,;:!?]+)/;

/** What the display ending at `end` takes after it: the punctuation, the
 *  source it swallows, and the break before the words that follow. */
function trailing(markdown: string, end: number): { punct: string; swallow: number; after: string } {
	const match = TRAILING.exec(markdown.slice(end));
	const rest = end + (match?.[0].length ?? 0);
	return { punct: match?.[1] ?? "", swallow: match?.[0].length ?? 0, after: rest === markdown.length || markdown[rest] === "\n" ? "" : "\n\n" };
}

/** A word joined to inline maths by a hyphen ("$x$-axis"): it goes into
 *  the formula as text, so the line never breaks between "x" and "-axis"
 *  (round 10, 2 m6). */
const JOINED_WORD = /^-[A-Za-z]+(?:-[A-Za-z]+)*/;

function transformDelimiters(markdown: string): string {
	let offset = 0;
	let swallow = 0;
	return readContentSpans(markdown).map(span => {
		const start = offset; offset += span.raw.length;
		const skip = swallow; swallow = 0;
		if (span.kind !== "math") return span.raw.slice(skip);
		// A matrix inside a sentence, however it was written ($…$, $$…$$ or
		// \(…\)), stands on its own line with its punctuation (round 10,
		// 2 m6: "Take B = (2 1; 0 3) . Which…" from a one-line $$…$$).
		const inSentence = span.open === "$" || span.open === "\\(" || (span.open === "$$" && !span.display && lonePrefix(markdown, start, start + span.raw.length) === null);
		if (inSentence && MATRIX_ENV.test(span.body) && !indented(markdown, start) && !inListOrTable(markdown, start)) {
			const { punct, swallow: taken, after } = trailing(markdown, start + span.raw.length);
			swallow = taken;
			const before = blockPosition(markdown, start) ? "" : "\n\n";
			return `${before}$$\n${span.body.trim()}${punct}\n$$${after}`;
		}
		if (span.open === "$$" && span.display) {
			const { punct, swallow: taken, after } = trailing(markdown, start + span.raw.length);
			if (!punct) return span.raw;
			swallow = taken;
			return `$$${span.body.trimEnd()}${punct}\n${span.close}${after}`;
		}
		if (span.open === "$") {
			const joined = JOINED_WORD.exec(markdown.slice(start + span.raw.length))?.[0];
			if (joined) swallow = joined.length;
			return "$" + inlineSized(replaceEscapedDollars(span.body)) + (joined ? `\\text{${joined}}` : "") + span.close;
		}
		if (span.open === "$$" && !span.display) {
			// A formula alone on its line is a display, though written as
			// $$…$$ on one line, which remark-math reads as inline.
			const prefix = lonePrefix(markdown, start, start + span.raw.length);
			const body = span.body.trim();
			if (!body) return span.raw;
			return prefix === null ? `$$${inlineSized(span.body)}$$` : `$$\n${prefix}${body}\n${prefix}$$`;
		}
		if (span.open !== "\\(" && span.open !== "\\[") return span.raw;
		const body = span.body.trim();
		if (!body) return span.raw;
		if (span.open === "\\(") return `$$${inlineSized(body)}$$`;
		if (indented(markdown, start)) return `$$${body.replace(/\s*\n\s*/g, " ")}$$`;
		const before = blockPosition(markdown, start) ? "" : "\n\n";
		const { punct, swallow: taken, after } = trailing(markdown, start + span.raw.length);
		swallow = taken;
		return `${before}$$\n${body}${punct}\n$$${after}`;
	}).join("");
}

const DEBRIS: Record<string, string> = {
	"\b": "\\b", "\t": "\\t", "\v": "\\v", "\f": "\\f", "\r": "\\r",
};

/** Recover JSON-swallowed command prefixes only in recognized math, never
 * in code or genuine TeX comments. Restore all debris in one pass. Physical
 * display newlines and CRLF remain source whitespace. Inline LF recovery is
 * limited to complete known n-command names. Under the approved typical-
 * model-authoring policy this includes newline+u→nu in inline math only;
 * already-correct commands are never decoded into whitespace. */
export function restoreMathEscapes(text: string): string {
	if (!/[\b\t\n\v\f\r]/.test(text)) return text;
	return mapMathContent(text, (body, display) => outsideTexComments(body, part => {
		const restored = part.replace(/[\b\t\v\f\r]/g, (char, offset: number) => {
			if (char === "\r" && part[offset + 1] === "\n") return char;
			const suffix = /^[A-Za-z]+/.exec(part.slice(offset + 1))?.[0];
			return suffix && knownTexCommand(DEBRIS[char]!.slice(1) + suffix) ? DEBRIS[char]! : char;
		});
		if (display) return restored;
		return restored.replace(/\n([A-Za-z]+)/g, (whole, suffix: string) =>
			knownTexCommand("n" + suffix) ? "\\n" + suffix : whole);
	}));
}

const commandSymbol = /[,;:!|{}%]/;

/** Decode prefixes and row separators according to ORIGINAL TeX context.
 * A native pair is literal; an encoded pair supplies a factor, so an encoded
 * four-backslash row becomes TWO, never a command prefix. Unknown commands
 * without that structural evidence are left alone. */
function recoverCommandRuns(inner: string, display: boolean): string {
	const ranges = texRanges(inner);
	const recovered = inner.replace(/\\+/g, (run: string, offset: number) => {
		const contexts = ranges.filter(r => offset >= r.start && offset < r.end);
		if (contexts.some(r => r.kind === "row" || r.kind === "comment") || run.length % 2 !== 0) return run;
		const next = inner[offset + run.length] ?? "";
		const encoded = contexts.filter(r => r.kind === "encoded").at(-1);
		const word = /^[A-Za-z]+/.exec(inner.slice(offset + run.length))?.[0];
		if (encoded) {
			const factor = encoded.factor!;
			const rows = run.length % (2 * factor) === 0;
			const command = word ? knownTexCommand(word) : commandSymbol.test(next);
			if (run.length % factor === 0 && (rows || command)) return "\\".repeat(run.length / factor);
			return run;
		}
		if (next === "%") return numericPercentEscape(inner, offset + run.length) ? "\\" : run;
		if (word) return word.length > 1 && knownTexCommand(word) ? "\\" : run;
		return next && commandSymbol.test(next) ? "\\" : run;
	});
	// Structural evidence is primary (parse success cannot prove row
	// preservation). As an additional guard, never turn parseable source into
	// a parse failure through partial command recovery.
	if (recovered !== inner && !canParseTex(recovered, display) && canParseTex(inner, display)) return inner;
	return recovered;
}

export function healOverescapedCommands(text: string): string {
	return text.includes("\\\\") ? mapMathContent(text, recoverCommandRuns) : text;
}

/** Presentation-only, language-independent recovery. Shape parsing, saved
 * identities, grading and model history must use the unprojected source. */
export function repairMathForDisplay(text: string): string {
	return healOverescapedCommands(restoreMathEscapes(recoverDocumentLayout(text)));
}
