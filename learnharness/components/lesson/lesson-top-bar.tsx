"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { MathText } from "@/components/ui/math-text";

const CRUMB = "min-w-0 max-w-40 shrink-[2] truncate text-control text-muted-foreground";
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
	return (
		<>
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				{crumbs.map((c) => (
					<Fragment key={c.key}>
						{c.node}
						<ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
					</Fragment>
				))}
				{title}
			</div>
			{roadmap}
			{tonight}
		</>
	);
}

/** The topic crumb shows only when its words differ from the title's:
 *  a lesson named after its topic would say the same thing twice. */
export function topicCrumbShown(topicTitle: string, title: string): boolean {
	const norm = (s: string) => s.trim().toLowerCase();
	return norm(topicTitle) !== norm(title);
}
