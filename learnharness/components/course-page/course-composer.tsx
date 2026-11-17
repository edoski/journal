"use client";

import type { StudyCourse } from "@/src/core";
import { LessonComposer } from "@/components/lesson/lesson-composer";
import { lessonCreation, useStartDraft } from "@/components/start/use-lesson-start";
import { useStartScope } from "@/components/start/start-scope";
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
 * opens a lesson in this course through the page's one start
 * (`StartScope`), so the prober routes the opening to teaching or
 * practice as from New lesson, and a start that fails says so in the
 * head, where every start on the page says it.
 */
export function CourseComposer({ course }: { course: StudyCourse }) {
	const draft = useStartDraft(`course:${course.map.workspace}`);
	const lesson = useStartScope();
	const send = () => {
		if (draft.canSend) lesson.start(lessonCreation(draft.text.trim(), course.map.workspace), { draft });
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
			{draft.photos.error && (
				<p role="alert" className="mt-2 text-center text-body text-danger">
					{draft.photos.error}
				</p>
			)}
		</div>
	);
}
