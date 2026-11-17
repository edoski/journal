"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useModelSetup } from "@/components/setup-cta";
import { SessionStarter, type SessionCreation } from "@/components/start-session";
import { usePhotoDraft } from "@/components/photos";
import { keepPhotos, keepWords, keptWords } from "@/components/lesson/kept-drafts";
import { continueHref } from "@/components/nav/session-state";
import type { CourseMove } from "@/components/study-home/study-facts";

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

/** A lesson in `workspace` opened on `opening`, on `topics`, picking up
 *  the finished lesson `from`. Pure. */
export function lessonCreation(opening: string, workspace: string, { topics = [], from }: { topics?: readonly string[]; from?: string } = {}): SessionCreation {
	return { title: opening, course: { workspace }, ...(topics.length > 0 ? { topics } : {}), ...(from ? { resume: { from } } : {}) };
}

/**
 * The one way a press opens a new session (spec: lesson-start.md): through the one creation path (SessionStarter) and the pre-send
 * guard every start uses, so a signed-out Claude account opens sign-in and
 * nothing is created until it passes (the caller draws `SetupDialog` from
 * `setupOpen`), and a start that fails says so in `error`, never sending
 * him elsewhere. `starting` is the `key` of the start in flight; a press
 * while one is in flight does nothing. With a `draft`, its photos go with
 * the opening, and the box empties only once the lesson has opened: a
 * failed start or a sign-in keeps his words and photos. `error` belongs to
 * the page it happened on, so a surface that outlives the page (the
 * sidebar) drops it when he moves on. `take` takes up a course line's move
 * (`courseMove`), as Home's line, the course page's Now and the sidebar's
 * Today cards do.
 */
export function useLessonStart() {
	const router = useRouter();
	const pathname = usePathname();
	const { unconnected } = useModelSetup();
	const starter = useRef(new SessionStarter());
	const [starting, setStarting] = useState<string | null>(null);
	const [failed, setFailed] = useState<string | null | undefined>(undefined);
	const [setupOpen, setSetupOpen] = useState(false);

	const start = (creation: SessionCreation, { key = "lesson", draft }: { key?: string; draft?: StartDraft } = {}) => {
		if (starting) return;
		if (unconnected) return setSetupOpen(true);
		setStarting(key);
		setFailed(undefined);
		const photos = draft?.photos.photos.map((p) => p.photo) ?? [];
		void starter.current
			.start(creation, fetch)
			.then(async (target) => {
				// Photos go with the lesson's first message.
				if (photos.length) await keepPhotos(`${target.slice(target.lastIndexOf("/") + 1)}:opening`, photos);
				if (draft) {
					keepWords(draft.scope, null);
					draft.photos.take();
				}
				router.push(target);
			})
			.catch(() => setFailed(pathname))
			.finally(() => setStarting(null));
	};

	const take = (workspace: string, move: CourseMove) => {
		if (move.kind === "open") router.push(continueHref(move.chat));
		else start(lessonCreation(move.opening, workspace, { topics: move.topics, from: move.from }), { key: workspace });
	};

	return {
		start,
		take,
		starting,
		busy: starting !== null,
		error: failed !== undefined && failed === pathname ? START_FAILURE : null,
		setupOpen,
		openSetup: () => setSetupOpen(true),
		closeSetup: () => setSetupOpen(false),
	};
}

export type LessonStart = ReturnType<typeof useLessonStart>;
