"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDesignVariant } from "@/components/design-variant";
import { SettingsDesignContext, useSettingsProposed } from "./settings-design";

/** A subscription's block inside the Providers group (Proposed: one
 *  grouped row, padded like the settings rows; its notes stack under it). */
export function connectionBlockClass(proposed: boolean, current: string): string {
	return proposed ? "flex flex-col gap-1 px-4 py-2.5" : current;
}

/** A note or error under a connection row. */
export function connectionNoteClass(proposed: boolean, tone: "muted" | "danger", current: string): string {
	return proposed ? (tone === "danger" ? "text-label text-danger" : "text-label text-muted-foreground") : current;
}

export function ConnectionRow({ label, action, disabled, onAction, children, testid, actionTestid, labelClassName }: { label: string; action: string; disabled: boolean; onAction: () => void; children?: React.ReactNode; testid?: string; actionTestid?: string; labelClassName?: string }) {
	if (useSettingsProposed()) {
		return <div className="flex min-h-7 items-center gap-3" data-testid={testid}>
			<span className="min-w-0 flex-1 truncate text-row text-foreground">{label}</span>
			{children}
			<Button type="button" size="sm" variant={action === "Connect" ? "outline" : "quiet"} className="h-7 cursor-pointer px-3 disabled:cursor-not-allowed" data-testid={actionTestid} disabled={disabled} onClick={onAction}>{action}</Button>
		</div>;
	}
	return <div className="flex flex-wrap items-center gap-3" data-testid={testid}>
		<span className={labelClassName ?? "font-ui text-xs text-foreground"}>{label}</span>
		{children}
		<Button type="button" size="xs" variant={action === "Connect" ? "outline" : "ghost"} className={`cursor-pointer disabled:cursor-not-allowed ${action === "Connect" ? "" : "text-muted-foreground hover:text-foreground"}`} data-testid={actionTestid} disabled={disabled} onClick={onAction}>{action}</Button>
	</div>;
}

export function ConnectionFooter({ leading, children, testid }: { leading?: React.ReactNode; children: React.ReactNode; testid?: string }) {
	return <div className="mt-4 flex flex-wrap items-center justify-between gap-3" data-testid={testid}>
		{leading}
		<div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
	</div>;
}

export function ConnectionDialog({ children, onClose, busy, label, testid, backdropTestid }: { children: React.ReactNode; onClose: () => void; busy: boolean; label: string; testid: string; backdropTestid: string }) {
	const ref = useRef<HTMLDivElement>(null), closeRef = useRef(onClose);
	closeRef.current = onClose;
	const backdropDismiss = useBackdropDismiss(() => { if (!busy) onClose(); });
	const proposed = useDesignVariant() === "proposed";
	useEffect(() => {
		// Proposed: the Radix dialog owns focus, its trap and Esc.
		if (proposed) return;
		const previous = document.activeElement as HTMLElement | null;
		const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])') ?? [])];
		focusable()[0]?.focus();
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
			else if (event.key === "Tab") {
				const items = focusable(), first = items[0], last = items.at(-1);
				if (!first) { event.preventDefault(); return; }
				if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
				else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
			}
		};
		document.addEventListener("keydown", key, true);
		return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
	}, [proposed]);
	if (proposed) return <Dialog open onOpenChange={(open) => !open && onClose()}>
		<DialogContent aria-describedby={undefined} aria-busy={busy} data-testid={testid} className="block max-h-[85vh] overflow-y-auto" onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
			<DialogTitle className="sr-only">{label}</DialogTitle>
			<SettingsDesignContext.Provider value="proposed">{children}</SettingsDesignContext.Provider>
		</DialogContent>
	</Dialog>;
	return createPortal(<div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80" data-testid={backdropTestid} {...backdropDismiss}>
		<div ref={ref} role="dialog" aria-modal="true" aria-label={label} aria-busy={busy} data-testid={testid} onClick={(event) => event.stopPropagation()} className="settings-dialog-pop mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-md border border-border bg-card p-5 shadow-xl">{children}</div>
	</div>, document.body);
}

/** A short choice inside a connection row or dialog: a native select under
 *  Current, the shadcn Select under Proposed. An empty value is the
 *  placeholder option ("Add another account", "Select…"). */
export function ConnectionSelect({ ariaLabel, value, onChange, options, placeholder, disabled, id, current }: {
	ariaLabel?: string;
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
	/** The empty value's label; Proposed shows it as the placeholder. */
	placeholder?: { label: string; selectable: boolean };
	disabled?: boolean;
	id?: string;
	/** Current's class string, unchanged. */
	current: string;
}) {
	if (useSettingsProposed()) {
		// Radix forbids an empty item value: a selectable placeholder rides a sentinel.
		const NONE = "__none__";
		return <Select value={value || (placeholder?.selectable ? NONE : undefined)} onValueChange={(next) => onChange(next === NONE ? "" : next)} disabled={disabled}>
			<SelectTrigger id={id} size="sm" aria-label={ariaLabel} className="min-w-0 max-w-full">
				<SelectValue placeholder={placeholder?.label} />
			</SelectTrigger>
			<SelectContent>
				{placeholder?.selectable && <SelectItem value={NONE}>{placeholder.label}</SelectItem>}
				{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
			</SelectContent>
		</Select>;
	}
	return <select id={id} aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={current}>
		{placeholder && <option value="" disabled={!placeholder.selectable}>{placeholder.label}</option>}
		{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
	</select>;
}
