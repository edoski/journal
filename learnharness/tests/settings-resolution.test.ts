/**
 * Tests for the resolution layer (settings-storage wave, 2026-09-19):
 * core/settings-resolution.ts — the delta→concrete projection. There is no
 * model to resolve (owner, 2026-11-14): only the Claude account every agent
 * runs Claude Opus 5.5 on.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { graphToolsEnabled, resolveSettings } from "../src/core/settings-resolution.ts";
import { sanitizeUserSettings, type UserSettings } from "../src/core/settings.ts";

describe("resolveSettings", () => {
	it("null record (first boot): every knob lands on its default, the account on the plain signed-in claude", () => {
		const eff = resolveSettings(null);
		assert.deepEqual(eff.agent.tools, {});
		assert.deepEqual(eff.claude, { account: "claude-subscription" });
		assert.equal(eff.appearance.mode, "dark");
		assert.equal(eff.appearance.background, null);
		assert.equal(eff.appearance.fontFamily, null);
		assert.equal(eff.appearance.proseFontSize, 16);
		assert.equal(eff.appearance.sessionNameSerif, true);
		assert.equal(eff.appearance.mdRendering.headingWeight, 900);
	});

	it("explicit record values win over every factory default", () => {
		const record: UserSettings = {
			version: 1,
			agent: { tools: { research: false } },
			claude: { account: "claude-subscription-work" },
			appearance: { mode: "light", proseFontSize: 20, mdRendering: { headingWeight: 600 } },
		};
		const eff = resolveSettings(record);
		assert.deepEqual(eff.agent.tools, { research: false });
		assert.deepEqual(eff.claude, { account: "claude-subscription-work" });
		assert.equal(eff.appearance.mode, "light");
		assert.equal(eff.appearance.proseFontSize, 20);
		assert.equal(eff.appearance.mdRendering.headingWeight, 600);
		assert.equal(eff.appearance.mdRendering.boldColor, null, "untouched knobs stay on the factory default");
	});

	it("a record from the model-slot days resolves to its slots' Claude account and nothing else", () => {
		const eff = resolveSettings(sanitizeUserSettings({
			version: 1,
			models: { strong: { model: { provider: "claude-subscription-work", id: "claude-haiku-5-5" }, thinkingLevel: "low" } },
		}));
		assert.deepEqual(eff.claude, { account: "claude-subscription-work" });
		assert.deepEqual(Object.keys(eff).sort(), ["agent", "appearance", "claude"]);
	});
});

describe("the prober graph tools gate", () => {
	it("the agent toggle alone decides; absent subsection = ON", () => {
		assert.equal(graphToolsEnabled({ agent: { graphTools: {} } }), true);
		assert.equal(graphToolsEnabled({ agent: { graphTools: { enabled: true } } }), true);
		assert.equal(graphToolsEnabled({ agent: { graphTools: { enabled: false } } }), false);
	});

	it("graphTools rides resolveSettings: absent record → the empty subsection (ON); a record's delta passes through", () => {
		const eff = resolveSettings(null);
		assert.deepEqual(eff.agent.graphTools, {});
		const off = resolveSettings({ version: 1, agent: { graphTools: { enabled: false } } });
		assert.deepEqual(off.agent.graphTools, { enabled: false });
	});
});
