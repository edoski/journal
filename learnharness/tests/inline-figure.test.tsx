/** Figures in the flow (inline-figure.md): the demo's document and the steer card's inline look. */

import React from "react";
(globalThis as Record<string, unknown>).React = React; // tsx classic-JSX shim (see render-cards.test.tsx)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { buildInlineSrcDoc, demoPageLight, demoThemeStyle, INLINE_BRIDGE_SCRIPT } from "../components/artifacts/inline-figure.tsx";
import { SubagentSteerCard } from "../components/artifacts/steer-card.tsx";
import { buildSubagentSteer } from "../src/core/contracts.ts";
import { projectView } from "../src/core/view.ts";

describe("figures in the flow", () => {
	const theme = demoThemeStyle((token) => ({ "--foreground": "#ededed", "--font-sans": "-apple-system" })[token] ?? "");

	it("hands a demo the app's tokens on a transparent dark page", () => {
		assert.match(theme, /color-scheme:dark/);
		assert.match(theme, /--background:transparent/);
		assert.match(theme, /--foreground:#ededed;/);
		assert.doesNotMatch(theme, /--card:/, "a token the app lacks is left out");
	});

	it("puts the theme first, so the demo's own styles win, and the bridge last", () => {
		const doc = buildInlineSrcDoc("<html><head><style>body{color:red}</style></head><body><p>x</p></body></html>", theme);
		assert.ok(doc.indexOf("data-lh-theme") < doc.indexOf("color:red"));
		assert.ok(doc.indexOf(INLINE_BRIDGE_SCRIPT) < doc.indexOf("</body>"));
		const bare = buildInlineSrcDoc("<p>x</p>", theme);
		assert.ok(bare.startsWith("<style data-lh-theme>") && bare.endsWith("</script>"));
	});

	it("reads the bridge's word on a light page", () => {
		assert.equal(demoPageLight({ type: "demo-page", light: true }), true);
		assert.equal(demoPageLight({ type: "demo-resize", height: 3 }), null);
		assert.equal(demoPageLight(null), null);
	});

	it("draws a delivered demo and figure in the flow, borderless, with no caption", () => {
		const demo = buildSubagentSteer({ id: "jd", kind: "demo", toolCallId: "cd" }, { title: "Shear", html: "<p>demo</p>", tested: true });
		const demoHtml = renderToStaticMarkup(<SubagentSteerCard message={projectView([demo])[0] as never} figures="inline" />);
		assert.match(demoHtml, /data-testid="inline-demo"/);
		assert.doesNotMatch(demoHtml, /interactive demo/i);
		assert.doesNotMatch(demoHtml, /rounded-xl border/);
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="2"/></svg>';
		const visual = buildSubagentSteer({ id: "jv", kind: "visual", toolCallId: "cv" }, { svg });
		const visualHtml = renderToStaticMarkup(<SubagentSteerCard message={projectView([visual])[0] as never} figures="inline" />);
		assert.match(visualHtml, /data-testid="inline-visual"/);
		assert.ok(visualHtml.includes(encodeURIComponent(svg)));
		assert.doesNotMatch(visualHtml, />Figure</);
		// Today's cards stay the default.
		assert.match(renderToStaticMarkup(<SubagentSteerCard message={projectView([demo])[0] as never} />), /interactive demo/i);
	});
});
