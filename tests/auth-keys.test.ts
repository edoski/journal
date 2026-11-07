/**
 * Model-provider key shape rules + masking — PURE module, so this file owns
 * no fs. Owner decisions being pinned:
 *  - validation is SHAPE-ONLY (no live pings) and bad pastes are 400s;
 *  - masking is last-4 + length — plaintext never leaves the store.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { genericProviderKeyGuard, maskKey } from "../src/core/auth-keys.ts";

describe("genericProviderKeyGuard (model-provider keys — paste hygiene only)", () => {
	it("accepts any ≥12-char whitespace-free value (families vary)", () => {
		assert.deepEqual(genericProviderKeyGuard("OPENROUTER_API_KEY", "sk-or-v1-abc123"), { ok: true });
		assert.deepEqual(genericProviderKeyGuard("OPENAI_API_KEY", "whaterver-value-here"), { ok: true });
		assert.deepEqual(genericProviderKeyGuard("HF_TOKEN", "hf_xxxxxxxx9999"), { ok: true });
	});

	it("rejects truncations and whitespace — the only guards", () => {
		const short = genericProviderKeyGuard("ZAI_API_KEY", "short");
		assert.ok(!short.ok);
		if (!short.ok) assert.match(short.error, /at least 12/);
		assert.ok(!genericProviderKeyGuard("OPENAI_API_KEY", "has whitespace now").ok);
		assert.ok(!genericProviderKeyGuard("OPENAI_API_KEY", "   ").ok);
	});

	it("trims before checking", () => {
		assert.ok(genericProviderKeyGuard("OPENROUTER_API_KEY", "  sk-or-v1-xyz999  ").ok);
	});
});

describe("maskKey (plaintext never leaves)", () => {
	it("shows the last 4 only", () => {
		assert.equal(maskKey("sk-or-v1-abcdefgh1234"), "…1234");
	});

	it("never reveals a degenerate short value in full", () => {
		assert.equal(maskKey("ab"), "…ab");
		assert.equal(maskKey("abcd"), "…abcd");
		assert.equal(maskKey("abcde"), "…bcde");
	});

	it("trims before masking", () => {
		assert.equal(maskKey("  sk-or-v1-xyzw9  "), "…yzw9");
	});
});
