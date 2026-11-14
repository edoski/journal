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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

/** A colour as `#rrggbb`, the one form the system colour picker takes:
 *  `#abc` grows to `#aabbcc`; anything else is null. Pure. */
export function pickerHex(value: string | null): string | null {
	if (!value) return null;
	if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
	return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : null;
}

/** The colour a swatch is painted with, as `#rrggbb`, read from one pixel,
 *  so a stylesheet colour in any notation (oklch) seeds the picker. */
function paintedHex(element: Element): string | null {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.fillStyle = getComputedStyle(element).backgroundColor;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A colour setting (settings.md, "colour field"): a swatch in the field's
 * 28px outline that opens the system colour picker, and Default, which
 * clears the choice. `value` is the stored hex, or null for the default,
 * when the swatch shows `fallback` (a CSS colour, the ink the default
 * resolves to). The swatch follows the picker live; the choice commits
 * once, when the picker closes on a new colour.
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
	const [draft, setDraft] = useState<string | null>(null);
	const swatch = useRef<HTMLSpanElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const stored = pickerHex(value);
	const shown = draft ?? stored;
	// The record answering a commit replaces the live colour.
	useEffect(() => setDraft(null), [value]);
	// React's onChange is the input event, live while the picker is open;
	// the native change fires once, when it closes on a new colour.
	const commit = useRef(onCommit);
	commit.current = onCommit;
	useEffect(() => {
		const el = input.current;
		if (!el) return;
		const onChange = () => {
			if (el.value !== stored) commit.current(el.value);
		};
		el.addEventListener("change", onChange);
		return () => el.removeEventListener("change", onChange);
	}, [stored]);
	/** A default colour opens the picker on the ink the swatch shows. */
	const seed = (el: HTMLInputElement) => {
		if (!shown && swatch.current) el.value = paintedHex(swatch.current) ?? el.value;
	};
	return (
		<span data-slot="color-field" className="flex items-center gap-1">
			<span
				className="relative inline-flex h-7 w-12 items-center justify-center rounded-md border border-input transition-colors hover:bg-fill-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none"
			>
				<span
					ref={swatch}
					aria-hidden
					data-slot="color-swatch"
					className="size-4 rounded-full ring-1 ring-white/15"
					style={{ background: shown ?? fallback }}
				/>
				<input
					type="color"
					aria-label={label}
					data-testid={testid}
					value={shown ?? "#000000"}
					ref={input}
					onPointerDown={(e) => seed(e.currentTarget)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") seed(e.currentTarget);
					}}
					onChange={(e) => setDraft(e.target.value)}
					className="absolute inset-0 size-full cursor-pointer opacity-0"
				/>
			</span>
			<Button
				variant="quiet"
				size="compact"
				data-testid={testid ? `${testid}-default` : undefined}
				disabled={value === null}
				onClick={() => onCommit(null)}
				aria-label={`${label}: back to default`}
				className="px-2 text-row font-normal"
			>
				Default
			</Button>
		</span>
	);
}
