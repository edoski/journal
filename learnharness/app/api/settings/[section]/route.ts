/**
 * PUT /api/settings/[section] — section-scoped record writes
 * (settings-storage wave, 2026-09-19). One PUT replaces ONE section
 * replace-whole (absent fields = absent overrides — the house settings
 * discipline); sections are independent, so partial writes can never
 * clobber each other.
 *
 *   section ∈ agent | appearance | claude
 *   Body: the complete desired section object. Parse + validate strictly
 *   (server/settings-body.ts): a bad shape/type is a 400 carrying the
 *   supported list where one exists. The claude section's account must be
 *   one T3 Code has (an unknown account is a 400).
 */

import type { ClaudeSettings } from "@/src/core";
import {
	SETTINGS_SECTIONS,
	claudeAccountKnown,
	readSettingsRecord,
	releasePrestart,
	writeSettingsRecord,
	type SettingsBodyResult,
} from "@/src/server";

export const dynamic = "force-dynamic";

/** One parser, result type erased to the common envelope. */
type AnySectionParser = (body: unknown) => SettingsBodyResult<unknown>;

export async function PUT(request: Request, ctx: { params: Promise<{ section: string }> }) {
	const { section } = await ctx.params;
	const parser = (SETTINGS_SECTIONS as Record<string, AnySectionParser>)[section];
	if (!parser) {
		return Response.json(
			{ error: `unknown settings section "${section}"`, supported: Object.keys(SETTINGS_SECTIONS) },
			{ status: 404 },
		);
	}
	const body = await request.json().catch(() => null);
	const parsed = parser(body);
	if (!parsed.ok) {
		return Response.json({ error: parsed.error }, { status: 400 });
	}
	const account = section === "claude" ? (parsed.settings as ClaudeSettings).account : undefined;
	if (account && !claudeAccountKnown(account)) {
		return Response.json({ error: `Unknown Claude account "${account}"` }, { status: 400 });
	}

	// Read-modify-write ONE section of the record; everything else rides
	// along untouched (other sections, unknown keys — sanitize preserves).
	const record = readSettingsRecord() ?? { version: 1 };
	const next = { ...record, [section]: parsed.settings };
	writeSettingsRecord(next);
	// The next answer's process ran on the account he just left (prestart.ts).
	if (section === "claude") releasePrestart();
	return Response.json({ settings: next });
}
