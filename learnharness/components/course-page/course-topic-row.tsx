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

/** The row's fact: its icon, then its words, whole on every row (round
 *  11, 1 N8: a bare arrow, bookmark or check-circle beside rows with
 *  words); a turn that waits wears the accent, as in the sidebar and on
 *  Today. The row shows `words` ("Due 6 Nov"); the hint always holds the
 *  whole sentence (`fact.words`, "Due since 6 Nov, back 20 Nov"). */
function Fact({ fact, words }: { fact: TopicFact; words: string }) {
	const Icon = factIcon(fact);
	return (
		<Hint label={fact.words} side="left">
			<span
				data-slot="course-topic-fact"
				data-kind={fact.kind}
				className={cn("inline-flex h-5 shrink-0 items-center gap-x-1.5 text-callout", fact.kind === "your-turn" ? "text-link" : "text-muted-foreground")}
			>
				{Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : fact.kind === "working" && <BrailleSpinner />}
				<span data-slot="course-topic-fact-words" className="whitespace-nowrap">
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
					detail ? "items-start py-2" : compact ? "h-8" : "h-9",
					highlighted && "bg-fill-hover",
					className,
				)}
				{...link}
			>
				<TopicGlyph standing={row.standing} className={detail ? "mt-px" : undefined} />
				{/* The title gives way before the status, whose words show whole (round 11, 1 N8). */}
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span data-slot="course-topic-title" className={cn("flex min-w-0 text-body", started ? "text-foreground" : "text-muted-foreground")}>
						<MathLine className="min-w-0">{row.topic.title}</MathLine>
						<span className="sr-only">, {row.standing.words}</span>
					</span>
					{detail && (
						<span className="line-clamp-2 text-body text-muted-foreground">
							<MathText>{detail}</MathText>
						</span>
					)}
				</span>
				{row.fact && <Fact fact={row.fact} words={row.factWords ?? row.fact.words} />}
			</Link>
		</li>
	);
}
