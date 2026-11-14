"use client";
import { Button } from "@/components/ui/button";

/** A note or error under a connection row. */
export function connectionNoteClass(tone: "muted" | "danger"): string {
	return tone === "danger" ? "text-label text-danger" : "text-label text-muted-foreground";
}

export function ConnectionRow({ label, action, disabled, onAction, actionTestid }: { label: string; action: string; disabled: boolean; onAction: () => void; actionTestid?: string }) {
	return <div className="flex min-h-7 items-center gap-3">
		<span className="min-w-0 flex-1 truncate text-row text-foreground">{label}</span>
		<Button type="button" size="compact" variant="quiet" className="cursor-pointer disabled:cursor-not-allowed" data-testid={actionTestid} disabled={disabled} onClick={onAction}>{action}</Button>
	</div>;
}
