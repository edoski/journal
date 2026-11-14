/**
 * THE USER SETTINGS RECORD's shape + sanitizer (settings-storage wave,
 * 2026-09-19): one versioned, DELTA-shaped record at the data-dir seam
 * (config.SETTINGS_FILE) holding every non-secret product preference.
 *
 * DELTA SEMANTICS (owner decision, 2026-09-19): the record stores EXPLICIT
 * user choices only — ABSENT keys resolve to the factory defaults compiled
 * into this module (FACTORY_SETTINGS). A software update that ADDS a knob
 * (a new appearance field) therefore needs no migration: old
 * records simply lack the new keys. `version` is a PRIVATE schema counter
 * for BREAKING shape changes only (field renamed / meaning changed) —
 * unrelated to the app release version. Migrations live in the adapter
 * (src/store/settings.ts), not here.
 *
 * There is no model choice (owner, 2026-11-14): every agent runs
 * CLAUDE_MODEL. The record names only the Claude account they run on.
 *
 * Sanitizer contract: whatever
 * arrives from disk or the network passes through sanitizeUserSettings
 * before use — never trusted raw. Strict on known fields, PRESERVES
 * unknown keys verbatim (a newer record must never be destroyed by an
 * older app reading it). Invalid known values degrade gracefully:
 * out-of-range numbers CLAMP, wrong-typed/invalid fields DROP (resolve to
 * factory default), never throw.
 *
 * Browser-safe: pure logic + types only, no node imports. The resolved
 * (fully concrete) view lives in settings-resolution.ts.
 */

import { isClaudeProvider } from "./contracts/claude.ts";

/** The schema version this code understands. Bump ONLY for breaking shape
 *  changes (a field renamed/meaning changed); pure additions never bump. */
export const CURRENT_SETTINGS_VERSION = 1;

/** The connection refusal: the Claude account the agents run on must be
 * signed in, or the action dies mid-stream masked to a generic error. The
 * code keeps its historical name (provider_key_missing). HTTP callers get
 * 503 + this JSON; in-band consumers (the job record's error field) carry
 * the human `error` line. `provider` names the account. */
export const PROVIDER_KEY_MISSING_CODE = "provider_key_missing" as const;
export interface ProviderKeyMissing {
	/** Human-readable — safe to render as-is. */
	error: string;
	/** The machine discriminator the client switches on. */
	code: typeof PROVIDER_KEY_MISSING_CODE;
	/** The Claude account that is not signed in. */
	provider: string;
}
/** Claude's connection is the user's own Claude Code sign-in. */
const CLAUDE_NOT_CONNECTED = "Claude Code is not signed in to your Claude plan — run `claude` in a terminal, sign in with your Claude account, then press Refresh in Settings → Accounts";
export function providerKeyMissing(provider: string): ProviderKeyMissing {
	return { error: CLAUDE_NOT_CONNECTED, code: PROVIDER_KEY_MISSING_CODE, provider };
}
/** UI consumers detect key-refused work by the wording (info tone, not
 * scary-error) — the envelope's home module owns the string so the writer
 * and the matcher can never drift. */
export function isProviderKeyRefusal(error: string | undefined): boolean {
	return error === CLAUDE_NOT_CONNECTED;
}
/** The typed throw for in-process seams (extraction pipeline): callers
 * catch it to skip honestly (trigger) or surface the 503 envelope (routes). */
export class ProviderKeyMissingError extends Error {
	readonly envelope: ProviderKeyMissing;
	constructor(provider: string) {
		const envelope = providerKeyMissing(provider);
		super(envelope.error);
		this.name = "ProviderKeyMissingError";
		this.envelope = envelope;
	}
}

/** The `claude` section: which Claude account every agent runs on (a
 *  provider id, contracts/claude.ts). Absent = the default account. */
export interface ClaudeSettings {
	account?: string;
}

/** Markdown-rendering knobs — the bare-bones set (owner decision). */
export interface MdRenderingSettings {
	/** Heading font weight (100–900, default 900). CSS resolves the nearest
	 *  available weight of the chosen font — no font introspection needed. */
	headingWeight?: number;
	/** Color for **bold** spans (default #ffffff). */
	boldColor?: string | null;
	/** Color for *italic* spans (default #ffffff). */
	italicColor?: string | null;
}

/** Appearance settings — mode, colors, type, markdown emphasis. */
export interface AppearanceSettings {
	/** "dark" | "light" (default dark). */
	mode?: "dark" | "light";
	/** The one user-chosen color; everything else derives per-mode in code.
	 *  null = the mode's default background. */
	background?: string | null;
	/** The main reading font (everything that is Source Sans 3 today), by
	 *  name — user-chosen from installed fonts. null = Source Sans 3. */
	fontFamily?: string | null;
	/** Reading font size in px (12–24, default 16). Headings render as
	 *  multiples of this, so one knob scales the document coherently. */
	proseFontSize?: number;
	/** Session names in CMU Serif (default true — today's look). */
	sessionNameSerif?: boolean;
	mdRendering?: MdRenderingSettings;
}

/** THE record. Every section optional (delta); unknown top-level keys are
 *  preserved verbatim by the sanitizer (forward-compat with newer records). */
export interface UserSettings {
	version: number;
	claude?: ClaudeSettings;
	appearance?: AppearanceSettings;
	[key: string]: unknown;
}

/** Factory defaults for everything core can pin (owner decisions
 *  2026-09-19). */
export interface FactorySettings {
	version: number;
	appearance: {
		mode: "dark" | "light";
		background: string | null;
		fontFamily: string | null;
		proseFontSize: number;
		sessionNameSerif: boolean;
		mdRendering: {
			headingWeight: number;
			boldColor: string | null;
			italicColor: string | null;
		};
	};
}

export const FACTORY_SETTINGS: FactorySettings = {
	version: CURRENT_SETTINGS_VERSION,
	appearance: {
		mode: "dark",
		background: null, // the dark default (#141414) lives in the mode's derivation curve
		fontFamily: null, // Source Sans 3
		proseFontSize: 16,
		sessionNameSerif: true,
		mdRendering: { headingWeight: 900, boldColor: null, italicColor: null },
	},
};

// ─── Sanitizer ─────────────────────────────────────────────────────────────

const PROSE_FONT_MIN = 12;
const PROSE_FONT_MAX = 24;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** #rgb / #rrggbb (case-insensitive) — the only color format we accept. */
export function isHexColor(value: string): boolean {
	return /^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Coerce an arbitrary hex-or-null field: null and valid hex pass through,
 *  anything else becomes null (the factory/per-mode default). */
function sanitizeHexOrNull(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value === "string" && isHexColor(value)) return value;
	return null;
}

const boolOrDrop = (value: unknown): boolean | undefined =>
	typeof value === "boolean" ? value : undefined;

/** The `claude` section: an account id that is not a Claude provider drops. */
function sanitizeClaude(raw: Record<string, unknown>): ClaudeSettings {
	return typeof raw.account === "string" && isClaudeProvider(raw.account) ? { account: raw.account } : {};
}

/** The Claude account a record from before the model slots died (owner,
 *  2026-11-14) ran on: its Lessons slot's, else Helpers', else Pictures'. */
function legacySlotAccount(models: unknown): string | undefined {
	if (models === null || typeof models !== "object" || Array.isArray(models)) return undefined;
	for (const slot of ["strong", "cheap", "vision"]) {
		const provider = ((models as Record<string, { model?: { provider?: unknown } } | undefined>)[slot])?.model?.provider;
		if (typeof provider === "string" && isClaudeProvider(provider)) return provider;
	}
	return undefined;
}

function sanitizeMdRendering(raw: unknown): MdRenderingSettings {
	const out: MdRenderingSettings = {};
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
	const r = raw as Record<string, unknown>;
	if (typeof r.headingWeight === "number" && Number.isFinite(r.headingWeight)) {
		out.headingWeight = clamp(Math.round(r.headingWeight), 100, 900);
	}
	if (r.boldColor !== undefined) out.boldColor = sanitizeHexOrNull(r.boldColor);
	if (r.italicColor !== undefined) out.italicColor = sanitizeHexOrNull(r.italicColor);
	return out;
}

function sanitizeAppearance(raw: Record<string, unknown>): AppearanceSettings {
	const out: AppearanceSettings = {};
	if (raw.mode === "dark" || raw.mode === "light") out.mode = raw.mode;
	if (raw.background !== undefined) out.background = sanitizeHexOrNull(raw.background);
	if (raw.fontFamily !== undefined) {
		out.fontFamily = typeof raw.fontFamily === "string" && raw.fontFamily.trim() ? raw.fontFamily : null;
	}
	if (typeof raw.proseFontSize === "number" && Number.isFinite(raw.proseFontSize)) {
		out.proseFontSize = clamp(Math.round(raw.proseFontSize), PROSE_FONT_MIN, PROSE_FONT_MAX);
	}
	const sessionNameSerif = boolOrDrop(raw.sessionNameSerif);
	if (sessionNameSerif !== undefined) out.sessionNameSerif = sessionNameSerif;
	if (raw.mdRendering !== undefined) out.mdRendering = sanitizeMdRendering(raw.mdRendering);
	return out;
}

/**
 * Coerce arbitrary JSON (disk file, network body) into a valid delta record:
 * known fields validated strictly (invalid ones drop/clamp per module doc),
 * UNKNOWN KEYS PRESERVED VERBATIM (a newer record must survive an older
 * app). Never throws. Non-objects → null.
 */
export function sanitizeUserSettings(raw: unknown): UserSettings | null {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	const out: UserSettings = {
		version: typeof r.version === "number" && Number.isInteger(r.version) && r.version >= 1 ? r.version : CURRENT_SETTINGS_VERSION,
	};
	if (r.appearance !== null && typeof r.appearance === "object" && !Array.isArray(r.appearance)) {
		out.appearance = sanitizeAppearance(r.appearance as Record<string, unknown>);
	}
	if (r.claude !== null && typeof r.claude === "object" && !Array.isArray(r.claude)) {
		out.claude = sanitizeClaude(r.claude as Record<string, unknown>);
	}
	if (!out.claude?.account) {
		const account = legacySlotAccount(r.models);
		if (account) out.claude = { ...out.claude, account };
	}
	// Unknown top-level keys ride along untouched (forward-compat). The
	// known-DEAD keys are stripped instead of riding, so a fossil copy on
	// disk never resurrects through reads and any later write flushes it:
	// `chat` (the old default-settings section, died with per-session
	// models, owner 2026-09-28), `models` (the model slots, owner
	// 2026-11-14 — their account carried over into `claude` above) and
	// `agent` (the tool switches, owner 2026-11-14 — every tool is always
	// on, so a stored `agent.tools` switches nothing off).
	for (const [key, value] of Object.entries(r)) {
		if (key === "chat" || key === "models" || key === "agent") continue;
		if (!(key in out)) out[key] = value;
	}
	return out;
}
