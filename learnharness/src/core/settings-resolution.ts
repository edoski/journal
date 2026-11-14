/**
 * THE SETTINGS RESOLUTION LAYER (settings-storage wave, 2026-09-19): pure
 * projection of the delta record (core/settings.ts UserSettings) into
 * EffectiveSettings — every field CONCRETE, ready for consumers with no
 * delta-walking of their own.
 *
 * Resolution rule (owner decision): explicit value in the record wins;
 * absent key resolves to the compiled factory default. The Claude account
 * defaults to the plain signed-in `claude`. There are no tool switches:
 * every tutor tool is always on (owner, 2026-11-14).
 */

import { CLAUDE_SUBSCRIPTION } from "./contracts/claude.ts";
import { FACTORY_SETTINGS, type FactorySettings, type UserSettings } from "./settings.ts";

/** The concrete appearance view — same shape as the factory's. */
export type EffectiveAppearance = FactorySettings["appearance"];

/** The concrete view: every knob resolved, no absent fields. */
export interface EffectiveSettings {
	/** The Claude account every agent runs CLAUDE_MODEL on. */
	claude: { account: string };
	appearance: EffectiveAppearance;
}

/** Resolve the whole record. `record` may be null (first boot) — every
 *  field lands on its default. */
export function resolveSettings(record: UserSettings | null): EffectiveSettings {
	const appearance = record?.appearance ?? {};
	const md = appearance.mdRendering ?? {};
	const factoryAppearance = FACTORY_SETTINGS.appearance;
	const factoryMd = factoryAppearance.mdRendering;
	return {
		claude: { account: record?.claude?.account ?? CLAUDE_SUBSCRIPTION.providerId },
		appearance: {
			mode: appearance.mode ?? factoryAppearance.mode,
			background: appearance.background ?? factoryAppearance.background,
			fontFamily: appearance.fontFamily ?? factoryAppearance.fontFamily,
			proseFontSize: appearance.proseFontSize ?? factoryAppearance.proseFontSize,
			sessionNameSerif: appearance.sessionNameSerif ?? factoryAppearance.sessionNameSerif,
			mdRendering: {
				headingWeight: md.headingWeight ?? factoryMd.headingWeight,
				boldColor: md.boldColor ?? factoryMd.boldColor,
				italicColor: md.italicColor ?? factoryMd.italicColor,
			},
		},
	};
}
