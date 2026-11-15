/**
 * THE USER SETTINGS RECORD's shape and schemas (settings-storage wave,
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
 * Zod schemas check both doors: what a PUT may send (strict, a bad field
 * is a 400) and what settings.json holds (lenient per field, unknown keys
 * kept verbatim so a newer record survives an older app reading it).
 *
 * Browser-safe: no node imports. The resolved
 * (fully concrete) view lives in settings-resolution.ts.
 */

import { z } from "zod";
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

const color = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i).nullable();
const fontName = z.string().regex(/\S/).nullable();
const claudeAccount = z.string().refine(isClaudeProvider);

/** The reading size's bounds in px, which the record clamps to and
 *  Settings' Text size menu offers. */
export const PROSE_FONT_MIN = 12;
export const PROSE_FONT_MAX = 24;

/** The appearance section a PUT may send: every field optional, any bad
 *  one rejects the body. `headingWeight` needs no font introspection: CSS
 *  resolves the nearest weight the chosen font has. Null colors and fonts
 *  mean the mode's default. */
export const AppearanceSettingsSchema = z.object({
	mode: z.enum(["dark", "light"]).optional(),
	background: color.optional(),
	fontFamily: fontName.optional(),
	proseFontSize: z.int().min(PROSE_FONT_MIN).max(PROSE_FONT_MAX).optional(),
	sessionNameSerif: z.boolean().optional(),
	mdRendering: z.object({
		headingWeight: z.int().min(100).max(900).optional(),
		boldColor: color.optional(),
		italicColor: color.optional(),
	}).optional(),
});
export type AppearanceSettings = z.infer<typeof AppearanceSettingsSchema>;

/** The claude section: which Claude account every agent runs on. Absent
 *  means the default account. */
export const ClaudeSettingsSchema = z.object({ account: claudeAccount.optional() });
export type ClaudeSettings = z.infer<typeof ClaudeSettingsSchema>;

/** THE record. Every section optional (delta); unknown top-level keys are
 *  preserved verbatim (forward-compat with newer records). */
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

const clampedInt = (min: number, max: number) =>
	z.number().transform((n) => Math.min(Math.max(Math.round(n), min), max));

/** A Claude account a record from before the model slots died (owner,
 *  2026-11-14) ran on. */
const slotAccount = z.object({ model: z.object({ provider: claudeAccount }) })
	.transform((slot) => slot.model.provider)
	.optional()
	.catch(undefined);

/** settings.json as read from disk. A bad field falls back on its own and
 *  never costs the rest of the file: out-of-range numbers clamp, bad colors
 *  and fonts become null (the default), anything else drops. */
const UserSettingsSchema = z.looseObject({
	version: z.int().min(1).catch(CURRENT_SETTINGS_VERSION),
	appearance: z.object({
		mode: z.enum(["dark", "light"]).optional().catch(undefined),
		background: color.optional().catch(null),
		fontFamily: fontName.optional().catch(null),
		proseFontSize: clampedInt(PROSE_FONT_MIN, PROSE_FONT_MAX).optional().catch(undefined),
		sessionNameSerif: z.boolean().optional().catch(undefined),
		mdRendering: z.object({
			headingWeight: clampedInt(100, 900).optional().catch(undefined),
			boldColor: color.optional().catch(null),
			italicColor: color.optional().catch(null),
		}).optional().catch({}),
	}).optional().catch(undefined),
	claude: z.object({ account: claudeAccount.optional().catch(undefined) }).optional().catch(undefined),
	models: z.object({ strong: slotAccount, cheap: slotAccount, vision: slotAccount }).optional().catch(undefined),
}).transform(({ chat, models, agent, ...record }): UserSettings => {
	// The known-dead keys go, so a fossil copy never resurrects through reads
	// and the next write flushes it: `chat` (per-session models, owner
	// 2026-09-28), `agent` (every tool always on, owner 2026-11-14) and
	// `models`, whose Lessons, else Helpers, else Pictures account carries
	// over into `claude` unless one is already chosen.
	const legacy = models?.strong ?? models?.cheap ?? models?.vision;
	return legacy && !record.claude?.account ? { ...record, claude: { ...record.claude, account: legacy } } : record;
});

/** Any JSON (the disk file, a record to write) as a valid delta record, or
 *  null when it is not an object. Never throws. */
export function sanitizeUserSettings(raw: unknown): UserSettings | null {
	return UserSettingsSchema.safeParse(raw).data ?? null;
}
