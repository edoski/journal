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
 * Inputs commit on blur/Enter. The emphasis inks default to the regular
 * text color (globals.css); the empty-state placeholders say "same as text".
 */

import type { AppearanceSettings } from "@/src/core";
import { CommitInput, SettingsGroup, SettingsRow } from "./controls.tsx";

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

	const commitProseSize = (v: string) => {
		// Empty = factory default (owner, fix wave): omit the key so the record
		// UNSETS and the field stays empty (absence, not null, is the
		// unset for numbers). Number("") is 0, so the old clamp wrote 12.
		if (v === "") {
			onSectionChange({ ...appearance, proseFontSize: undefined });
			return;
		}
		const n = Number(v);
		if (!Number.isFinite(n)) return; // bad input: no write, factory stays
		onSectionChange({ ...appearance, proseFontSize: Math.min(24, Math.max(12, Math.round(n))) });
	};

	return (
		<SettingsGroup label="Reading" testid="group-reading">
			<SettingsRow label="Text size" testid="row-prose-size">
				<CommitInput
					type="number"
					value={String(appearance?.proseFontSize ?? "")}
					placeholder="16"
					ariaLabel="prose font size"
					testid="input-prose-size"
					onCommit={commitProseSize}
				/>
			</SettingsRow>
			<SettingsRow label="Bold color" testid="row-bold-color">
				<CommitInput
					value={md?.boldColor ?? ""}
					placeholder="same as text"
					ariaLabel="bold color"
					testid="input-bold-color"
					onCommit={(v) => onSectionChange({ ...appearance, mdRendering: { ...md, boldColor: v === "" ? null : v } })}
				/>
			</SettingsRow>
			<SettingsRow label="Italic color" testid="row-italic-color">
				<CommitInput
					value={md?.italicColor ?? ""}
					placeholder="same as text"
					ariaLabel="italic color"
					testid="input-italic-color"
					onCommit={(v) => onSectionChange({ ...appearance, mdRendering: { ...md, italicColor: v === "" ? null : v } })}
				/>
			</SettingsRow>
		</SettingsGroup>
	);
}
