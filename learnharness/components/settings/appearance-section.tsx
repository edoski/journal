"use client";
/**
 * The Appearance section (thin settings wave).
 *
 * Writes PUT the whole appearance section and hand the delta back so the
 * CSS variables move IMMEDIATELY (components/settings/appearance.tsx).
 * The app is dark only, in SF Pro, with fixed heading weights and palette
 * (the owner's decisions), and the stylesheet owns those, so mode,
 * background, reading font, serif session names and heading weight have no
 * row (their schema fields stay); reading size and the emphasis inks do.
 * Every row is a control, never free text: Text size is a menu of the
 * sizes the record takes, its factory size marked as the default (picking
 * it unsets the field); each ink is a swatch that opens a panel of the
 * app's inks, and Default, which stores null. The inks default to the regular text
 * colour (globals.css), which an unset swatch shows.
 */

import { FACTORY_SETTINGS, PROSE_FONT_MAX, PROSE_FONT_MIN, type AppearanceSettings } from "@/src/core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorField, SettingsGroup, SettingsRow } from "./controls.tsx";

/** The reading sizes the menu offers: every size the record takes. */
const SIZES = Array.from({ length: PROSE_FONT_MAX - PROSE_FONT_MIN + 1 }, (_, i) => PROSE_FONT_MIN + i);
const FACTORY_SIZE = FACTORY_SETTINGS.appearance.proseFontSize;

/** The regular text ink, which an unset emphasis ink resolves to. */
const TEXT_INK = "var(--foreground)";

export function AppearanceSection({
	appearance,
	onSectionChange,
}: {
	/** The record's appearance delta (absent = factory). */
	appearance: AppearanceSettings | undefined;
	/** PUT the whole appearance section; the page re-applies on success. */
	onSectionChange: (next: AppearanceSettings) => void;
}) {
	const md = appearance?.mdRendering;
	const size = appearance?.proseFontSize ?? FACTORY_SIZE;
	const bold = md?.boldColor ?? null;
	const italic = md?.italicColor ?? null;

	return (
		<SettingsGroup label="Reading" testid="group-reading">
			<SettingsRow label="Text size" testid="row-prose-size">
				<Select
					value={String(size)}
					onValueChange={(v) => {
						const n = Number(v);
						// The factory size is the default: picking it unsets the field.
						onSectionChange({ ...appearance, proseFontSize: n === FACTORY_SIZE ? undefined : n });
					}}
				>
					<SelectTrigger size="sm" aria-label="Text size" data-testid="input-prose-size" className="w-32 font-normal system-current:font-normal">
						<SelectValue />
					</SelectTrigger>
					<SelectContent data-testid="prose-size-menu">
						{SIZES.map((n) => (
							<SelectItem key={n} value={String(n)}>
								{n === FACTORY_SIZE ? `${n} px, default` : `${n} px`}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SettingsRow>
			<SettingsRow label="Bold color" hint={bold === null ? "Same as the text" : undefined} testid="row-bold-color">
				<ColorField
					value={bold}
					fallback={TEXT_INK}
					label="Bold color"
					testid="input-bold-color"
					onCommit={(v) => onSectionChange({ ...appearance, mdRendering: { ...md, boldColor: v } })}
				/>
			</SettingsRow>
			<SettingsRow label="Italic color" hint={italic === null ? "Same as the text" : undefined} testid="row-italic-color">
				<ColorField
					value={italic}
					fallback={TEXT_INK}
					label="Italic color"
					testid="input-italic-color"
					onCommit={(v) => onSectionChange({ ...appearance, mdRendering: { ...md, italicColor: v } })}
				/>
			</SettingsRow>
		</SettingsGroup>
	);
}
