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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Hint } from "@/components/ui/hint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SwatchGrid, type Swatch } from "@/components/ui/swatch-grid";

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
			{hint && <p className="-mb-2 px-1 text-callout system-current:text-label text-muted-foreground">{hint}</p>}
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
	/** None where the row inside already names the group (the sign-in dialog). */
	label?: string;
	/** One quiet line under the header. */
	description?: string;
	children: React.ReactNode;
	testid?: string;
}) {
	return (
		<div data-testid={testid} data-slot="settings-group" className="flex flex-col gap-2">
			{label && <h3 className="px-1 text-callout system-current:text-label system-current:font-medium text-muted-foreground">{label}</h3>}
			{description && <p className="-mt-1 px-1 text-callout system-current:text-label text-muted-foreground">{description}</p>}
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
				<span className="block text-body system-current:text-row text-foreground">{label}</span>
				{hint && <span className="block text-callout system-current:text-label text-muted-foreground">{hint}</span>}
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

/** A colour as `#rrggbb`, the form the swatches are named in: `#abc`
 *  grows to `#aabbcc`; anything else is null. Pure. */
export function pickerHex(value: string | null): string | null {
	if (!value) return null;
	if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
	return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : null;
}

/** The inks a colour field offers: Apple's dark-mode system colours (HIG,
 *  Color), each at least 4.5:1 on the app's dark background, so bold or
 *  italic text in any of them reads (tested). Indigo and Teal are left out:
 *  Indigo reads under 4.5:1, and Teal sits between Mint and Cyan. */
export const INK_SWATCHES: readonly Swatch[] = [
	{ name: "Red", color: "#ff453a" },
	{ name: "Orange", color: "#ff9f0a" },
	{ name: "Yellow", color: "#ffd60a" },
	{ name: "Green", color: "#30d158" },
	{ name: "Mint", color: "#63e6e2" },
	{ name: "Cyan", color: "#64d2ff" },
	{ name: "Blue", color: "#0a84ff" },
	{ name: "Purple", color: "#bf5af2" },
	{ name: "Pink", color: "#ff375f" },
	{ name: "Brown", color: "#ac8e68" },
];

/** Two rows of the inks, so the panel stays a small square under the field. */
const INK_COLUMNS = INK_SWATCHES.length / 2;

/**
 * A colour setting (settings.md, "colour field"): a swatch in the field's
 * 28px outline that opens a panel of the app's inks (`SwatchGrid`), and
 * Default, which clears the choice. `value` is the stored hex, or null for
 * the default, when the swatch shows `fallback` (a CSS colour, the ink the
 * default resolves to). Picking an ink commits it and closes the panel.
 */
export function ColorField({
	value,
	fallback,
	onCommit,
	label,
	testid,
}: {
	value: string | null;
	fallback: string;
	onCommit: (next: string | null) => void;
	/** Accessible name: "Bold color". */
	label: string;
	testid?: string;
}) {
	const [open, setOpen] = useState(false);
	const stored = pickerHex(value);
	return (
		<span data-slot="color-field" className="flex items-center gap-1">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					aria-label={label}
					data-testid={testid}
					className="inline-flex h-7 w-12 items-center justify-center rounded-md border border-input outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-fill-selected motion-reduce:transition-none"
				>
					<span aria-hidden data-slot="color-swatch" className="size-4 rounded-full ring-1 ring-white/15" style={{ background: stored ?? fallback }} />
				</PopoverTrigger>
				<PopoverContent align="end" className="w-auto p-2">
					<SwatchGrid
						aria-label={label}
						swatches={INK_SWATCHES}
						columns={INK_COLUMNS}
						value={stored}
						onValueChange={(color) => {
							setOpen(false);
							if (color !== stored) onCommit(color);
						}}
					/>
				</PopoverContent>
			</Popover>
			<Button
				variant="quiet"
				size="compact"
				data-testid={testid ? `${testid}-default` : undefined}
				disabled={value === null}
				onClick={() => onCommit(null)}
				aria-label={`${label}: back to default`}
				className="px-2 text-body system-current:text-row font-normal system-current:font-normal"
			>
				Default
			</Button>
		</span>
	);
}
