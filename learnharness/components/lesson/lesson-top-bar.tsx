"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { MathText } from "@/components/ui/math-text";

/** A crumb takes the room its words need and gives way first when the bar
 *  is full (round 8: "Rank and the column s…" with half the bar free). */
const CRUMB = "min-w-0 shrink-[2] truncate text-control text-muted-foreground";
const CRUMB_LINK = `lh-no-drag ${CRUMB} rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none`;

/** The lesson's top bar contents (spec: lesson-top-bar.md), rendered inside
 *  the shared TopBar at its slim size: the course and, when it reads
 *  differently from the title, the topic, as links, then the title (the
 *  rename button or its input, owned by the session); on the right where
 *  the lesson is in its plan (lesson-roadmap.md) and Done for today. */
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
	const crumbs: { key: string; node: ReactNode }[] = [];
	if (course) {
		crumbs.push({
			key: "course",
			node:
				courseHref !== undefined ? (
					<Link href={courseHref} data-testid="course-label" className={CRUMB_LINK}>
						{course}
					</Link>
				) : (
					<span data-testid="course-label" className={CRUMB}>
						{course}
					</span>
				),
		});
	}
	if (topic) {
		crumbs.push({
			key: "topic",
			node: (
				<Link href={topic.href} data-testid="topic-label" className={CRUMB_LINK}>
					<MathText>{topic.title}</MathText>
				</Link>
			),
		});
	}
	const trail = title ? [...crumbs, { key: "title", node: title }] : crumbs;
	return (
		<>
			<div data-slot="lesson-trail" className="flex min-w-0 grow items-center gap-1.5">
				{trail.map((c, i) => (
					<Fragment key={c.key}>
						{i > 0 && <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />}
						{c.node}
					</Fragment>
				))}
			</div>
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
