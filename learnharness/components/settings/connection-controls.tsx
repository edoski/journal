"use client";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";

/** A note or error under a connection row. */
export function connectionNoteClass(tone: "muted" | "danger"): string {
	return tone === "danger" ? "text-callout text-danger" : "text-callout text-muted-foreground";
}

export function ConnectionRow({ label, action, disabled, onAction, actionTestid, actionRef }: { label: string; action: string; disabled: boolean; onAction: () => void; actionTestid?: string; actionRef?: Ref<HTMLButtonElement> }) {
	return <div className="flex min-h-7 items-center gap-3">
		<span className="min-w-0 flex-1 truncate text-body text-foreground">{label}</span>
		<Button type="button" size="compact" variant="quiet" className="cursor-pointer disabled:cursor-not-allowed" data-testid={actionTestid} ref={actionRef} disabled={disabled} onClick={onAction}>{action}</Button>
	</div>;
}
