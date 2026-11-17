"use client";

import type { ReactNode } from "react";
import { Crumbs, type Crumb } from "@/components/nav/crumbs";

/** The lesson's top bar contents (spec: lesson-top-bar.md), rendered inside
 *  the shared TopBar at its slim size: the app's one trail (`Crumbs`), the
 *  course and, when it reads differently from the title, the topic, as
 *  links, then the title (the rename button or its input, owned by the
 *  session); on the right where the lesson is in its plan
 *  (lesson-roadmap.md), which names its arc, and Done for today. */
export function LessonTopBar({
	title,
	course,
	courseHref,
	topic,
	roadmap,
	tonight,
}: {
	/** The rename button or its input; null when the topic crumb already
	 *  reads as the title, which then ends the trail as a link. */
	title: ReactNode;
	course?: string;
	/** The course's page, which the crumb links to. */
	courseHref?: string;
	/** The lesson's topic and its page, shown when its name is not the title's. */
	topic?: { title: string; href: string };
	/** Where the lesson is in its plan (LessonRoadmap). */
	roadmap?: ReactNode;
	/** Done for today (done-tonight.tsx): stop now, whatever is open. */
	tonight?: ReactNode;
}) {
	const crumbs: Crumb[] = [];
	if (course) crumbs.push({ kind: "course", title: course, href: courseHref });
	if (topic) crumbs.push({ kind: "topic", title: topic.title, href: topic.href });
	return (
		<>
			<Crumbs crumbs={crumbs} end={title} className="grow" />
			{roadmap}
			{tonight}
		</>
	);
}

/** Whether the title reads differently from the topic crumb. When it reads
 *  the same, the topic crumb ends the trail, a link to the topic's page,
 *  and the title is not drawn a second time (round 8: a lesson named after
 *  its topic ended on plain text, with no way to its topic's page); F2
 *  still renames it. */
export function topicCrumbShown(topicTitle: string, title: string): boolean {
	const norm = (s: string) => s.trim().toLowerCase();
	return norm(topicTitle) !== norm(title);
}
