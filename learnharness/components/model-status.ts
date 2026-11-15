"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModelStatus } from "@/src/core";
import { onSettingsSaved } from "@/components/settings-signal";

// Shared stale-while-revalidate status of GET /api/models: the Claude
// account every agent runs on, whether it is signed in, and the model's
// context window. A sign-in change or an account switch re-reads it.
// `reads` counts the readings that landed, so a reader can tell a reading
// taken after its own moment (a refusal, the dialog opening) from an
// older one (round 10, 4 minor 1: a stale "connected" kept Sign in dead).
let statusCache: ModelStatus | undefined;
let statusError = false;
let statusReads = 0;
let statusInflight: Promise<void> | undefined;
let statusGeneration = 0;
let stopStatusSignals: (() => void) | undefined;
const statusReaders = new Set<() => void>();
const publishStatus = () => { for (const reader of statusReaders) reader(); };

/** `force` asks the server to check the sign-in again now. */
function fetchStatus(revalidate = false, force = false): void {
	if (revalidate || force) { statusGeneration++; statusInflight = undefined; }
	if (statusInflight) return;
	const generation = statusGeneration;
	statusError = false;
	publishStatus();
	statusInflight = fetch(force ? "/api/models?refresh=1" : "/api/models")
		.then((r) => { if (!r.ok) throw new Error(`model status request failed: ${r.status}`); return r.json() as Promise<ModelStatus>; })
		.then((s) => {
			if (generation === statusGeneration) { statusCache = s; statusError = false; statusReads++; publishStatus(); }
		})
		.catch(() => {
			if (generation === statusGeneration) { statusError = true; publishStatus(); }
		})
		.finally(() => { if (generation === statusGeneration) statusInflight = undefined; });
}

/** Reads the status again; `force` re-checks the sign-in on the server. */
export function refreshModelStatus(force = false): void {
	fetchStatus(true, force);
}

export function useModelStatus(): { status: ModelStatus | undefined; failed: boolean; read: number; refresh: (force?: boolean) => void } {
	const [snapshot, setSnapshot] = useState(() => ({ status: statusCache, failed: statusError, read: statusReads }));
	useEffect(() => {
		const first = statusReaders.size === 0;
		const read = () => setSnapshot({ status: statusCache, failed: statusError, read: statusReads });
		statusReaders.add(read);
		if (first) {
			stopStatusSignals = onSettingsSaved((section) => {
				if (section === "keys" || section === "claude") fetchStatus(true);
			});
			fetchStatus(true);
		} else fetchStatus();
		read();
		return () => { statusReaders.delete(read); if (!statusReaders.size) { stopStatusSignals?.(); stopStatusSignals = undefined; } };
	}, []);
	const refresh = useCallback((force = false) => fetchStatus(true, force), []);
	return { ...snapshot, refresh };
}
