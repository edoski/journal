"use client";

import Link from "next/link";
import { BrailleSpinner } from "@/components/braille-spinner";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { WHY_ICON } from "@/components/study-home/agenda-rows/why-mark";
import { Hint } from "@/components/ui/hint";
import { rowSurface } from "@/components/unit-inbox/row-card";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { companionSays, type Companion, type TopicWords } from "@/components/unit-inbox/topics/topics-top";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/** A companion's reason as one 12px mark: the reason's icon (WhyMark's,
 *  accent for a waiting turn), or the spinner while the tutor writes. */
function CompanionMark({ words }: { words: TopicWords }) {
	if (words.kind === "working") return <BrailleSpinner />;
	const Icon = WHY_ICON[words.kind];
	return <Icon aria-hidden data-kind={words.kind} className={cn("size-3", words.kind === "reply" ? "text-link" : "text-muted-foreground")} />;
}

/**
 * A topic a course line takes up beside its lead, under the lead's card
 * (spec: ../inbox-topics.md): one quiet 36px line with no course mark (the
 * card above names the course) and no action (the card's is the one way
 * in), its title indented to the card's course name and its reason as one
 * icon at the end, the words in a tooltip and for a screen reader. A
 * click opens the topic's page; Left goes back to the card.
 */
export function CompanionRow({ companion, active }: { companion: Companion; active: boolean }) {
	const { unit, words, parent } = companion;
	const says = companionSays(words);
	return (
		<li data-slot="companion" className="group/sidebar-row relative list-none">
			<Hint label={says} side="right">
				<Link
					href={unitHref(unit.course.workspace, unit.topic.handle)}
					onClick={blurAfterPointerClick}
					aria-current={active ? "page" : undefined}
					data-sidebar-row={unit.key}
					data-sidebar-parent={parent}
					data-testid="unit-row"
					className={cn(rowSurface(active), "flex h-9 items-center gap-2 pr-2.5 pl-[2.125rem]")}
				>
					<span
						data-slot="companion-title"
						className={cn("min-w-0 flex-1 truncate text-control", active ? "text-foreground" : "text-muted-foreground group-hover/sidebar-row:text-foreground")}
					>
						<MathText>{unit.topic.title}</MathText>
					</span>
					<span data-slot="companion-why" className="flex h-6 shrink-0 items-center text-label text-muted-foreground">
						<CompanionMark words={words} />
						<span className="sr-only">, {says}</span>
					</span>
				</Link>
			</Hint>
		</li>
	);
}
