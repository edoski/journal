"use client";

import type { CourseMap, CourseMapTopic, TopicHandle } from "@/src/core";
import { contrastsOf } from "./course-map-layout";
import { Button } from "@/components/ui/button";
import { CURRENT_TAG, reviewText, signalLines, titlesText, topicCaption } from "./topic-words";

/** What one topic holds, opened from its node or list row (spec:
 *  course-map.md): the engine's level and states in words, the review, why
 *  it is weak, its edges, the open task that holds it, and Study this. */
export function TopicDetail({
	map,
	topic,
	titleOf,
	onStudy,
	busy,
}: {
	map: CourseMap;
	topic: CourseMapTopic;
	titleOf: (handle: TopicHandle) => string;
	onStudy: (topic: CourseMapTopic) => void;
	busy: boolean;
}) {
	const needs = map.edges.flatMap((e) => (e.kind === "needs" && e.topic === topic.handle ? [e.prerequisite] : []));
	const contrasts = contrastsOf(topic.handle, map.edges);
	const review = reviewText(topic.review);
	const signals = signalLines(topic, titleOf);
	const tasks = map.tasks.filter((t) => topic.tasks.includes(t.key));
	return (
		<div data-slot="topic-detail" className="flex flex-col gap-3">
			<div className="flex flex-col gap-0.5">
				<p className="text-row font-semibold text-foreground">{topic.title}</p>
				<p className="text-label text-muted-foreground">
					{map.current === topic.handle ? `${CURRENT_TAG} · ` : ""}
					{topicCaption(topic)}
				</p>
			</div>
			{(review || signals.length > 0) && (
				<ul className="flex flex-col gap-1 text-row text-foreground">
					{review && <li>{review}</li>}
					{signals.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			)}
			{(needs.length > 0 || contrasts.length > 0) && (
				<dl className="flex flex-col gap-1 text-label">
					{needs.length > 0 && (
						<div className="flex gap-1">
							<dt className="shrink-0 text-muted-foreground">Needs</dt>
							<dd className="text-foreground">{titlesText(needs, titleOf)}</dd>
						</div>
					)}
					{contrasts.length > 0 && (
						<div className="flex gap-1">
							<dt className="shrink-0 text-muted-foreground">Contrasts with</dt>
							<dd className="text-foreground">{titlesText(contrasts, titleOf)}</dd>
						</div>
					)}
				</dl>
			)}
			{tasks.map((task) => (
				<div key={task.key} className="flex flex-col gap-0.5 text-label">
					<p className="text-foreground">{task.title}</p>
					{task.step && <p className="text-muted-foreground">{task.step}</p>}
				</div>
			))}
			<Button size="sm" className="self-start text-row" disabled={busy} onClick={() => onStudy(topic)} data-testid="study-topic">
				Study this
			</Button>
		</div>
	);
}
