/**
 * A demo in the lesson has shadcn's controls on his dark page (round 13,
 * 3 N9): the Poisson demo showed grey square Arial buttons and a native
 * select, because the lesson's inline frame never put the demo base under
 * it (round 12 fixed only the card); and it printed the matrix as code,
 * "M = [[a, b], [c, d]]". The demo's markup below is the shape the
 * Poisson demo had: a page left to the app, two buttons and a select.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInlineSrcDoc, INLINE_BRIDGE_SCRIPT } from "../components/artifacts/inline-figure.tsx";
import { CODE_NOTATION_PROBE, codeNotationIn, DEMO_BASE_STYLE, DEMO_DARK_STYLE } from "../src/core/demo-frame.ts";

const POISSON = `<!doctype html><html><head><style>.row{display:flex;gap:8px}</style></head><body><div class="row"><button id="one">Simulate one hour</button><button id="many">Simulate 10,000 hours</button><select id="n"><option>12</option><option>3600</option></select></div></body></html>`;
const THEME = "<style data-lh-theme>:root{color-scheme:dark}</style>";

describe("a demo's controls in the lesson (3 N9)", () => {
	it("run on the demo base and shadcn's dark variants, after the theme and before the demo's own rules", () => {
		const doc = buildInlineSrcDoc(POISSON, THEME);
		const at = (needle: string) => doc.indexOf(needle);
		assert.ok(at("data-lh-theme") > 0, "the theme");
		assert.ok(at("data-lh-theme") < at("data-demo-base"), "then the light base the builder tested it on");
		assert.ok(at("data-demo-base") < at("data-demo-dark"), "then the dark variants over it");
		assert.ok(at("data-demo-dark") < at(".row{display:flex"), "and the demo's own rules win where they set a property");
		assert.equal(doc.split("data-demo-base").length - 1, 1, "one base, even for a demo the builder already based");
		assert.equal(buildInlineSrcDoc(`<html><head>${DEMO_BASE_STYLE}</head><body></body></html>`, THEME).split("data-demo-base").length - 1, 1);
	});

	it("draws buttons, the select and inputs as shadcn does, in the app's tokens and face, never the browser's grey", () => {
		assert.match(DEMO_BASE_STYLE, /button,input,select,textarea\{font:inherit\}/, "the lesson's face, never the browser's Arial");
		assert.match(DEMO_DARK_STYLE, /button\{border-color:var\(--input\);background:color-mix\(in srgb,var\(--input\) 30%,transparent\);color:var\(--foreground\)/);
		assert.match(DEMO_DARK_STYLE, /button\.primary[^{]*\{background:var\(--primary\)/);
		assert.match(DEMO_DARK_STYLE, /select\{appearance:none/, "the select is shadcn's trigger, not the native control");
		assert.match(DEMO_DARK_STYLE, /:root:not\(\[data-lh-light\]\)\{color-scheme:dark\}/);
	});

	it("keeps the light base for a demo that paints its own light page, which the lesson turns dark whole", () => {
		assert.match(INLINE_BRIDGE_SCRIPT, /setAttribute\("data-lh-light",""\)/);
		assert.match(INLINE_BRIDGE_SCRIPT, /removeAttribute\("data-lh-light"\)/);
	});
});

describe("a demo writes maths as he reads it (3 N9)", () => {
	it("names a matrix written as code, as the Invertible demo printed it", () => {
		assert.deepEqual(codeNotationIn("matrix M = [[a, b], [c, d]]   a 1.0"), ["[[a, b], [c, d]]"]);
		assert.deepEqual(codeNotationIn("columns (a, c) and (b, d)"), []);
		assert.deepEqual(codeNotationIn("interval [0, 1] and [2, 3]"), [], "a plain interval is maths");
	});

	it("is checked in the builder's test run, on the page's visible words", () => {
		assert.match(CODE_NOTATION_PROBE, /innerText/);
	});
});
