/**
 * The shared settings-PUT body parsers — one seam per settings surface.
 * The section parsers (settings-storage wave, 2026-09-19) follow the
 * house rules below.
 *
 * Replace-whole semantics: the client sends the complete desired SECTION;
 * absent fields are absent overrides ({} clears everything). No merges, so
 * a stale client can never resurrect a cleared override. Unknown body keys
 * are dropped — unknown DISK keys are
 * a different concern and are preserved by the sanitizer (core/settings.ts).
 */

import { isHexColor } from "../core";
import { isClaudeProvider } from "../core/contracts/claude.ts";
import type { AgentSettings, AppearanceSettings, ClaudeSettings } from "../core/settings.ts";
import { TOGGLEABLE_TOOLS } from "../core/pending.ts";

/** Parsed-or-rejected — `ok: false` carries the 400's error message. */
export type SettingsBodyResult<T> =
	| { ok: true; settings: T }
	| { ok: false; error: string };

// ─── Section parsers (settings-storage wave, 2026-09-19) ────────────────────
// One parser per settings.json section; the route maps the URL section to
// its parser via SETTINGS_SECTIONS below. Strict on every known field (a
// bad type/shape is a 400, never a silent clamp/drop), unknown keys dropped.

function asRecord(body: unknown): Record<string, unknown> | null {
	if (!body || typeof body !== "object" || Array.isArray(body)) return null;
	return body as Record<string, unknown>;
}

/** A boolean map (tool switches): every value must be boolean. */
function parseBooleanMap(value: unknown, field: string): { map?: Record<string, boolean>; error?: string } {
	if (value === undefined) return {};
	const raw = asRecord(value);
	if (!raw) return { error: `${field} must be an object` };
	const out: Record<string, boolean> = {};
	for (const [key, entry] of Object.entries(raw)) {
		if (typeof entry !== "boolean") return { error: `${field}.${key} must be a boolean` };
		out[key] = entry;
	}
	return { map: out };
}

/** agent: { tools? }. A stored graphTools key (the retired knowledge-graph
 *  tools switch) is ignored, never written back. */
export function parseAgentSettingsBody(body: unknown): SettingsBodyResult<AgentSettings> {
	const raw = asRecord(body);
	if (!raw) return { ok: false, error: "Invalid JSON body" };
	const settings: AgentSettings = {};
	const tools = parseBooleanMap(raw.tools, "tools");
	if (tools.error) return { ok: false, error: tools.error };
	if (tools.map) {
		// Unknown tool keys are rejected at WRITE time (user decision
		// 2026-09-19): the delta is inert while unread, but once the bridge
		// honors it a persisted bogus key would drift. The read-side
		// sanitizer stays lenient for forward-compat. `explain` was the
		// quizzing-mechanics switch, retired with multiple choice (7 Nov
		// 2026): stored records still carry it and the panel writes the
		// stored section back, so it is dropped rather than rejected.
		const { explain: _retired, ...map } = tools.map;
		const supported = TOGGLEABLE_TOOLS as readonly string[];
		for (const key of Object.keys(map)) {
			if (!supported.includes(key)) {
				return { ok: false, error: `unknown tool "${key}" (supported: ${supported.join(", ")})` };
			}
		}
		settings.tools = map;
	}
	return { ok: true, settings };
}

/** A hex-or-null color field (appearance colors): null = default. */
function parseHexOrNull(value: unknown, field: string): { color?: string | null; error?: string } {
	if (value === null) return { color: null };
	if (typeof value !== "string" || !isHexColor(value)) {
		return { error: `${field} must be a #hex color or null` };
	}
	return { color: value };
}

/** appearance: { mode?, background?, fontFamily?, proseFontSize?,
 *  sessionNameSerif?, mdRendering? } */
export function parseAppearanceSettingsBody(body: unknown): SettingsBodyResult<AppearanceSettings> {
	const raw = asRecord(body);
	if (!raw) return { ok: false, error: "Invalid JSON body" };
	const settings: AppearanceSettings = {};
	if (raw.mode !== undefined) {
		if (raw.mode !== "dark" && raw.mode !== "light") {
			return { ok: false, error: "mode must be \"dark\" or \"light\"" };
		}
		settings.mode = raw.mode;
	}
	if (raw.background !== undefined) {
		const parsed = parseHexOrNull(raw.background, "background");
		if (parsed.error) return { ok: false, error: parsed.error };
		settings.background = parsed.color ?? null;
	}
	if (raw.fontFamily !== undefined) {
		if (raw.fontFamily !== null && (typeof raw.fontFamily !== "string" || !raw.fontFamily.trim())) {
			return { ok: false, error: "fontFamily must be a non-empty string or null" };
		}
		settings.fontFamily = raw.fontFamily as string | null;
	}
	if (raw.proseFontSize !== undefined) {
		if (
			typeof raw.proseFontSize !== "number" ||
			!Number.isInteger(raw.proseFontSize) ||
			raw.proseFontSize < 12 ||
			raw.proseFontSize > 24
		) {
			return { ok: false, error: "proseFontSize must be an integer between 12 and 24" };
		}
		settings.proseFontSize = raw.proseFontSize;
	}
	if (raw.sessionNameSerif !== undefined) {
		if (typeof raw.sessionNameSerif !== "boolean") {
			return { ok: false, error: "sessionNameSerif must be a boolean" };
		}
		settings.sessionNameSerif = raw.sessionNameSerif;
	}
	if (raw.mdRendering !== undefined) {
		const md = asRecord(raw.mdRendering);
		if (!md) return { ok: false, error: "mdRendering must be an object" };
		const rendering: NonNullable<AppearanceSettings["mdRendering"]> = {};
		if (md.headingWeight !== undefined) {
			if (
				typeof md.headingWeight !== "number" ||
				!Number.isInteger(md.headingWeight) ||
				md.headingWeight < 100 ||
				md.headingWeight > 900
			) {
				return { ok: false, error: "mdRendering.headingWeight must be an integer between 100 and 900" };
			}
			rendering.headingWeight = md.headingWeight;
		}
		if (md.boldColor !== undefined) {
			const parsed = parseHexOrNull(md.boldColor, "mdRendering.boldColor");
			if (parsed.error) return { ok: false, error: parsed.error };
			rendering.boldColor = parsed.color ?? null;
		}
		if (md.italicColor !== undefined) {
			const parsed = parseHexOrNull(md.italicColor, "mdRendering.italicColor");
			if (parsed.error) return { ok: false, error: parsed.error };
			rendering.italicColor = parsed.color ?? null;
		}
		if (Object.keys(rendering).length) settings.mdRendering = rendering;
	}
	return { ok: true, settings };
}

/** claude: { account? } — the Claude account every agent runs on. Whether
 *  T3 Code still has that account is the route's check. */
export function parseClaudeSettingsBody(body: unknown): SettingsBodyResult<ClaudeSettings> {
	const raw = asRecord(body);
	if (!raw) return { ok: false, error: "Invalid JSON body" };
	if (raw.account === undefined) return { ok: true, settings: {} };
	if (typeof raw.account !== "string" || !isClaudeProvider(raw.account)) {
		return { ok: false, error: "account must be a Claude account id" };
	}
	return { ok: true, settings: { account: raw.account } };
}

/** The section→parser map for PUT /api/settings/[section]. */
export const SETTINGS_SECTIONS = {
	agent: parseAgentSettingsBody,
	appearance: parseAppearanceSettingsBody,
	claude: parseClaudeSettingsBody,
} as const;

export type SettingsSectionName = keyof typeof SETTINGS_SECTIONS;
