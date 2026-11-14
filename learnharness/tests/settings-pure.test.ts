/**
 * The settings wave's pure layers (thin settings wave): the appearance →
 * CSS-variable mapping (the section must actually DO something), the
 * agent section's compose helpers
 * (the replace-whole PUT discipline), and the keyboard overrides map.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appearanceVars, resolveAppearance, staleVarNames } from "../components/settings/appearance.tsx";
import {
	composeSlotModel,
	composeTool,
} from "../components/settings/agent-section.tsx";
import { nextOverrides } from "../components/settings/keyboard-section.tsx";
import type { AgentSettings, ModelsSettings } from "../src/core";
import { slotsConfigured } from "../src/core";
import { setupStage } from "../components/setup-dialog.tsx";

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

describe("agent section compose helpers — the replace-whole PUT body", () => {
	it("composeTool carries the rest of the section verbatim", () => {
		const before = { tools: { demo: false }, graphTools: { enabled: false } };
		const after = composeTool(before, "visual", false);
		assert.deepEqual(after.tools, { demo: false, visual: false });
		assert.deepEqual(after.graphTools, { enabled: false }, "the rest untouched");
	});

	it("composeSlotModel: empty+empty REMOVES the slot (absent = factory pin)", () => {
		const after = composeSlotModel(
			{ strong: { model: { provider: "openrouter", id: "x" } }, cheap: {} },
			"strong",
			"",
			"",
			"",
		);
		assert.equal(after.strong, undefined, "slot dropped");
		assert.deepEqual(after.cheap, {}, "sibling untouched");
	});

	it("composeSlotModel: model alone, thinking alone, and both — provider rides the swap (federation)", () => {
		assert.deepEqual(composeSlotModel(undefined, "strong", "zai", "glm-4.7-flash", "").strong, {
			model: { provider: "zai", id: "glm-4.7-flash" },
		});
		assert.deepEqual(composeSlotModel(undefined, "cheap", "", "", "low").cheap, { thinkingLevel: "low" });
		assert.deepEqual(composeSlotModel(undefined, "vision", "openai", "gpt-5.2", "high").vision, {
			model: { provider: "openai", id: "gpt-5.2" },
			thinkingLevel: "high",
		});
	});

	it("composeSlotModel: per-field independence — clearing the model keeps the thinking pin", () => {
		const prev: ModelsSettings = { strong: { model: { provider: "zai", id: "glm-4.7-flash" }, thinkingLevel: "high" } };
		const after = composeSlotModel(prev, "strong", "", "", "high");
		assert.deepEqual(after.strong, { model: { provider: "zai", id: "glm-4.7-flash" }, thinkingLevel: "high" }, "model carried, thinking kept");
		// clearing thinking keeps the model
		const after2 = composeSlotModel(prev, "strong", "zai", "glm-4.7-flash", "");
		assert.deepEqual(after2.strong, { model: { provider: "zai", id: "glm-4.7-flash" } }, "thinking dropped, model kept");
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

describe("first-run gate — slotsConfigured + setupStage (model-slots wave)", () => {
	it("slotsConfigured: all three slot models required — thinking levels are optional", () => {
		assert.equal(slotsConfigured(undefined), false, "no record = unconfigured");
		assert.equal(slotsConfigured({}), false, "empty models section");
		assert.equal(
			slotsConfigured({
				strong: { model: { provider: "zai", id: "glm-5.3-flash" } },
				cheap: { model: { provider: "zai", id: "glm-4.7-flash" } },
			}),
			false,
			"vision missing",
		);
		assert.equal(
			slotsConfigured({
				strong: { model: { provider: "zai", id: "glm-5.3-flash" } },
				cheap: { model: { provider: "zai", id: "glm-4.7-flash" } },
				vision: { model: { provider: "openai", id: "gpt-5.2" } },
			}),
			true,
			"all three picked",
		);
		// a thinking-only pin does NOT configure the slot
		assert.equal(
			slotsConfigured({ strong: { thinkingLevel: "low" }, cheap: { thinkingLevel: "low" }, vision: { thinkingLevel: "low" } }),
			false,
			"thinking pins are not models",
		);
	});

	it("setupStage: keys before models (owner's dependency ordering)", () => {
		assert.equal(setupStage(null), "loading", "unknown catalog must not claim keys are missing");
		assert.equal(setupStage([]), "keys", "no providers = keys");
		assert.equal(setupStage([{ id: "zai", connected: false }]), "keys", "provider present but keyless");
		assert.equal(setupStage([{ id: "zai", connected: false }, { id: "openai", connected: true }]), "pickers", "one keyed provider widens the pickers");
	});
});
