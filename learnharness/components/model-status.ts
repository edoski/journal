"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModelStatus } from "@/src/core";
import { onSettingsSaved } from "@/components/settings-signal";

// Shared stale-while-revalidate status of GET /api/models: the Claude
// account every agent runs on, whether it is signed in, and the model's
// context window. A sign-in change or an account switch re-reads it.
let statusCache: ModelStatus | undefined;
let statusError = false;
let statusInflight: Promise<void> | undefined;
let statusGeneration = 0;
let stopStatusSignals: (() => void) | undefined;
const statusReaders = new Set<() => void>();
const publishStatus = () => { for (const reader of statusReaders) reader(); };

function fetchStatus(revalidate = false): void {
	if (revalidate) { statusGeneration++; statusInflight = undefined; }
	if (statusInflight) return;
	const generation = statusGeneration;
	statusError = false;
	publishStatus();
	statusInflight = fetch("/api/models")
		.then((r) => { if (!r.ok) throw new Error(`model status request failed: ${r.status}`); return r.json() as Promise<ModelStatus>; })
		.then((s) => {
			if (generation === statusGeneration) { statusCache = s; statusError = false; publishStatus(); }
		})
		.catch(() => {
			if (generation === statusGeneration) { statusError = true; publishStatus(); }
		})
		.finally(() => { if (generation === statusGeneration) statusInflight = undefined; });
}

export function useModelStatus(): { status: ModelStatus | undefined; failed: boolean; refresh: () => void } {
	const [snapshot, setSnapshot] = useState(() => ({ status: statusCache, failed: statusError }));
	useEffect(() => {
		const first = statusReaders.size === 0;
		const read = () => setSnapshot({ status: statusCache, failed: statusError });
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
	const refresh = useCallback(() => fetchStatus(true), []);
	return { ...snapshot, refresh };
}
