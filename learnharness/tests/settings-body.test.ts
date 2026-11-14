/**
 * Tests for the section parsers (settings-storage wave, 2026-09-19):
 * src/server/settings-body.ts — agent/appearance/claude strictness: every
 * known field is strict (bad type/shape → 400-style error, never a silent
 * clamp), unknown keys drop, absent fields mean absent overrides. Pure — no
 * fs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	parseAgentSettingsBody,
	parseAppearanceSettingsBody,
	parseClaudeSettingsBody,
	SETTINGS_SECTIONS,
} from "../src/server/settings-body.ts";

describe("parseAgentSettingsBody", () => {
	it("a stale client's per-role model pins are dropped like any unknown key", () => {
		const r = parseAgentSettingsBody({ models: { researcher: { model: { provider: "chatgpt", id: "gpt-5" } } }, tools: { demo: false } });
		assert.ok(r.ok);
		assert.deepEqual(r.settings, { tools: { demo: false } });
	});

	it("tools: a boolean map; non-boolean values are 400s; the retired prompt switches are dropped", () => {
		const r = parseAgentSettingsBody({ tools: { research: false }, prompts: { "system-prompt.md": true } });
		assert.ok(r.ok);
		assert.deepEqual(r.settings, { tools: { research: false } });
		assert.equal(parseAgentSettingsBody({ tools: { quiz: "no" } }).ok, false);
	});

	it("a stale search field is dropped like any unknown key", () => {
		const r = parseAgentSettingsBody({ search: { engine: "tavily" }, tools: { research: true } });
		assert.ok(r.ok);
		assert.equal("search" in r.settings, false);
		assert.deepEqual(r.settings.tools, { research: true });
	});

	it("a graphTools key (the retired knowledge-graph tools switch) is ignored, never written", () => {
		const r = parseAgentSettingsBody({ tools: { research: true }, graphTools: { enabled: false } });
		assert.ok(r.ok);
		assert.deepEqual(r.settings, { tools: { research: true } });
	});

	it("an empty {} agent section parses to {} (replace-whole clear)", () => {
		const r = parseAgentSettingsBody({});
		assert.ok(r.ok);
		assert.deepEqual(r.settings, {});
	});
});

describe("parseAppearanceSettingsBody", () => {
	it("parses every field; hex-or-null colors; clamps happen at sanitize, rejects here", () => {
		const r = parseAppearanceSettingsBody({
			mode: "light",
			background: "#ffffff",
			fontFamily: "Some Font",
			proseFontSize: 20,
			sessionNameSerif: false,
			mdRendering: { headingWeight: 700, boldColor: "#ff8800", italicColor: null },
		});
		assert.ok(r.ok);
		assert.deepEqual(r.settings, {
			mode: "light",
			background: "#ffffff",
			fontFamily: "Some Font",
			proseFontSize: 20,
			sessionNameSerif: false,
			mdRendering: { headingWeight: 700, boldColor: "#ff8800", italicColor: null },
		});
	});

	it("rejects bad enums, ranges, and colors — with specific messages, never clamps", () => {
		const cases: unknown[] = [
			{ mode: "sepia" },
			{ background: "blue" },
			{ background: 42 },
			{ fontFamily: "" },
			{ fontFamily: 12 },
			{ proseFontSize: 30 },
			{ proseFontSize: 64.5 },
			{ sessionNameSerif: 1 },
			{ mdRendering: { headingWeight: 1000 } },
			{ mdRendering: { boldColor: "red" } },
		];
		for (const body of cases) {
			assert.equal(parseAppearanceSettingsBody(body).ok, false, JSON.stringify(body));
		}
		// boundary values that MUST pass: 12 and 24, 100 and 900, #fff
		assert.ok(parseAppearanceSettingsBody({ proseFontSize: 12 }));
		assert.ok(parseAppearanceSettingsBody({ proseFontSize: 24 }));
		assert.ok(parseAppearanceSettingsBody({ mdRendering: { headingWeight: 100 } }));
		assert.ok(parseAppearanceSettingsBody({ mdRendering: { headingWeight: 900 } }));
		assert.ok(parseAppearanceSettingsBody({ background: "#abc" }));
		// null = "the mode's default" — explicit, valid
		assert.ok(parseAppearanceSettingsBody({ background: null, fontFamily: null }));
	});

	it("rejects non-object bodies and non-object mdRendering", () => {
		assert.equal(parseAppearanceSettingsBody([1]).ok, false);
		assert.equal(parseAppearanceSettingsBody({ mdRendering: "big" }).ok, false);
	});
});

describe("SETTINGS_SECTIONS (the route's section map)", () => {
	it("maps exactly the record sections", () => {
		assert.deepEqual(
			Object.keys(SETTINGS_SECTIONS),
			["agent", "appearance", "claude"],
		);
	});
});

describe("parseClaudeSettingsBody", () => {
	it("takes one Claude account id; {} clears it back to the default account", () => {
		assert.deepEqual(parseClaudeSettingsBody({ account: "claude-subscription-work" }), { ok: true, settings: { account: "claude-subscription-work" } });
		assert.deepEqual(parseClaudeSettingsBody({}), { ok: true, settings: {} });
	});

	it("anything that is not a Claude account id is a 400", () => {
		for (const body of [{ account: "chatgpt" }, { account: 3 }, "nope", null]) {
			assert.equal(parseClaudeSettingsBody(body).ok, false, JSON.stringify(body));
		}
	});
});
