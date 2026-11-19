"use client";

import Link from "next/link";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { Hint } from "@/components/ui/hint";
import { StatusMark } from "@/components/unit-inbox/status-mark";
import type { CourseTopic } from "@/components/course-page/course-model";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/** A hairline above every row but the first, across the column. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/**
 * One topic of a course page (spec: course-topic-row.md): the map's pie,
 * the title, and one fact flush right, so the facts line up down the list;
 * a hairline between rows, no surface at rest, the hover fill reaching
 * 12px past the column. A click opens the topic's page. `compact` is the
 * 32px row;
 * `detail` adds a second, muted line of up to two lines under the title;
 * `highlighted` holds the hover fill, for a page that ties the row to
 * something else he points at. Other props go to the link.
 */
export function CourseTopicRow({
	row,
	compact = false,
	detail,
	highlighted = false,
	className,
	...link
}: Omit<React.ComponentProps<typeof Link>, "href" | "children"> & {
	row: CourseTopic;
	compact?: boolean;
	detail?: string | null;
	highlighted?: boolean;
}) {
	const started = row.topic.level !== "new";
	return (
		<li data-slot="course-topic" className={cn("list-none", HAIRLINE)}>
			<Link
				href={row.href}
				onClick={blurAfterPointerClick}
				data-slot="course-topic-row"
				data-group={row.group}
				data-topic={row.topic.handle}
				data-highlighted={highlighted || undefined}
				aria-current={row.current ? "location" : undefined}
				className={cn(
					"-mx-3 flex w-[calc(100%+1.5rem)] min-w-0 items-center gap-4 rounded-md px-3 outline-none transition-colors duration-150 hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
					detail ? "items-start py-2" : compact ? "min-h-8 py-1" : "min-h-9 py-1.5",
					highlighted && "bg-fill-hover",
					className,
				)}
				{...link}
			>
				<TopicGlyph standing={row.standing} className={detail ? "mt-px" : undefined} />
				{/* The title wraps before the status, whose words show whole (round 11, 1 N8), and is never cut (round 15, 1 m8). */}
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span data-slot="course-topic-title" className={cn("min-w-0 text-body text-pretty", started ? "text-foreground" : "text-muted-foreground")}>
						<MathText>{row.topic.title}</MathText>
						<span className="sr-only">, {row.standing.words}</span>
					</span>
					{detail && (
						<span className="line-clamp-2 text-body text-muted-foreground">
							<MathText>{detail}</MathText>
						</span>
					)}
				</span>
				{/* Its fact's words whole on every row (round 11, 1 N8: a bare arrow, bookmark or check-circle beside rows with words);
				    the row says its shortest words ("Due 6 Nov"), the hint the whole sentence. */}
				{row.fact && (
					<Hint label={row.fact.words} side="left">
						<StatusMark data-slot="course-topic-fact" fact={row.fact} words={row.factWords ?? row.fact.words} whole className="h-5 shrink-0" />
					</Hint>
				)}
			</Link>
		</li>
	);
}
