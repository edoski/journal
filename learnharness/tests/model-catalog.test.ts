import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	catalogDefaultsFor,
	catalogProviders,
	catalogRolePins,
	catalogSlots,
	clampChatLevel,
	clampModelsLevels,
	modelCatalog,
	rolePinsFor,
	toModelDto,
	validateChatSettings,
	validateModelsSettings,
} from "../src/server/model-catalog.ts";
import type { EffectiveSlot } from "../src/core/settings-resolution.ts";
import type { SettingsValidation } from "../src/server/model-catalog.ts";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { DEFAULT_THINKING_ORDER } from "../src/core/settings.ts";
import { piEngineForSpec } from "../src/agent/models.ts";
import { claudeSubscriptionModel } from "../src/agent/claude-stream.ts";
import { signInTestClaude, TEST_MODEL } from "./claude-fixture.ts";
import { BACKGROUND_MODEL_ROLES } from "../src/core/settings.ts";
import { resolveSettings } from "../src/core/settings-resolution.ts";
import { readSettings } from "../src/store/settings.ts";
import { effectiveSettings } from "../src/server/stores.ts";

// The model-control wave (2026-09-12): pi-ai owns the registry — these pins
// hold our projection + validation honest against the shipped catalog, and
// pin pi's per-model thinking truth so a pi-ai upgrade can't silently change
// what we send. BYOK wave (2026-09-22): no factory pins — unset surfaces
// are NULL/undefined, never phantom defaults.

// The app runs only on subscriptions: the catalog is the signed-in Claude
// account's models (a fake sign-in, tests/claude-fixture.ts) plus ChatGPT's
// when connected (not in this process).
await signInTestClaude();
const OPUS = { ...TEST_MODEL };

/** The Claude catalog entry — the thinking-truth specimen (low…max). */
function opusModel() {
	const opus = claudeSubscriptionModel(OPUS.provider, OPUS.id);
	assert.ok(opus, "claude-opus-5-5 in catalog");
	return opus!;
}

describe("the model catalog projection", () => {
	it("serves the signed-in subscriptions' models with the picker's DTO shape, and no API-key provider", () => {
		const { models, defaults, providers, slots } = modelCatalog();
		assert.deepEqual(models.map((m) => `${m.provider}:${m.id}`), ["claude-subscription:claude-opus-5-5"]);
		const opus = models[0]!;
		assert.deepEqual(opus.supportedLevels, ["low", "medium", "high", "xhigh", "max"]);
		assert.deepEqual(opus.input, ["text", "image"]);
		assert.deepEqual(opus.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, "a plan model has no per-token price");
		assert.deepEqual(providers.map((p) => p.id).sort(), ["chatgpt", "claude-subscription"]);
		assert.equal(providers.find((p) => p.id === "claude-subscription")?.connected, true);
		assert.equal(providers.find((p) => p.id === "chatgpt")?.connected, false);
		assert.deepEqual(Object.keys(slots), ["strong", "cheap", "vision"]);
		// BYOK: the payload carries ONLY what the machine's record actually		// BYOK: the payload carries ONLY what the machine's record actually
		// says — never a phantom id. data/settings.json belongs to
		// settings-store.test.ts (the one-fs-owner discipline), so READ the
		// resolved truth here instead of pinning it: on a scratch worktree
		// the record is empty (defaults/slots NULL), on the owner's machine
		// configured slots must surface exactly as configured.
		const record = readSettings();
		const strong = effectiveSettings().models.strong;
		if (strong) {
			assert.ok(defaults, "a configured strong slot yields a default");
			assert.deepEqual(defaults!.model, { provider: strong.provider, id: strong.id });
		} else {
			assert.equal(defaults, null);
		}
		for (const name of ["strong", "cheap", "vision"] as const) {
			const stored = record?.models?.[name];
			if (stored?.model) {
				assert.ok(slots[name], name);
				assert.deepEqual(slots[name]!.model, stored.model);
			} else {
				assert.equal(slots[name], null, name);
			}
		}
	});

	it("defaults: the strong slot verbatim; null when unset (BYOK, per-session models 2026-09-28)", () => {
		assert.equal(catalogDefaultsFor(null), null);
		const strong = { provider: "openrouter", id: "z-ai/glm-5.3-flash", thinkingLevel: "low" as const };
		const d = catalogDefaultsFor(strong);
		assert.deepEqual(d, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" }, thinkingLevel: "low" });
		// No level stored → the model alone reports (the level resolves at
		// engine build from DEFAULT_THINKING_ORDER).
		const bare = catalogDefaultsFor({ provider: "openrouter", id: "qwen/qwen3.8-flash" });
		assert.deepEqual(bare, { model: { provider: "openrouter", id: "qwen/qwen3.8-flash" } });
	});

	it("toModelDto projects the raw catalog model verbatim", () => {
		const raw = opusModel();
		const dto = toModelDto(raw);
		assert.equal(dto.id, raw.id);
		assert.equal(dto.name, raw.name);
		assert.deepEqual(dto.supportedLevels, getSupportedThinkingLevels(raw));
		assert.equal(dto.cost.input, raw.cost.input);
		assert.equal(dto.contextWindow, raw.contextWindow);
	});
});

describe("the background roles' resolved pins (rolePins)", () => {
	it("no record → every role is NULL (BYOK: no phantom defaults)", () => {
		const pins = rolePinsFor(resolveSettings(null).agent.models);
		assert.deepEqual(Object.keys(pins), [...BACKGROUND_MODEL_ROLES]);
		for (const role of BACKGROUND_MODEL_ROLES) {
			assert.equal(pins[role], null, role);
		}
	});

	it("a slot re-tiers its roles; overrides win for that role only", () => {
		const record = {
			version: 1,
			models: { cheap: { model: { provider: "openrouter", id: "qwen/qwen3.8-flash" } } },
			agent: { models: { researcher: { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" }, thinkingLevel: "high" as const } } },
		};
		const pins = rolePinsFor(resolveSettings(record).agent.models);
		assert.deepEqual(pins.researcher, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" }, thinkingLevel: "high" });
		assert.deepEqual(pins.auditor, { model: { provider: "openrouter", id: "qwen/qwen3.8-flash" } }); // level unset
		assert.equal(pins.visualMaker, null, "vision tier untouched");
	});

	it("catalogRolePins matches the same resolution the engine wiring uses", () => {
		const pins = catalogRolePins();
		for (const role of BACKGROUND_MODEL_ROLES) {
			assert.ok(pins[role] === null || typeof pins[role]!.model.id === "string");
		}
	});
});

describe("the model slots surface (model slots wave, 2026-09-20)", () => {
	it("catalogSlots projects the record's tiers — NULL only where a tier holds no model", () => {
		// machine-aware (one-fs-owner: READ the record, never pin it)
		const record = readSettings();
		const slots = catalogSlots();
		for (const name of ["strong", "cheap", "vision"] as const) {
			const stored = record?.models?.[name];
			if (stored?.model) {
				assert.ok(slots[name], name);
				assert.deepEqual(slots[name]!.model, stored.model);
			} else {
				assert.equal(slots[name], null, name);
			}
		}
	});

	it("catalogProviders lists only the subscriptions, whatever API keys the environment holds", () => {
		const saved = process.env.ZAI_API_KEY;
		process.env.ZAI_API_KEY = "test-zai-key-1234567890";
		try {
			assert.ok(!catalogProviders().some((p) => p.id === "zai"));
		} finally {
			if (saved === undefined) delete process.env.ZAI_API_KEY;
			else process.env.ZAI_API_KEY = saved;
		}
	});
});

describe("the models-section validation gate", () => {
	it("accepts a valid slot and rejects unknown provider/model and API-key providers", () => {
		assert.equal(validateModelsSettings({ strong: { model: OPUS } }).ok, true);
		assert.equal(validateModelsSettings({ cheap: { model: { provider: "nope", id: "x" } } }).ok, false);
		assert.equal(validateModelsSettings({ vision: { model: { provider: OPUS.provider, id: "nope" } } }).ok, false);
		assert.equal(validateModelsSettings({ strong: { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } } }).ok, false);
	});

	it("thinking levels never reject a slot write (owner, interlude 2026-09-22)", () => {
		// clamp, never reject: validation accepts ANY level; the WRITE clamps.
		assert.deepEqual(validateModelsSettings({ strong: { model: OPUS, thinkingLevel: "minimal" } }), { ok: true });
		assert.deepEqual(validateModelsSettings({ strong: { model: OPUS, thinkingLevel: "off" } }), { ok: true });
	});

	it("clampModelsLevels: the slot's own model translates the pin", () => {
		assert.deepEqual(clampModelsLevels({ strong: { model: OPUS, thinkingLevel: "minimal" } }), { strong: { model: OPUS, thinkingLevel: "low" } });
		assert.equal(clampModelsLevels({ strong: { model: OPUS, thinkingLevel: "off" } }).strong?.thinkingLevel, "low", "Opus cannot disable thinking");
		assert.deepEqual(clampModelsLevels({ strong: { model: OPUS, thinkingLevel: "xhigh" } }).strong, { model: OPUS, thinkingLevel: "xhigh" });
		// a slot with no level rides as-is (the server never invents one)
		assert.deepEqual(clampModelsLevels({ strong: { model: OPUS } }), { strong: { model: OPUS } });
	});

	it("accepts empty settings (the clear-slots write)", () => {
		assert.deepEqual(validateModelsSettings({}), { ok: true });
	});
});

describe("the settings validation gate", () => {
	it("thinking levels never reject a chat write (owner, interlude 2026-09-22)", () => {
		assert.deepEqual(validateChatSettings({ model: OPUS, thinkingLevel: "minimal" }), { ok: true });
		assert.deepEqual(validateChatSettings({ thinkingLevel: "xhigh" }), { ok: true });
	});

	it("clampChatLevel: the body's model, else the strong slot, translates the pin", () => {
		const strong: EffectiveSlot = { ...OPUS };
		assert.deepEqual(clampChatLevel({ model: OPUS, thinkingLevel: "minimal" as const }, null), { model: OPUS, thinkingLevel: "low" });
		assert.equal(clampChatLevel({ thinkingLevel: "off" as const }, strong).thinkingLevel, "low", "no body model: the strong slot is the fallback");
		assert.deepEqual(clampChatLevel({ thinkingLevel: "minimal" as const }, null), { thinkingLevel: "minimal" }, "no model anywhere rides unchecked");
		assert.deepEqual(clampChatLevel({ model: OPUS }, strong), { model: OPUS });
	});

	it("rejects unknown providers, unknown models and API-key providers", () => {
		assert.equal(validateChatSettings({ model: { provider: "nope", id: "x/y" } }).ok, false);
		assert.equal(validateChatSettings({ model: { provider: OPUS.provider, id: "nope" } }).ok, false);
		assert.equal(validateChatSettings({ model: { provider: "openai", id: "gpt-4" } }).ok, false);
	});

	it("accepts empty settings (the clear-overrides write)", () => {
		assert.deepEqual(validateChatSettings({}), { ok: true });
	});
});

describe("pi thinking truth (pinned against pi-ai upgrades)", () => {
	it("claude-opus-5-5: low…max; anything else clamps to the nearest", () => {
		const opus = opusModel();
		assert.deepEqual(getSupportedThinkingLevels(opus), ["low", "medium", "high", "xhigh", "max"]);
		assert.equal(clampThinkingLevel(opus, "minimal"), "low");
		assert.equal(clampThinkingLevel(opus, "off"), "low");
		assert.equal(clampThinkingLevel(opus, "high"), "high");
	});

	it("the engine factory clamps explicit levels; unknown and API-key models throw honestly", () => {
		assert.equal(piEngineForSpec({ ...OPUS, thinkingLevel: "high" }).level, "high");
		assert.equal(piEngineForSpec({ ...OPUS, thinkingLevel: "minimal" }).level, "low");
		assert.throws(() => piEngineForSpec({ provider: OPUS.provider, id: "nope", thinkingLevel: "low" }), /catalog has no model/);
		assert.throws(() => piEngineForSpec({ provider: "openrouter", id: "z-ai/glm-5.3-flash" }), /catalog has no model/);
	});

	it("UNSET levels resolve from the baked DEFAULT_THINKING_ORDER (owner, 2026-09-22)", () => {
		assert.deepEqual([...DEFAULT_THINKING_ORDER], ["medium", "low", "high", "minimal", "xhigh", "max"]);
		assert.equal(piEngineForSpec({ ...OPUS }).level, "medium", "the first supported level in the order");
		assert.equal(piEngineForSpec({ ...OPUS, thinkingLevel: "max" }).level, "max", "explicit levels never consult the order");
	});

	it("the legacy piEngineFor role entry point throws honestly (BYOK: no pins)", async () => {
		const { piEngineFor } = await import("../src/agent/models.ts");
		assert.throws(() => piEngineFor("prober"), /no configured model for role "prober"/);
	});
});