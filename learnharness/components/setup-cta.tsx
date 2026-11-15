"use client";
/**
 * The sign-in surfaces: when the Claude account every agent runs on is not
 * signed in, chat / home / /chat/new hoist a composer pill ("Sign in to
 * Claude"). Click opens the SetupDialog, the sign-in screen. Live updates
 * ride the shared model status, which re-reads on the lh:settings-saved
 * "keys" and "claude" signals every connection change or account switch
 * dispatches.
 */

import { useEffect } from "react";
import { useModelStatus } from "@/components/model-status";
import { Button } from "@/components/ui/button";

/** Unknown status (loading, or a failed read) is not "signed out": the
 *  server's turn gate stays the truth, so only a known sign-out shows.
 *  A turn running while the status says signed out is proof it is stale
 *  (the gate let the turn through): `working` re-reads it, so the pill
 *  leaves with the turn (round 10, 4 minor 1). */
export function useModelSetup(working = false) {
	const { status, read, refresh } = useModelStatus();
	const unconnected = status ? !status.connected : false;
	useEffect(() => {
		if (unconnected && working) refresh();
	}, [unconnected, working, refresh]);
	return { status, read, refresh, unconnected };
}

/** The pill itself. testid "setup-cta-keys". */
export function SignInPill({ onOpen, inline = false }: { onOpen: () => void; inline?: boolean }) {
	const button = (
		<Button type="button" variant="outline" size="compact" data-testid="setup-cta-keys" onClick={onOpen} className="cursor-pointer font-ui text-subheadline system-current:text-xs font-normal system-current:font-normal">
			Sign in to Claude
		</Button>
	);
	return inline ? button : <div className="pointer-events-auto mb-2 flex justify-center">{button}</div>;
}
