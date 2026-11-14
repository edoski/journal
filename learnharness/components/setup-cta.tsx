"use client";
/**
 * The sign-in surfaces: when the Claude account every agent runs on is not
 * signed in, chat / home / /chat/new hoist a composer pill ("Sign in to
 * Claude"). Click opens the SetupDialog, the sign-in screen. Live updates
 * ride the shared model status, which re-reads on the lh:settings-saved
 * "keys" and "claude" signals every connection change or account switch
 * dispatches.
 */

import { useModelStatus } from "@/components/model-status";

/** Unknown status (loading, or a failed read) is not "signed out": the
 *  server's turn gate stays the truth, so only a known sign-out shows. */
export function useModelSetup() {
	const { status } = useModelStatus();
	return { status, unconnected: status ? !status.connected : false };
}

/** The pill itself. testid "setup-cta-keys". */
export function SignInPill({ onOpen, inline = false }: { onOpen: () => void; inline?: boolean }) {
	const button = (
		<button
			type="button"
			data-testid="setup-cta-keys"
			onClick={onOpen}
			className="rounded-sm border border-border bg-card px-3 py-1.5 font-ui text-xs text-foreground transition-colors hover:border-muted-foreground/50 hover:bg-accent cursor-pointer"
		>
			Sign in to Claude
		</button>
	);
	return inline ? button : <div className="pointer-events-auto mb-2 flex justify-center">{button}</div>;
}
