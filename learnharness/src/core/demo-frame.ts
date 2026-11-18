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

/**
 * The same controls on his dark page (round 13, 3 N9): in the lesson a demo
 * that leaves its page to the app is drawn on the lesson's own dark, where
 * the light base's white buttons glare, and a demo the base never reached
 * showed the browser's grey square buttons and its native select. These
 * are shadcn's dark variants in the app's own tokens (`--input`,
 * `--primary`, `--secondary`, `--ring`, handed to the demo as `:root`
 * variables): the outline button, the filled and the soft one, and the
 * select and input as shadcn's trigger draws them. A demo that paints its
 * own light page keeps the light base, since the lesson turns that whole
 * page dark (`data-lh-light`, set by the lesson's bridge).
 */
export const DEMO_DARK_STYLE = `<style data-demo-dark>
:root:not([data-lh-light]){color-scheme:dark}
:root:not([data-lh-light]) button{border-color:var(--input);background:color-mix(in srgb,var(--input) 30%,transparent);color:var(--foreground);box-shadow:0 1px 2px rgba(0,0,0,.05)}
:root:not([data-lh-light]) button:hover{background:color-mix(in srgb,var(--input) 50%,transparent)}
:root:not([data-lh-light]) button.primary,:root:not([data-lh-light]) button[data-variant="default"]{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}
:root:not([data-lh-light]) button.primary:hover,:root:not([data-lh-light]) button[data-variant="default"]:hover{background:color-mix(in srgb,var(--primary) 90%,transparent)}
:root:not([data-lh-light]) button.secondary,:root:not([data-lh-light]) button[data-variant="secondary"]{background:var(--secondary);border-color:transparent;color:var(--secondary-foreground);box-shadow:none}
:root:not([data-lh-light]) button.secondary:hover,:root:not([data-lh-light]) button[data-variant="secondary"]:hover{background:color-mix(in srgb,var(--secondary) 80%,transparent)}
:root:not([data-lh-light]) button:focus-visible,:root:not([data-lh-light]) select:focus-visible,:root:not([data-lh-light]) input:focus-visible{outline:none;border-color:var(--ring);box-shadow:0 0 0 3px color-mix(in srgb,var(--ring) 50%,transparent)}
:root:not([data-lh-light]) input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]),:root:not([data-lh-light]) select,:root:not([data-lh-light]) textarea{min-height:32px;padding:0 10px;border:1px solid var(--input);border-radius:6px;background:color-mix(in srgb,var(--input) 30%,transparent);color:var(--foreground);font-size:14px}
:root:not([data-lh-light]) select{appearance:none;-webkit-appearance:none;padding-right:30px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23a1a1a1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center}
:root:not([data-lh-light]) select option{background:var(--card);color:var(--foreground)}
:root:not([data-lh-light]) input[type="range"],:root:not([data-lh-light]) input[type="checkbox"],:root:not([data-lh-light]) input[type="radio"]{accent-color:var(--primary)}
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

/** A matrix or table written as nested code lists, "[[a, b], [c, d]]". */
const NESTED_LIST = /\[\s*\[[^\[\]]*\](?:\s*,\s*\[[^\[\]]*\])+\s*\]/g;

/**
 * Maths written as code in a demo's words (round 13, 3 N9: the Invertible
 * demo printed "M = [[a, b], [c, d]]"): he reads a matrix by its columns
 * or entries, never as a programmer's nested list. Pure.
 */
export function codeNotationIn(text: string): string[] {
	return [...text.matchAll(NESTED_LIST)].map((m) => m[0]);
}

/** The script the builder's test run evaluates in the demo: the maths its
 *  visible words write as code (`codeNotationIn`). Plain JS, run in the page. */
export const CODE_NOTATION_PROBE = `(() => {
	const text = (document.body && document.body.innerText) || "";
	return text.match(new RegExp(${JSON.stringify(NESTED_LIST.source)}, "g")) || [];
})()`;
