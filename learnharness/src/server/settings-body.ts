/**
 * The settings-PUT body parsers, one per settings.json section; the route
 * maps the URL section to its parser via SETTINGS_SECTIONS.
 *
 * Replace-whole semantics: the client sends the complete desired SECTION;
 * absent fields are absent overrides ({} clears everything). No merges, so
 * a stale client can never resurrect a cleared override. Every known field
 * is strict (a bad one is a 400, never a silent clamp or drop) and unknown
 * body keys are dropped. Unknown DISK keys are a different concern and are
 * kept by the disk schema (core/settings.ts).
 */

import type { z } from "zod";
import { AppearanceSettingsSchema, ClaudeSettingsSchema, NotificationSettingsSchema } from "../core/settings.ts";

/** Parsed-or-rejected — `ok: false` carries the 400's error message. */
export type SettingsBodyResult<T> =
	| { ok: true; settings: T }
	| { ok: false; error: string };

/** The 400 message for the first bad field, by its path. */
const FIELD_ERRORS: Record<string, string> = {
	mode: "mode must be \"dark\" or \"light\"",
	background: "background must be a #hex color or null",
	fontFamily: "fontFamily must be a non-empty string or null",
	proseFontSize: "proseFontSize must be an integer between 12 and 24",
	sessionNameSerif: "sessionNameSerif must be a boolean",
	mdRendering: "mdRendering must be an object",
	"mdRendering.headingWeight": "mdRendering.headingWeight must be an integer between 100 and 900",
	"mdRendering.boldColor": "mdRendering.boldColor must be a #hex color or null",
	"mdRendering.italicColor": "mdRendering.italicColor must be a #hex color or null",
	account: "account must be a Claude account id",
	enabled: "enabled must be a boolean",
};

function bodyParser<T>(schema: z.ZodType<T>) {
	return (body: unknown): SettingsBodyResult<T> => {
		const parsed = schema.safeParse(body);
		if (parsed.success) return { ok: true, settings: parsed.data };
		return { ok: false, error: FIELD_ERRORS[parsed.error.issues[0]?.path.join(".") ?? ""] ?? "Invalid JSON body" };
	};
}

/** The section→parser map for PUT /api/settings/[section]. Whether T3 Code
 *  still has the claude section's account is the route's check. */
export const SETTINGS_SECTIONS = {
	appearance: bodyParser(AppearanceSettingsSchema),
	claude: bodyParser(ClaudeSettingsSchema),
	notifications: bodyParser(NotificationSettingsSchema),
} as const;
