"use client";

import { LessonComposer } from "@/components/lesson/lesson-composer";
import { lessonCreation, useStartDraft } from "@/components/start/use-lesson-start";
import { useStartScope } from "@/components/start/start-scope";
import { mathPlain } from "@/components/ui/math-text";

/** The field's words: New lesson's, in this course; on a topic page, on
 *  the topic, which is already chosen. */
export function courseComposerPlaceholder(course: string, topic?: string): string {
	return topic ? `Ask a question or paste a problem on ${mathPlain(topic)}` : `Name a topic, ask a question or paste a problem in ${mathPlain(course)}`;
}

/**
 * The lesson's composer at the foot of a course page, and of a topic page
 * with the topic chosen too (spec: course-composer.md): one quiet line
 * until he focuses it or it holds words or photos, then the full composer,
 * attach included. Its words and photos survive a reload, per course or
 * per topic, until the lesson opens. Sending opens a lesson in this course,
 * on the topic when there is one, through the page's one start
 * (`StartScope`), so the prober routes the opening to teaching or practice
 * as from New lesson, and a start that fails says so in the head, where
 * every start on the page says it.
 */
export function CourseComposer({ course, topic }: { course: { workspace: string; title: string }; topic?: { handle: string; title: string } }) {
	const draft = useStartDraft(topic ? `topic:${course.workspace}:${topic.handle}` : `course:${course.workspace}`);
	const lesson = useStartScope();
	const send = () => {
		if (draft.canSend) lesson.start(lessonCreation(draft.text.trim(), course.workspace, { topics: topic ? [topic.handle] : [] }), { draft });
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
				placeholder={courseComposerPlaceholder(course.title, topic?.title)}
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
