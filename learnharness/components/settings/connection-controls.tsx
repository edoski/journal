"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** A subscription's block inside the Providers group: one grouped row,
 *  padded like the settings rows; its notes stack under it. */
export const CONNECTION_BLOCK = "flex flex-col gap-1 px-4 py-2.5";

/** A note or error under a connection row. */
export function connectionNoteClass(tone: "muted" | "danger"): string {
	return tone === "danger" ? "text-label text-danger" : "text-label text-muted-foreground";
}

export function ConnectionRow({ label, action, disabled, onAction, children, testid, actionTestid }: { label: string; action: string; disabled: boolean; onAction: () => void; children?: React.ReactNode; testid?: string; actionTestid?: string }) {
	return <div className="flex min-h-7 items-center gap-3" data-testid={testid}>
		<span className="min-w-0 flex-1 truncate text-row text-foreground">{label}</span>
		{children}
		<Button type="button" size="sm" variant={action === "Connect" ? "outline" : "quiet"} className="h-7 cursor-pointer px-3 disabled:cursor-not-allowed" data-testid={actionTestid} disabled={disabled} onClick={onAction}>{action}</Button>
	</div>;
}

export function ConnectionFooter({ leading, children, testid }: { leading?: React.ReactNode; children: React.ReactNode; testid?: string }) {
	return <div className="mt-4 flex flex-wrap items-center justify-between gap-3" data-testid={testid}>
		{leading}
		<div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
	</div>;
}

/** The Radix dialog owns focus, its trap and Esc; a busy dialog ignores an outside press. */
export function ConnectionDialog({ children, onClose, busy, label, testid }: { children: React.ReactNode; onClose: () => void; busy: boolean; label: string; testid: string }) {
	return <Dialog open onOpenChange={(open) => !open && onClose()}>
		<DialogContent aria-describedby={undefined} aria-busy={busy} data-testid={testid} className="block max-h-[85vh] overflow-y-auto" onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
			<DialogTitle className="sr-only">{label}</DialogTitle>
			{children}
		</DialogContent>
	</Dialog>;
}

/** A short choice inside a connection row or dialog. An empty value is the
 *  placeholder option ("Add another account", "Select…"). */
export function ConnectionSelect({ ariaLabel, value, onChange, options, placeholder, disabled, id }: {
	ariaLabel?: string;
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
	/** The empty value's label, shown as the placeholder. */
	placeholder?: { label: string; selectable: boolean };
	disabled?: boolean;
	id?: string;
}) {
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
