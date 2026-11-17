"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useModelSetup } from "@/components/setup-cta";
import { SessionStarter } from "@/components/start-session";
import { keepPhotos } from "@/components/lesson/kept-drafts";
import type { Photo } from "@/src/core";

const START_FAILURE = "Couldn’t open the session. Try again.";

/**
 * Opens a lesson in a course with an opening, through the one creation path
 * (SessionStarter) and the pre-send guard every start uses: a signed-out
 * Claude account opens sign-in, and nothing is created until it passes. The caller draws `SetupDialog` from `setupOpen`.
 * `topics` are the course topics it is started on, `from` the finished
 * lesson it picks up, `photos` what goes with the opening.
 */
export function useLessonStart() {
	const router = useRouter();
	const { unconnected } = useModelSetup();
	const starter = useRef(new SessionStarter());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [setupOpen, setSetupOpen] = useState(false);

	const start = (opening: string, workspace: string, { topics = [], from, photos = [] }: { topics?: readonly string[]; from?: string; photos?: readonly Photo[] } = {}) => {
		if (busy) return;
		if (unconnected) return setSetupOpen(true);
		setBusy(true);
		setError(null);
		void starter.current
			.start({ title: opening, course: { workspace }, ...(topics.length > 0 ? { topics } : {}), ...(from ? { resume: { from } } : {}) }, fetch)
			.then(async (target) => {
				// Photos go with the lesson's first message, as from New lesson.
				if (photos.length) await keepPhotos(`${target.slice(target.lastIndexOf("/") + 1)}:opening`, photos);
				router.push(target);
			})
			.catch(() => {
				setBusy(false);
				setError(START_FAILURE);
			});
	};

	return { start, busy, error, setupOpen, closeSetup: () => setSetupOpen(false) };
}
