"use client";

import Link from "next/link";
import type { CourseMap, CourseMapTopic, TopicHandle } from "@/src/core";
import { useCourseVariant } from "@/components/design-variant";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { needOf, standingOf } from "@/components/course-map/topic-map/topic-standing";
import { Button } from "@/components/ui/button";
import { STUDY_WORDS } from "@/components/unit-inbox/start-unit";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { reviewWords } from "@/components/unit-inbox/units";
import { MathText } from "@/components/ui/math-text";

/** Where he stands on the topic in the map's words: the standing, then
 *  why it needs him, else when its review comes back. Pure. */
export function standingLine(topic: CourseMapTopic, titleOf: (handle: TopicHandle) => string): string {
	const need = needOf(topic, titleOf);
	const then = need?.words ?? (topic.review?.kind === "scheduled" ? reviewWords(topic.review) : null);
	return [standingOf(topic).words, then].filter(Boolean).join(". ");
}

/**
 * The topic page's header as the topic map's node opens it (spec:
 * unit-inbox.md): the course, the topic, the map's pie with the standing
 * in its words, the mistake the engine diagnosed, the open task that
 * holds the topic, and Study, which starts a lesson on it in one press
 * when no session waits to be resumed.
 */
export function TopicHeader({
	map,
	topic,
	onStudy,
	busy,
}: {
	map: CourseMap;
	topic: CourseMapTopic;
	/** Starts a lesson on the topic; absent while a session waits to be resumed. */
	onStudy?: () => void;
	busy: boolean;
}) {
	const titleOf = (handle: TopicHandle) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
	const tasks = map.tasks.filter((task) => topic.tasks.includes(task.key));
	// The course line links to the course's page while the Course switch has one.
	const coursePage = useCourseVariant() !== "current";
	return (
		<header data-slot="topic-header" className="flex flex-col gap-1 px-2">
			<p className="text-label text-muted-foreground">
				{!coursePage ? (
					map.title
				) : (
					<Link
						href={courseHref(map.workspace)}
						data-slot="topic-course-link"
						className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						<MathText>{map.title}</MathText>
					</Link>
				)}
			</p>
			<div className="flex min-h-8 items-center justify-between gap-4">
				<h1 className="text-xl font-semibold text-foreground">
					<MathText>{topic.title}</MathText>
				</h1>
				{onStudy && (
					<Button size="sm" className="shrink-0 text-row" disabled={busy} onClick={onStudy} data-testid="study-topic">
						{STUDY_WORDS}
					</Button>
				)}
			</div>
			<p data-slot="unit-standing" className="flex items-center gap-2 text-row text-muted-foreground">
				<TopicGlyph standing={standingOf(topic)} />
				{standingLine(topic, titleOf)}
			</p>
			{topic.signals.gap && (
				<p data-slot="unit-gap" className="text-row text-foreground/90">
					{topic.signals.gap}
				</p>
			)}
			{tasks.map((task) => (
				<p key={task.key} data-slot="unit-task" className="text-row text-muted-foreground">
					In <MathText>{task.title}</MathText>
					{task.step ? `, at ${task.step.charAt(0).toLowerCase()}${task.step.slice(1)}` : ""}
				</p>
			))}
		</header>
	);
}
