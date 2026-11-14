"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useModelSetup } from "@/components/setup-cta";
import { SessionStarter } from "@/components/start-session";

const START_FAILURE = "Couldn’t open the session. Try again.";

/**
 * Opens a lesson in a course with an opening, through the one creation path
 * (SessionStarter) and the pre-send guard every start uses: a signed-out
 * Claude account opens sign-in, and nothing is created until it passes. The caller draws `SetupDialog` from `setupOpen`.
 * `topics` are the course topics it is started on, `from` the finished
 * lesson it picks up.
 */
export function useLessonStart() {
	const router = useRouter();
	const { unconnected } = useModelSetup();
	const starter = useRef(new SessionStarter());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [setupOpen, setSetupOpen] = useState(false);

	const start = (opening: string, workspace: string, { topics = [], from }: { topics?: readonly string[]; from?: string } = {}) => {
		if (busy) return;
		if (unconnected) return setSetupOpen(true);
		setBusy(true);
		setError(null);
		void starter.current
			.start({ title: opening, course: { workspace }, ...(topics.length > 0 ? { topics } : {}), ...(from ? { resume: { from } } : {}) }, fetch)
			.then((target) => router.push(target))
			.catch(() => {
				setBusy(false);
				setError(START_FAILURE);
			});
	};

	return { start, busy, error, setupOpen, closeSetup: () => setSetupOpen(false) };
}
