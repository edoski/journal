"use client";

import Link from "next/link";
import { BrailleSpinner } from "@/components/braille-spinner";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { Hint } from "@/components/ui/hint";
import { factIcon } from "@/components/unit-inbox/fact-icon";
import type { CourseTopic } from "@/components/course-page/course-model";
import type { TopicFact } from "@/components/unit-inbox/sidebar-says";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";
import { MathLine } from "@/components/ui/math-line";

/** A hairline above every row but the first, across the column. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/** The row's fact: its icon, then its words; a turn that waits wears the
 *  accent, as in the sidebar and on Today. Its words show whole or not at
 *  all, never cut mid-word: words that do not fit beside the icon wrap to
 *  a second line the 20px slot hides, so the icon stays flush right
 *  alone. The row shows `words` ("Due 6 Nov"); the hint always holds the
 *  whole sentence (`fact.words`, "Due since 6 Nov, back 20 Nov").
 *  `iconOnly` keeps the words for the hint and a screen reader. */
function Fact({ fact, words, iconOnly: compact }: { fact: TopicFact; words: string; iconOnly: boolean }) {
	const Icon = factIcon(fact);
	// A fact with no mark (how long ago) keeps its words even on a compact row.
	const iconOnly = compact && fact.kind !== "studied";
	return (
		<Hint label={fact.words} side="left">
			<span
				data-slot="course-topic-fact"
				data-kind={fact.kind}
				className={cn(
					"inline-flex h-5 max-w-56 min-w-0 flex-wrap items-center justify-end gap-x-1.5 overflow-hidden text-callout system-current:text-label",
					fact.kind === "your-turn" ? "system-current:font-medium text-link" : "text-muted-foreground",
				)}
			>
				{/* The icon's line is the slot's 20px, so words that wrap start below it, hidden. */}
				{Icon ? <Icon aria-hidden className="box-content size-3.5 shrink-0 py-[3px]" /> : fact.kind === "working" && <BrailleSpinner />}
				<span data-slot="course-topic-fact-words" className={iconOnly ? "sr-only" : "h-5 leading-5 whitespace-nowrap"}>
					{words}
				</span>
			</span>
		</Hint>
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
				{/* The title keeps its own width while it fits beside the pie, the gaps and the status's icon (4rem); the status gives way first (round 10, 1 m8: "Binomial distribut…" beside a whole "Fixed, check again later"). */}
				<span className={cn("flex min-w-0 flex-col gap-0.5", detail ? "flex-1" : "max-w-[calc(100%-4rem)] flex-auto shrink-0")}>
					<span data-slot="course-topic-title" className={cn("flex min-w-0 text-body system-current:text-row system-current:font-medium", started ? "text-foreground" : "text-muted-foreground")}>
						<MathLine className="min-w-0">{row.topic.title}</MathLine>
						<span className="sr-only">, {row.standing.words}</span>
					</span>
					{detail && (
						<span className="line-clamp-2 text-body system-current:text-row text-muted-foreground">
							<MathText>{detail}</MathText>
						</span>
					)}
				</span>
				{row.fact && <Fact fact={row.fact} words={row.factWords ?? row.fact.words} iconOnly={compact} />}
			</Link>
		</li>
	);
}
