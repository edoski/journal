"use client";

import Link from "next/link";
import { CalendarClockIcon, BookmarkIcon, CircleXIcon, HistoryIcon, MapPinIcon, MessageCircleQuestionIcon, type LucideIcon } from "lucide-react";
import { BrailleSpinner } from "@/components/braille-spinner";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { Hint } from "@/components/ui/hint";
import type { CourseTopic, TopicFact } from "@/components/course-page/course-model";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/** The icon each kind of fact leads with: the sidebar's for a turn that
 *  waits and a topic coming back, the map's for a slip and a review,
 *  Today's for an open task. */
const FACT_ICON: Record<Exclude<TopicFact["kind"], "working">, LucideIcon> = {
	"your-turn": MessageCircleQuestionIcon,
	slip: CircleXIcon,
	review: HistoryIcon,
	here: MapPinIcon,
	task: BookmarkIcon,
	back: CalendarClockIcon,
};

/** A hairline above every row but the first, across the column. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/** The row's fact: its icon, then its words; a turn that waits wears the
 *  accent, as in the sidebar and on Today. `iconOnly` keeps the words for
 *  the hint and a screen reader. */
function Fact({ fact, iconOnly }: { fact: TopicFact; iconOnly: boolean }) {
	const Icon = fact.kind === "working" ? null : FACT_ICON[fact.kind];
	const mark = (
		<span
			data-slot="course-topic-fact"
			data-kind={fact.kind}
			className={cn(
				"inline-flex h-5 max-w-56 shrink-0 items-center gap-1.5 text-label",
				fact.kind === "your-turn" ? "font-medium text-link" : "text-muted-foreground",
			)}
		>
			{Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : <BrailleSpinner />}
			<span className={iconOnly ? "sr-only" : "truncate"}>{fact.words}</span>
		</span>
	);
	return iconOnly ? (
		<Hint label={fact.words} side="left">
			{mark}
		</Hint>
	) : (
		mark
	);
}

/**
 * One topic of a course page (spec: course-topic-row.md): the map's pie,
 * the title, and one fact flush right, so the facts line up down the list;
 * a hairline between rows, no surface at rest, the hover fill reaching
 * 12px past the column. A click opens the topic's page. `compact` is the
 * 32px row whose fact shows as its icon alone (the words in a hint);
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
					detail ? "items-start py-2" : compact ? "h-8" : "h-9",
					highlighted && "bg-fill-hover",
					className,
				)}
				{...link}
			>
				<TopicGlyph standing={row.standing} className={detail ? "mt-px" : undefined} />
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span data-slot="course-topic-title" className={cn("truncate text-row font-medium", started ? "text-foreground" : "text-muted-foreground")}>
						<MathText>{row.topic.title}</MathText>
						<span className="sr-only">, {row.standing.words}</span>
					</span>
					{detail && (
						<span className="line-clamp-2 text-row text-muted-foreground">
							<MathText>{detail}</MathText>
						</span>
					)}
				</span>
				{row.fact && <Fact fact={row.fact} iconOnly={compact} />}
			</Link>
		</li>
	);
}
