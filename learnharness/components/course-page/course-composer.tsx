"use client";

import { useEffect, useRef, useState } from "react";
import type { StudyCourse } from "@/src/core";
import { LessonComposer } from "@/components/lesson/lesson-composer";
import { usePhotoDraft } from "@/components/photos";
import { keepWords, keptWords } from "@/components/lesson/kept-drafts";
import { SetupDialog } from "@/components/setup-dialog";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { mathPlain } from "@/components/ui/math-text";

/** The field's words: New lesson's, in this course. */
export function courseComposerPlaceholder(title: string): string {
	return `Name a topic, ask a question or paste a problem in ${mathPlain(title)}`;
}

/**
 * The lesson's composer at the foot of a course page (spec:
 * course-composer.md): one quiet line until he focuses it or it holds
 * words or photos, then the full composer, attach included. Its words and
 * photos survive a reload, per course. Sending opens a lesson in this
 * course through the one start path (`useLessonStart`), so the prober
 * routes the opening to teaching or practice as from New lesson.
 */
export function CourseComposer({ course }: { course: StudyCourse }) {
	const scope = `course:${course.map.workspace}`;
	const [text, setText] = useState("");
	const photos = usePhotoDraft(undefined, scope);
	const lesson = useLessonStart();
	const restored = useRef(false);
	useEffect(() => {
		const kept = keptWords(scope)?.text;
		if (kept) setText(kept);
		restored.current = true;
	}, [scope]);
	useEffect(() => {
		if (restored.current) keepWords(scope, text ? { text } : null);
	}, [scope, text]);
	const canSend = text.trim().length > 0 || photos.photos.length > 0;
	const send = () => {
		if (!canSend) return;
		const sent = photos.photos.map((p) => p.photo);
		keepWords(scope, null);
		photos.take();
		lesson.start(text.trim(), course.map.workspace, { photos: sent });
	};
	return (
		<div data-slot="course-composer" className="mx-auto w-full max-w-[46rem] shrink-0 pt-4">
			<LessonComposer
				compact
				busy={lesson.busy}
				value={text}
				onChange={setText}
				onSend={send}
				onStop={() => {}}
				canSend={canSend}
				placeholder={courseComposerPlaceholder(course.map.title)}
				photos={photos}
			/>
			{(lesson.error || photos.error) && (
				<p role="alert" className="mt-2 text-center text-body text-danger">
					{lesson.error ?? photos.error}
				</p>
			)}
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</div>
	);
}
