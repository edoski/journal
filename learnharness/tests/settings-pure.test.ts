/**
 * The settings wave's pure layers (thin settings wave): the appearance →
 * CSS-variable mapping (the section must actually DO something) and the
 * keyboard overrides map.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appearanceVars, resolveAppearance, staleVarNames } from "../components/settings/appearance.tsx";
import { nextOverrides } from "../components/settings/keyboard-section.tsx";

describe("resolveAppearance — delta over factory", () => {
	it("absent everything = the factory view", () => {
		const a = resolveAppearance(undefined);
		assert.equal(a.mode, "dark");
		assert.equal(a.background, null);
		assert.equal(a.fontFamily, null);
		assert.equal(a.proseFontSize, 16);
		assert.equal(a.sessionNameSerif, true);
		assert.deepEqual(a.mdRendering, { headingWeight: 900, boldColor: null, italicColor: null });
	});

	it("explicit deltas win field-by-field", () => {
		const a = resolveAppearance({ proseFontSize: 20, fontFamily: "Iowan Old Style" });
		assert.equal(a.proseFontSize, 20);
		assert.equal(a.fontFamily, "Iowan Old Style");
		assert.equal(a.background, null);
	});
});

describe("appearanceVars — the mapping the provider applies", () => {
	it("factory appearance: only the reading size moves", () => {
		assert.deepEqual(appearanceVars(resolveAppearance(undefined)), { "--lh-prose-size": "16px" });
	});

	it("the stylesheet keeps palette, fonts and heading weight; reading size and inks apply", () => {
		const vars = appearanceVars(
			resolveAppearance({
				background: "#101820",
				fontFamily: "Georgia",
				proseFontSize: 18,
				sessionNameSerif: false,
				mdRendering: { headingWeight: 700, boldColor: "#ff0000", italicColor: "#00ff00" },
			}),
		);
		assert.deepEqual(vars, { "--lh-prose-size": "18px", "--lh-ink-strong": "#ff0000", "--lh-ink-italic": "#00ff00" });
	});
});

describe("staleVarNames — the removal half of application (owner repro: resets never reverted)", () => {
	it("an ink applied, then cleared: its name goes stale", () => {
		const applied = Object.keys(appearanceVars(resolveAppearance({ mdRendering: { boldColor: "#ff0000", italicColor: "#00ff00" } })));
		const stale = staleVarNames(applied, appearanceVars(resolveAppearance({ mdRendering: { boldColor: null } })));
		assert.ok(stale.includes("--lh-ink-strong"));
		assert.ok(stale.includes("--lh-ink-italic"));
		assert.ok(!stale.includes("--lh-prose-size"), "always-applied tokens never go stale");
	});

	it("no previous applications → nothing stale", () => {
		assert.deepEqual(staleVarNames([], appearanceVars(resolveAppearance(undefined))), []);
	});
});

describe("nextOverrides — the rebind persistence map", () => {
	it("a rebind sets the action's override, keeping the others", () => {
		const next = nextOverrides({ "toggle-sidebar": "mod+b" }, "open-settings", "mod+shift+s");
		assert.deepEqual(next, { "toggle-sidebar": "mod+b", "open-settings": "mod+shift+s" });
	});

	it("null = reset that action to its default (key removed)", () => {
		const next = nextOverrides({ "toggle-sidebar": "mod+b", find: "mod+f" }, "toggle-sidebar", null);
		assert.deepEqual(next, { find: "mod+f" });
	});
});
