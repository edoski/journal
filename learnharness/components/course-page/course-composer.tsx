"use client";

import { useState, type ReactNode } from "react";
import { LessonComposer } from "@/components/lesson/lesson-composer";
import { lessonCreation, useStartDraft } from "@/components/start/use-lesson-start";
import { useStartScope } from "@/components/start/start-scope";
import { CourseControl, useCourseChoice, type CourseChoice } from "@/components/course-picker";
import { mathPlain } from "@/components/ui/math-text";
import { courseLabel } from "@/src/core";
import { keepWords, keptWords } from "@/components/lesson/kept-drafts";

/** Home's box: one draft, whatever course it starts in. */
export const HOME_BOX = "home";
/** The course Home's draft holds, kept beside it across a reload. */
const HOME_COURSE = "home:course";

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
 * every start on the page says it. Home draws it with a course control in
 * its toolbar (`control`, `box`; `HomeComposer`).
 */
export function CourseComposer({ course, topic, control, box, onType }: {
	course: { workspace: string; title: string };
	topic?: { handle: string; title: string };
	/** The toolbar's course control, where the page is no one course. */
	control?: ReactNode;
	/** The draft's scope, where it is not this course's or topic's. */
	box?: string;
	/** He typed into it. */
	onType?: () => void;
}) {
	const draft = useStartDraft(box ?? (topic ? `topic:${course.workspace}:${topic.handle}` : `course:${course.workspace}`));
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
				onChange={(text) => {
					draft.setText(text);
					onType?.();
				}}
				onSend={send}
				onStop={() => {}}
				canSend={draft.canSend}
				placeholder={courseComposerPlaceholder(course.title, topic?.title)}
				leading={control}
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

/**
 * Home's composer (spec: course-composer.md, Home): the course composer
 * with a course control in its toolbar. The control starts on the course
 * of the map's tab (`shown`) and follows the map until he types or picks a
 * course in it, so a row he points at while he writes never moves his
 * words to another course (Edo, 18 Nov 2026). The course is kept beside
 * the draft, so words back after a reload keep theirs.
 */
export function HomeComposer({ shown }: { shown: { workspace: string; title: string } }) {
	const choice = useCourseChoice({ remember: false });
	// Read as it mounts, before the box's own restore rewrites what it kept;
	// Home draws it only once the courses are read, so never on the server.
	const [held, setHeldState] = useState<string | null>(() => (keptWords(HOME_BOX)?.text?.trim() ? (keptWords(HOME_COURSE)?.text ?? null) : null));
	const setHeld = (course: string | null) => {
		setHeldState(course);
		keepWords(HOME_COURSE, course ? { text: course } : null);
	};
	const workspace = held ?? shown.workspace;
	const summary = choice.state.status === "ready" ? choice.state.courses.find((c) => c.workspace === workspace) : undefined;
	const title = summary ? courseLabel(summary) : workspace === shown.workspace ? shown.title : "";
	const control: CourseChoice = {
		...choice,
		workspace,
		choose: setHeld,
		add: (course) => {
			choice.add(course);
			setHeld(course.workspace);
		},
		removed: (target) => {
			choice.removed(target);
			if (held === target) setHeld(null);
		},
	};
	return (
		<CourseComposer
			course={{ workspace, title }}
			box={HOME_BOX}
			control={<CourseControl choice={control} />}
			onType={() => {
				if (!held) setHeld(workspace);
			}}
		/>
	);;
}
