"use client";

import { useState } from "react";
import type { StudyCourse } from "@/src/core";
import { Composer } from "@/components/composer";
import { SetupDialog } from "@/components/setup-dialog";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { mathPlain } from "@/components/ui/math-text";

/** The field's words: New lesson's, in this course. */
export function courseComposerPlaceholder(title: string): string {
	return `Name a topic, ask a question or paste a problem in ${mathPlain(title)}`;
}

/**
 * New lesson's composer on a course page (spec: course-composer.md): the
 * same field, its course already chosen, so a lesson in this course starts
 * where he is looking at it. It opens the lesson through the one start
 * path (`useLessonStart`), so the prober reads the opening and routes it to
 * teaching or practice exactly as New lesson does.
 */
export function CourseComposer({ course }: { course: StudyCourse }) {
	const [text, setText] = useState("");
	const lesson = useLessonStart();
	const send = () => {
		const opening = text.trim();
		if (opening) lesson.start(opening, course.map.workspace);
	};
	return (
		<div data-slot="course-composer" className="mx-auto w-full max-w-[46rem] shrink-0 pt-4">
			<Composer busy={lesson.busy} value={text} onChange={setText} onSend={send} onStop={() => {}} canSend={text.trim().length > 0} placeholder={courseComposerPlaceholder(course.map.title)} />
			{lesson.error && (
				<p role="alert" className="mt-2 text-center text-body text-danger">
					{lesson.error}
				</p>
			)}
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</div>
	);
}
