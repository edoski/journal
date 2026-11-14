"use client";
/**
 * Thin settings primitives (settings-app wave): the control kit the
 * settings dialog needs. Sections → groups → rows; everything SSRs clean
 * (render tests pin the sections' markup).
 *
 * The dependency graying (owner, 2026-09-20) follows the graph viewer's
 * render-panel convention: the WHOLE row dims (opacity-40, label and
 * control together) and the control itself locks — the row owns the dim.
 */

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/hint";

/** A section block: pronounced mono heading + content. */
export function SettingsSection({
	title,
	hint,
	children,
	testid,
}: {
	title: string;
	/** One quiet line under the header — only where it earns its place. */
	hint?: string;
	children: React.ReactNode;
	testid?: string;
}) {
	// The left list names the section, so the pane repeats no title.
	return (
		<section data-testid={testid} aria-label={title} data-slot="settings-section" className="flex flex-col gap-6 px-6 pb-8 pt-6">
			{hint && <p className="-mb-2 px-1 text-label text-muted-foreground">{hint}</p>}
			{children}
		</section>
	);
}

/** A labeled sub-group inside a section (owner, 2026-09-20: clear
 *  separation — Models / Tools / Prompts read as three blocks). */
export function SettingsGroup({
	label,
	description,
	children,
	testid,
}: {
	label: string;
	/** One quiet line under the header. */
	description?: string;
	children: React.ReactNode;
	testid?: string;
}) {
	return (
		<div data-testid={testid} data-slot="settings-group" className="flex flex-col gap-2">
			<h3 className="px-1 text-label font-medium text-muted-foreground">{label}</h3>
			{description && <p className="-mt-1 px-1 text-label text-muted-foreground">{description}</p>}
			<div className="flex flex-col divide-y rounded-lg border">{children}</div>
		</div>
	);
}

/** One label + one control. Label left (with optional muted hint), control
 *  right — the settings row shape. */
export function SettingsRow({
	label,
	hint,
	children,
	testid,
	dimmed,
}: {
	label: string;
	hint?: ReactNode;
	children: React.ReactNode;
	testid?: string;
	/** Dependency graying: the whole row dims when the
	 *  control is inert (parent off, no file yet, …). */
	dimmed?: boolean;
}) {
	return (
		<div
			data-testid={testid}
			data-slot="settings-row"
			className={cn("flex min-h-12 items-center justify-between gap-4 px-4 py-2", dimmed && "opacity-50")}
		>
			<span className="min-w-0">
				<span className="block text-row text-foreground">{label}</span>
				{hint && <span className="block text-label text-muted-foreground">{hint}</span>}
			</span>
			{children}
		</div>
	);
}

/** The on/off switch, shadcn's Switch. With a disc icon the icon is the
 *  switch's disc (the figure cards' invert switch). */
export function Toggle({
	checked,
	disabled,
	onChange,
	label,
	discIcon,
	title,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: (next: boolean) => void;
	/** Accessible name for the switch role. */
	label: string;
	/** Optional icon disc (owner round, 2026-10-07): the figure cards' invert
	 *  toggle renders the half-filled contrast circle AS the disc — the icon
	 *  carries the meaning; plain toggles keep the plain disc. */
	discIcon?: ReactNode;
	/** Optional tooltip on the switch. */
	title?: string;
}) {
	const testid = `toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
	const control = (
		<Switch
			checked={checked}
			onCheckedChange={onChange}
			aria-label={label}
			disabled={disabled}
			data-testid={testid}
			thumb={discIcon}
		/>
	);
	return title ? <Hint label={title}>{control}</Hint> : control;
}

/** A thin hex/text input committing on blur + Enter (settings pace, not
 *  typing pace — every commit is a section PUT). */
export function CommitInput({
	value,
	placeholder,
	onCommit,
	ariaLabel,
	testid,
	type = "text",
}: {
	/** "" = unset (the factory default). Mirrors the STORED record —
	 *  after a clamped/normalized commit this flows back and the field
	 *  snaps to the stored truth (owner repro: a negative size kept
	 *  displaying "-5" while 12 was stored). */
	value: string;
	placeholder?: string;
	onCommit: (next: string) => void;
	ariaLabel: string;
	testid?: string;
	type?: "text" | "number";
}) {
	// The draft exists only while editing; a blur shows the record's value
	// again — commit-on-blur/Enter (owner ruling), the field honest about
	// what landed.
	const [draft, setDraft] = useState(value);
	const [editing, setEditing] = useState(false);
	const field = {
		type,
		value: editing ? draft : value,
		placeholder,
		"aria-label": ariaLabel,
		"data-testid": testid,
		onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
			setEditing(true);
			setDraft(e.target.value);
		},
		onBlur: () => {
			if (!editing) return;
			setEditing(false);
			const next = draft.trim();
			if (next !== value) onCommit(next);
		},
		onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") e.currentTarget.blur();
			if (e.key === "Escape") {
				setEditing(false);
				e.currentTarget.blur();
			}
		},
	};
	return <Input variant="sm" {...field} className="w-32 text-right tabular-nums" />;
}