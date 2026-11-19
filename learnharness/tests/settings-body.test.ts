/**
 * Tests for the section parsers (settings-storage wave, 2026-09-19):
 * src/server/settings-body.ts — appearance/claude strictness: every
 * known field is strict (bad type/shape → 400-style error, never a silent
 * clamp), unknown keys drop, absent fields mean absent overrides. Pure — no
 * fs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SETTINGS_SECTIONS } from "../src/server/settings-body.ts";

const { appearance: parseAppearanceSettingsBody, claude: parseClaudeSettingsBody } = SETTINGS_SECTIONS;

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

	it("names the first bad field in the 400", () => {
		assert.deepEqual(parseAppearanceSettingsBody({ mode: "sepia" }), { ok: false, error: "mode must be \"dark\" or \"light\"" });
		assert.deepEqual(parseAppearanceSettingsBody({ mdRendering: { boldColor: "red" } }), { ok: false, error: "mdRendering.boldColor must be a #hex color or null" });
		assert.deepEqual(parseAppearanceSettingsBody([1]), { ok: false, error: "Invalid JSON body" });
	});

	it("an empty mdRendering is an empty override, kept as sent", () => {
		assert.deepEqual(parseAppearanceSettingsBody({ mdRendering: {} }), { ok: true, settings: { mdRendering: {} } });
	});
});

describe("SETTINGS_SECTIONS (the route's section map)", () => {
	it("maps exactly the record sections: no agent section, so its PUT is an unknown section", () => {
		assert.deepEqual(
			Object.keys(SETTINGS_SECTIONS),
			["appearance", "claude", "notifications"],
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
