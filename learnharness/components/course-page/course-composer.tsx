"use client";

import type { StudyCourse } from "@/src/core";
import { LessonComposer } from "@/components/lesson/lesson-composer";
import { SetupDialog } from "@/components/setup-dialog";
import { useLessonStart, useStartDraft } from "@/components/start/use-lesson-start";
import { mathPlain } from "@/components/ui/math-text";

/** The field's words: New lesson's, in this course. */
export function courseComposerPlaceholder(title: string): string {
	return `Name a topic, ask a question or paste a problem in ${mathPlain(title)}`;
}

/**
 * The lesson's composer at the foot of a course page (spec:
 * course-composer.md): one quiet line until he focuses it or it holds
 * words or photos, then the full composer, attach included. Its words and
 * photos survive a reload, per course, until the lesson opens. Sending
 * opens a lesson in this course through the one start path
 * (`useLessonStart`), so the prober routes the opening to teaching or
 * practice as from New lesson.
 */
export function CourseComposer({ course }: { course: StudyCourse }) {
	const draft = useStartDraft(`course:${course.map.workspace}`);
	const lesson = useLessonStart();
	const send = () => {
		if (draft.canSend) lesson.start(draft.text.trim(), course.map.workspace, { draft });
	};
	return (
		<div data-slot="course-composer" className="mx-auto w-full max-w-[46rem] shrink-0 pt-4">
			<LessonComposer
				compact
				busy={lesson.busy}
				value={draft.text}
				onChange={draft.setText}
				onSend={send}
				onStop={() => {}}
				canSend={draft.canSend}
				placeholder={courseComposerPlaceholder(course.map.title)}
				photos={draft.photos}
			/>
			{(lesson.error || draft.photos.error) && (
				<p role="alert" className="mt-2 text-center text-body text-danger">
					{lesson.error ?? draft.photos.error}
				</p>
			)}
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</div>
	);
}
