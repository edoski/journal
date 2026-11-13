"use client";
/**
 * The setup surfaces: when no subscription is signed in, chat / home /
 * /chat/new hoist a composer pill ("Sign in to Claude or ChatGPT") that
 * takes precedence over the models setup CTA (the model pickers list only
 * what a signed-in subscription unlocks). Click opens the SetupDialog,
 * whose stage derives to the sign-in screen on its own. Live updates ride
 * the shared model catalog, which re-reads on the lh:settings-saved
 * "keys" signal every connection change dispatches.
 */

import { useEffect, useState } from "react";
import { MODEL_SLOTS } from "@/src/core";
import { useModelCatalog } from "@/components/model-catalog";
import type { ModelCatalogResponse } from "@/src/core";

/** Completeness is saved identity, not current provider availability. */
export function savedSlotsConfigured(slots: ModelCatalogResponse["slots"] | undefined): boolean {
	return MODEL_SLOTS.every((slot) => !!slots?.[slot]?.model);
}

/** Keep the last known completeness during connection invalidation, but
 * follow ordinary slot repairs as soon as their shared snapshot arrives. */
export function useModelSetup(initialConfigured: boolean) {
	const { catalog } = useModelCatalog();
	const [lastConfigured, setLastConfigured] = useState(initialConfigured);
	const configured = catalog ? savedSlotsConfigured(catalog.slots) : lastConfigured;
	useEffect(() => { if (catalog) setLastConfigured(savedSlotsConfigured(catalog.slots)); }, [catalog]);
	return { catalog, configured, unconnected: catalog ? !catalog.providers.some((p) => p.connected) : false };
}

/** A known unavailable route needs an explicit replacement, never an
 * automatic provider/model substitution. Unknown metadata defers to the
 * server's admission gate instead of declaring a route disconnected. */
export function selectedModelUnavailable(catalog: ModelCatalogResponse | undefined, selected: string | undefined): boolean {
	return !!catalog && !!selected && !catalog.models.some((m) => `${m.provider}:${m.id}` === selected);
}

/** Reuse the ordinary control (also opened by the existing keyboard action). */
export function openModelPicker(): void {
	window.dispatchEvent(new CustomEvent("lh:kbd-open-model-picker"));
}

/** The pill itself — the models CTA's chrome and placement. testid
 *  "setup-cta-keys" (the models CTA keeps "setup-cta"; probes can tell
 *  them apart). */
export function SignInPill({ onOpen, inline = false }: { onOpen: () => void; inline?: boolean }) {
	const button = (
		<button
			type="button"
			data-testid="setup-cta-keys"
			onClick={onOpen}
			className="rounded-sm border border-border bg-card px-3 py-1.5 font-ui text-xs text-foreground transition-colors hover:border-muted-foreground/50 hover:bg-accent cursor-pointer"
		>
			Sign in to Claude or ChatGPT
		</button>
	);
	return inline ? button : <div className="pointer-events-auto mb-2 flex justify-center">{button}</div>;
}
