"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { openModelPicker, selectedModelUnavailable, useModelSetup } from "@/components/setup-cta";
import { SessionStarter } from "@/components/start-session";

const START_FAILURE = "Couldn’t open the session. Try again.";

/**
 * Opens a lesson in a course with an opening, through the one creation path
 * (SessionStarter) and the pre-send guards every start uses: missing models
 * or keys open setup, an unavailable model opens its picker, and nothing is
 * created until they pass. The caller draws `SetupDialog` from `setupOpen`.
 */
export function useLessonStart(initialConfigured: boolean) {
	const router = useRouter();
	const { catalog, configured, zeroKeys } = useModelSetup(initialConfigured);
	const starter = useRef(new SessionStarter());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [setupOpen, setSetupOpen] = useState(false);

	const start = (opening: string, workspace: string) => {
		if (busy) return;
		if (!configured || zeroKeys) return setSetupOpen(true);
		const strong = catalog?.slots.strong?.model;
		if (selectedModelUnavailable(catalog, strong ? `${strong.provider}:${strong.id}` : undefined)) return openModelPicker();
		setBusy(true);
		setError(null);
		void starter.current
			.start({ title: opening, course: { workspace } }, fetch, JSON.stringify(catalog?.slots.strong))
			.then((target) => router.push(target))
			.catch(() => {
				setBusy(false);
				setError(START_FAILURE);
			});
	};

	return { start, busy, error, setupOpen, closeSetup: () => setSetupOpen(false) };
}
