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

import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/hint";

/** The field look (spec: settings.md): 28px, radius 8, the input
 *  edge (white 11%), 13px, the 2px focus ring. */
export const SETTINGS_FIELD =
	"h-7 rounded-md border border-input bg-transparent px-2 text-row text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

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

/** The Agent/Appearance collapsed-menu look.
 * `unavailable` preserves callers that gate clicks without native disabling;
 * `disabled` retains native button semantics where the caller requires them. */
export function SettingsMenuTrigger({
	value, unavailable, disabled, className, ...props
}: Omit<ComponentPropsWithRef<"button">, "value" | "children"> & {
	value: string;
	unavailable?: boolean;
}) {
	return <button
		type="button"
		{...props}
		disabled={disabled}
		data-slot="settings-menu-trigger"
		className={cn(
			SETTINGS_FIELD,
			"flex items-center gap-1.5 pr-1.5 text-left",
			!(disabled || unavailable) && "hover:bg-fill-hover",
			unavailable && "cursor-not-allowed",
			className,
		)}
	>
		<span className="min-w-0 flex-1 truncate">{value}</span>
		<ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
	</button>;
}

/** The on/off switch. With a disc icon it is a plain button in the switch
 *  role: the figure cards render it outside the settings dialog. */
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
	/** Optional tooltip on the switch (native on the disc-icon button). */
	title?: string;
}) {
	const testid = `toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
	if (!discIcon) {
		const control = (
			<Switch
				checked={checked}
				onCheckedChange={onChange}
				aria-label={label}
				disabled={disabled}
				data-testid={testid}
			/>
		);
		return title ? <Hint label={title}>{control}</Hint> : control;
	}
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			{...(title ? { title } : {})}
			disabled={disabled}
			data-testid={testid}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative h-4.5 w-8 shrink-0 rounded-full border border-border transition-colors",
				// Owner (2026-09-20): on is a gray track with a WHITE disc (a full-white
				// track was too loud); off stays the muted track.
				checked ? "bg-muted-foreground" : "bg-muted",
				disabled && "cursor-not-allowed",
			)}
		>
			{/* The icon IS the disc: same size, same slide, same state colors —
			    only the knob's face changes (the invert affordance). */}
			<span
				className={cn(
					"absolute left-0 top-0.5 flex size-3 items-center justify-center rounded-full transition-transform",
					checked ? "translate-x-4 text-foreground" : "translate-x-0.5 text-muted-foreground",
				)}
			>
				{discIcon}
			</span>
		</button>
	);
}

/** A thin select — native element, options as given. */
export function ThinSelect({
	value,
	onChange,
	children,
	ariaLabel,
	testid,
	disabled,
}: {
	value: string;
	onChange: (next: string) => void;
	children: React.ReactNode;
	ariaLabel: string;
	testid?: string;
	disabled?: boolean;
}) {
	return (
		<select
			value={value}
			aria-label={ariaLabel}
			data-testid={testid}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			className={SETTINGS_FIELD}
		>
			{children}
		</select>
	);
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