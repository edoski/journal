/**
 * A demo's controls are readable shadcn buttons (round 12, 2 M2 and 3 D10):
 * the Eigen demo styled its buttons `background:#fff` and left their text
 * colour to the browser, which drew it white in his dark app, so the
 * presets and Pause were empty boxes the tutor told him to press; the
 * Poisson demo's dark buttons were near-invisible. Every demo runs on a
 * base with shadcn's light button variants, in his app and in the
 * builder's test run, and a run whose controls do not read fails.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDemoSrcDoc } from "../components/artifacts/demo-card.tsx";
import { DEMO_BASE_STYLE, withDemoBase } from "../src/core/demo-frame.ts";

/** The Eigen demo's own button rule, as round 12 recorded it. */
const EIGEN = `<!doctype html><html><head><style>button { background:#fff; border:1px solid #cbd5e1; }</style></head><body><button id="pause">❚❚ Pause</button></body></html>`;

describe("a demo's controls read (2 M2, 3 D10)", () => {
	it("run on the base in his app: a light page whose buttons carry their own text colour, before the demo's rules", () => {
		const doc = buildDemoSrcDoc(EIGEN);
		const base = doc.indexOf("data-demo-base");
		assert.ok(base > 0 && base < doc.indexOf("button { background:#fff"), "the base comes first, so the demo's rules win where they set a property");
		assert.match(DEMO_BASE_STYLE, /:root\{color-scheme:light\}/);
		assert.match(DEMO_BASE_STYLE, /button\{[^}]*background:#fff;color:#0a0a0a/);
		assert.match(DEMO_BASE_STYLE, /button\.primary[^{]*\{background:#171717;border-color:#171717;color:#fafafa\}/);
		assert.equal(withDemoBase(withDemoBase(EIGEN)), withDemoBase(EIGEN), "once");
		assert.ok(withDemoBase("<p>fragment</p>").startsWith("<style data-demo-base>"));
	});

});
