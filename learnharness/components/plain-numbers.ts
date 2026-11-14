/**
 * A bare number written as math (`$0.5$`, `$-3$`, `$12\%$`) reads in the
 * prose's own type, not KaTeX's serif (round 3: a table's figures sat in
 * serif beside sans words). A remark transform over the parsed tree:
 * inline math whose whole body is one number becomes text, its minus a
 * true minus sign. Any formula with a symbol, an operator or two numbers
 * keeps KaTeX. Runs after remark-math has parsed (a syntax extension, so
 * its nodes exist before any transform), before rehype-katex renders.
 */

/** One number: an optional sign, digits with a decimal point or LaTeX's
 *  `{,}` decimal comma, an optional percent. */
const NUMBER = /^\s*([-−]?)\s*(\d+(?:(?:\.|\{,\})\d+)?)\s*(\\%|%)?\s*$/;

/** The number a formula's body is, as text; null when it is anything else. Pure. */
export function plainNumber(tex: string): string | null {
	const match = NUMBER.exec(tex);
	if (!match) return null;
	const [, sign, digits, percent] = match;
	return `${sign ? "−" : ""}${digits!.replace("{,}", ",")}${percent ? "%" : ""}`;
}

interface MdNode {
	type: string;
	value?: string;
	children?: MdNode[];
}

function walk(node: MdNode): void {
	if (!node.children) return;
	node.children = node.children.map((child) => {
		if (child.type === "inlineMath" && typeof child.value === "string") {
			const text = plainNumber(child.value);
			if (text !== null) return { type: "text", value: text };
		}
		walk(child);
		return child;
	});
}

/** The remark plugin. */
export function remarkPlainNumbers() {
	return (tree: MdNode) => walk(tree);
}
