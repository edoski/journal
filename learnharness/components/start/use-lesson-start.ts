"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useModelSetup } from "@/components/setup-cta";
import { SessionStarter } from "@/components/start-session";
import { usePhotoDraft } from "@/components/photos";
import { keepPhotos, keepWords, keptWords } from "@/components/lesson/kept-drafts";

const START_FAILURE = "Couldn’t open the session. Try again.";

/** A box that starts a lesson (New lesson, a course page's composer): his
 *  words and photos, kept across a reload under `scope` (kept-drafts.ts)
 *  until the lesson they open has opened. A photo alone can be sent. */
export function useStartDraft(scope: string) {
	const [text, setText] = useState("");
	const photos = usePhotoDraft(undefined, scope);
	const restored = useRef(false);
	useEffect(() => {
		const kept = keptWords(scope)?.text;
		if (kept) setText(kept);
		restored.current = true;
	}, [scope]);
	useEffect(() => {
		if (restored.current) keepWords(scope, text ? { text } : null);
	}, [scope, text]);
	return { scope, text, setText, photos, canSend: text.trim().length > 0 || photos.photos.length > 0 };
}

export type StartDraft = ReturnType<typeof useStartDraft>;

/**
 * Opens a lesson in a course with an opening, through the one creation path
 * (SessionStarter) and the pre-send guard every start uses: a signed-out
 * Claude account opens sign-in, and nothing is created until it passes. The caller draws `SetupDialog` from `setupOpen`.
 * `topics` are the course topics it is started on, `from` the finished
 * lesson it picks up. With a `draft`, its photos go with the opening, and
 * the box empties only once the lesson has opened: a failed start or a
 * sign-in keeps his words and photos.
 */
export function useLessonStart() {
	const router = useRouter();
	const { unconnected } = useModelSetup();
	const starter = useRef(new SessionStarter());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [setupOpen, setSetupOpen] = useState(false);

	const start = (opening: string, workspace: string, { topics = [], from, draft }: { topics?: readonly string[]; from?: string; draft?: StartDraft } = {}) => {
		if (busy) return;
		if (unconnected) return setSetupOpen(true);
		setBusy(true);
		setError(null);
		const photos = draft?.photos.photos.map((p) => p.photo) ?? [];
		void starter.current
			.start({ title: opening, course: { workspace }, ...(topics.length > 0 ? { topics } : {}), ...(from ? { resume: { from } } : {}) }, fetch)
			.then(async (target) => {
				// Photos go with the lesson's first message.
				if (photos.length) await keepPhotos(`${target.slice(target.lastIndexOf("/") + 1)}:opening`, photos);
				if (draft) {
					keepWords(draft.scope, null);
					draft.photos.take();
				}
				router.push(target);
			})
			.catch(() => {
				setBusy(false);
				setError(START_FAILURE);
			});
	};

	return { start, busy, error, setupOpen, openSetup: () => setSetupOpen(true), closeSetup: () => setSetupOpen(false) };
}
