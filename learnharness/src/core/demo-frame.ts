/**
 * The base every demo runs on, in his app and in the builder's test run
 * alike (round 12, 2 M2 and 3 D10): the Eigen demo styled its buttons
 * `background:#fff` and left their text to the browser, which in his dark
 * app drew it white, so the presets and Pause read as empty boxes; the
 * Poisson demo's dark buttons were near-invisible. The demo keeps the
 * light page the builder is told to draw, and its controls are shadcn's
 * own button variants in shadcn's light neutral tokens: a plain `<button>`
 * is the outline button, `class="primary"` the filled one and
 * `class="secondary"` the soft one. It comes first in the document, so a
 * demo's own rules win wherever they set a property, and a property they
 * leave out falls back to these, never to the browser's. Pure.
 */
export const DEMO_BASE_STYLE = `<style data-demo-base>
:root{color-scheme:light}
button,input,select,textarea{font:inherit}
button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 12px;border-radius:6px;border:1px solid #e5e5e5;background:#fff;color:#0a0a0a;font-size:14px;font-weight:500;line-height:1.25;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.05)}
button:hover{background:#f5f5f5}
button:disabled{opacity:.5;cursor:default}
button.primary,button[data-variant="default"]{background:#171717;border-color:#171717;color:#fafafa}
button.primary:hover,button[data-variant="default"]:hover{background:#262626}
button.secondary,button[data-variant="secondary"]{background:#f5f5f5;border-color:transparent;color:#171717;box-shadow:none}
button.secondary:hover,button[data-variant="secondary"]:hover{background:#e5e5e5}
input,select,textarea{color:#0a0a0a;background:#fff;border:1px solid #e5e5e5;border-radius:6px}
input[type="range"],input[type="checkbox"],input[type="radio"]{accent-color:#171717}
</style>`;

/** A demo's document with the base first: right after `<head>`, else
 *  before everything. Pure. */
export function withDemoBase(html: string): string {
	if (html.includes("data-demo-base")) return html;
	const head = /<head[^>]*>/i.exec(html);
	if (head) return `${html.slice(0, head.index + head[0].length)}${DEMO_BASE_STYLE}${html.slice(head.index + head[0].length)}`;
	return `${DEMO_BASE_STYLE}${html}`;
}

/** The contrast a control's words need against what lies under them
 *  (WCAG AA for body text). */
export const DEMO_MIN_CONTRAST = 4.5;

/**
 * The script the builder's test run evaluates in the demo: every visible
 * button, select and text input whose words read below
 * `DEMO_MIN_CONTRAST` against the backgrounds under them, as
 * "Pause: 1.0:1". Plain JS, run in the page.
 */
export const UNREADABLE_CONTROLS_PROBE = `(() => {
	const rgba = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
	const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
	const under = (el) => { const layers = []; for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; } let out = [255, 255, 255]; for (const c of layers.reverse()) out = out.map((v, i) => c[i] * c[3] + v * (1 - c[3])); return out; };
	const words = (el) => (el.tagName === "INPUT" ? el.value : el.textContent || "").trim();
	const bad = [];
	for (const el of document.querySelectorAll("button, select, input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=hidden])")) {
		if (!el.getClientRects().length || getComputedStyle(el).visibility === "hidden" || !words(el)) continue;
		const fg = rgba(getComputedStyle(el).color); const bg = under(el);
		const ink = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
		const [hi, lo] = [lum(ink), lum(bg)].sort((a, b) => b - a);
		const ratio = (hi + 0.05) / (lo + 0.05);
		if (ratio < ${DEMO_MIN_CONTRAST}) bad.push(words(el).slice(0, 40) + ": " + ratio.toFixed(1) + ":1");
	}
	return bad;
})()`;
