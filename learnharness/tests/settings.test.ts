/**
 * Tests for the settings record's core layer (settings-storage wave,
 * 2026-09-19): the delta schema's sanitizer (core/settings.ts) — strict
 * known-field validation with graceful degradation, unknown-key
 * preservation (forward-compat: a newer record must survive an older
 * app), and the factory defaults. The store/adapter tests live in
 * settings-store.test.ts; resolution in settings-resolution.test.ts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	CURRENT_SETTINGS_VERSION,
	FACTORY_SETTINGS,
	isHexColor,
	sanitizeUserSettings,
} from "../src/core/settings.ts";

describe("FACTORY_SETTINGS (the compiled factory layer)", () => {
	it("pins the owner-decided defaults", () => {
		assert.equal(CURRENT_SETTINGS_VERSION, 1);
		const a = FACTORY_SETTINGS.appearance;
		assert.equal(a.mode, "dark");
		assert.equal(a.background, null); // the mode's own default, not a factory hex
		assert.equal(a.fontFamily, null); // Source Sans 3
		assert.equal(a.proseFontSize, 16);
		assert.equal(a.sessionNameSerif, true);
		assert.equal(a.mdRendering.headingWeight, 900);
		assert.equal(a.mdRendering.boldColor, null); // white
		assert.equal(a.mdRendering.italicColor, null);
	});

	it("has no model knob at all — every agent runs one fixed model", () => {
		assert.equal("chat" in FACTORY_SETTINGS, false);
		assert.equal("agent" in FACTORY_SETTINGS, false);
		assert.equal("claude" in FACTORY_SETTINGS, false);
	});
});

describe("isHexColor", () => {
	it("accepts #rgb and #rrggbb (case-insensitive), rejects everything else", () => {
		for (const good of ["#fff", "#FFF", "#141414", "#8B5CF6"]) assert.equal(isHexColor(good), true, good);
		for (const bad of ["fff", "#ffff", "#gggggg", "141414", "#12345", "", "white"]) {
			assert.equal(isHexColor(bad), false, bad);
		}
	});
});

describe("sanitizeUserSettings", () => {
	it("round-trips a fully valid record field-for-field", () => {
		const record = {
			version: 1,
			claude: { account: "claude-subscription-work" },
			appearance: {
				mode: "light",
				background: "#ffffff",
				fontFamily: "Some Font",
				proseFontSize: 18,
				sessionNameSerif: false,
				mdRendering: { headingWeight: 700, boldColor: "#ff8800", italicColor: null },
			},
			graph: { enabled: false },
		};
		assert.deepEqual(sanitizeUserSettings(record), record);
	});

	it("null and non-objects → null (first-boot semantics), never throws", () => {
		assert.equal(sanitizeUserSettings(null), null);
		assert.equal(sanitizeUserSettings("junk"), null);
		assert.equal(sanitizeUserSettings([1, 2]), null);
	});

	it("absent version defaults to CURRENT; unknown keys ride along VERBATIM", () => {
		const out = sanitizeUserSettings({ futureSection: { knob: 3 }, general: { autoUpdate: true } });
		assert.ok(out);
		assert.equal(out.version, CURRENT_SETTINGS_VERSION);
		assert.deepEqual((out as Record<string, unknown>).futureSection, { knob: 3 });
		assert.deepEqual(out.general, { autoUpdate: true }, "a section from an older record rides along unread");
	});

	it("wrong-typed fields DROP (resolve to factory), never crash", () => {
		const out = sanitizeUserSettings({
			appearance: { mode: "sepia", sessionNameSerif: "true" },
		});
		assert.ok(out);
		assert.deepEqual(out.appearance, {});
	});

	it("out-of-range numbers CLAMP (proseFontSize, headingWeight)", () => {
		const out = sanitizeUserSettings({
			appearance: { proseFontSize: 99, mdRendering: { headingWeight: 999 } },
		});
		assert.ok(out);
		assert.equal(out.appearance?.proseFontSize, 24);
		assert.equal(out.appearance?.mdRendering?.headingWeight, 900);
		const low = sanitizeUserSettings({ appearance: { proseFontSize: 4, mdRendering: { headingWeight: 5 } } });
		assert.ok(low);
		assert.equal(low.appearance?.proseFontSize, 12);
		assert.equal(low.appearance?.mdRendering?.headingWeight, 100);
	});

	it("invalid colors become null (the factory default), valid ones pass", () => {
		const out = sanitizeUserSettings({
			appearance: { background: "blue", mdRendering: { boldColor: "#f00", italicColor: 42 } },
		});
		assert.ok(out);
		assert.equal(out.appearance?.background, null);
		assert.equal(out.appearance?.mdRendering?.boldColor, "#f00");
		assert.equal(out.appearance?.mdRendering?.italicColor, null);
	});

	it("empty strings/whitespace fontFamily → null (Source Sans 3); wrong-type → null too (the default)", () => {
		for (const bad of ["", "   ", 12, { name: "x" }]) {
			const out = sanitizeUserSettings({ appearance: { fontFamily: bad } });
			assert.ok(out);
			assert.equal(out.appearance?.fontFamily, null, JSON.stringify(bad));
		}
	});

	it("the claude section keeps only a Claude account id", () => {
		assert.deepEqual(sanitizeUserSettings({ claude: { account: "claude-subscription" } })?.claude, { account: "claude-subscription" });
		assert.deepEqual(sanitizeUserSettings({ claude: { account: "chatgpt" } })?.claude, {});
		assert.deepEqual(sanitizeUserSettings({ claude: { account: 7 } })?.claude, {});
	});

	it("a record from the model-slot days drops its slots and role pins and keeps the slots' Claude account", () => {
		const out = sanitizeUserSettings({
			version: 1,
			agent: { models: { researcher: { model: { provider: "claude-subscription-work", id: "claude-haiku-5-5" } } }, tools: { demo: false } },
			models: {
				strong: { model: { provider: "chatgpt", id: "gpt-5" }, thinkingLevel: "low" },
				cheap: { model: { provider: "claude-subscription-work", id: "claude-sonnet-5-5" } },
				vision: { model: { provider: "claude-subscription", id: "claude-opus-5-5" }, thinkingLevel: "high" },
			},
		});
		assert.deepEqual(out, { version: 1, claude: { account: "claude-subscription-work" } });
		assert.deepEqual(sanitizeUserSettings({ version: 1, models: { strong: { model: { provider: "chatgpt", id: "gpt-5" } } } }), { version: 1 }, "no Claude slot, no account: the default runs");
		assert.deepEqual(
			sanitizeUserSettings({ version: 1, claude: { account: "claude-subscription" }, models: { strong: { model: { provider: "claude-subscription-work", id: "claude-opus-5-5" } } } })?.claude,
			{ account: "claude-subscription" },
			"a chosen account wins over the slots it replaced",
		);
	});

	it("a stored agent section (the retired tool switches) is dropped on read, whatever it says", () => {
		const out = sanitizeUserSettings({ version: 1, agent: { tools: { research: false, demo: false, visual: false, pdf: false }, search: { engine: "tavily" } } });
		assert.deepEqual(out, { version: 1 });
	});
});
