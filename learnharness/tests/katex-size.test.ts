/**
 * Inline maths sits at its words' size (app/globals.css, the one `.katex`
 * size rule). KaTeX's own sheet sets 1.21em, sized for a serif's x-height;
 * beside SF Pro its capitals and digits stood 17% taller than the words
 * (round 5: 16.94px in 14px text). A Tailwind utility on a wrapper cannot
 * win (utilities live in a cascade layer and KaTeX's sheet is unlayered),
 * so the size is set once, unlayered, after KaTeX's sheet.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Rendered x-height and cap height per em: SF Pro at 16px beside KaTeX at
 *  1.21em, measured in the running app's lesson (Chromium, 14 Nov 2026). */
const SF = { x: 8.42 / 16, cap: 11.27 / 16 };
const KATEX = { x: 8.56 / 19.36, cap: 13.22 / 19.36 };

function files(dir: string): string[] {
	return readdirSync(join(root, dir)).flatMap((name) => {
		const path = join(dir, name);
		return statSync(join(root, path)).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
	});
}

describe("KaTeX's one size", () => {
	it("is set once, unlayered, in globals.css, after KaTeX's own sheet", () => {
		const layout = read("app/layout.tsx");
		assert.ok(layout.indexOf("katex/dist/katex.min.css") < layout.indexOf("./globals.css"), "globals.css loads after KaTeX's sheet");
		const css = read("app/globals.css");
		const rule = /^\.katex\s*\{\s*font-size:\s*([\d.]+)em;\s*\}/m.exec(css);
		assert.ok(rule, "a top-level .katex size rule");
		const before = css.slice(0, rule.index);
		assert.equal((before.match(/\{/g) ?? []).length, (before.match(/\}/g) ?? []).length, "outside any @layer or block");
	});

	it("sits between matching the words' capitals and matching their x-height, so neither stands out", () => {
		const size = Number(/^\.katex\s*\{\s*font-size:\s*([\d.]+)em;/m.exec(read("app/globals.css"))![1]);
		const capMatch = SF.cap / KATEX.cap;
		const xMatch = SF.x / KATEX.x;
		assert.ok(size > capMatch && size < xMatch, `${size}em between ${capMatch.toFixed(2)} and ${xMatch.toFixed(2)}`);
		assert.ok(Math.abs(size - Math.sqrt(capMatch * xMatch)) < 0.01, "the two mismatches split evenly");
	});

	it("is set nowhere else", () => {
		for (const path of [...files("components"), ...files("app")]) {
			assert.doesNotMatch(read(path), /\[&_\.katex\]:text-/, path);
		}
	});
});
