"use client";

import * as React from "react";
import { CircleAlertIcon, ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArcLabel } from "@/components/course-map/arc-label";
import { ARC_STATE_WORDS } from "@/components/study-words";
import { GROUP_WORDS, type CourseTopic } from "@/components/course-page/course-model";
import { CHECK_WORDS, type CourseArc } from "@/components/course-page/course-arc";
import { cn } from "@/lib/utils";

/** The hairline the rows hang off, the map's arc list's track (`ArcIndex`): each row draws its own stretch,
 *  edge to edge with the next, so the track runs unbroken past open arcs and the exam. */
export const TRACK = "relative border-l border-white/10 pl-4";

/**
 * One arc on Road's list (spec: road.md), drawn as the map's arc list draws
 * its rows (`ArcIndex`), since Road's list is the course's arcs and the map
 * beside it lists none: its place in study order and its whole name
 * (`ArcLabel`), the dot of "You are here" on the arc he is in, and at its
 * end the one fact the road needs ("Needs you" when Today takes up one of
 * its topics, Check it on an arc ready for its check, "Check passed", or
 * the day its first topic starts while none is, `starts`); nothing
 * otherwise. The rows hang off one hairline track; a bar on it marks the
 * arc the map shows (`shown`). An arc past the exam (`past`) is muted.
 * Open, its topics hang under its name. Props otherwise as `CourseArc`'s,
 * so the list walks it the same way.
 */
export function RoadArc({
	section,
	items,
	renderItem,
	open,
	onOpenChange,
	onCheck,
	checking = false,
	headerRef,
	checkRef,
	onHeaderKeyDown,
	onCheckKeyDown,
	number,
	starts,
	shown = false,
	past = false,
	className,
	...rest
}: React.ComponentProps<typeof CourseArc<CourseTopic>> & { number: number; starts: string | null; shown?: boolean; past?: boolean }) {
	const headerId = React.useId();
	const { arc } = section;
	const checkable = Boolean(arc.state === "ready" && onCheck);
	const fact = section.needsYou ? null : arc.state === "checked" ? ARC_STATE_WORDS.checked : starts;
	return (
		<Collapsible asChild open={open} onOpenChange={onOpenChange}>
			<section
				data-slot="course-arc"
				data-arc={arc.handle}
				data-current={section.current || undefined}
				data-shown={shown || undefined}
				data-past={past || undefined}
				aria-labelledby={headerId}
				className={cn(TRACK, "flex flex-col", className)}
				{...rest}
			>
				{shown && <span aria-hidden="true" data-slot="road-bar" className="pointer-events-none absolute top-0 -left-px h-7 w-0.5 rounded-full bg-foreground" />}
				<h2 className="flex h-7 min-w-0 items-center gap-2">
					<CollapsibleTrigger asChild>
						<button
							ref={headerRef}
							type="button"
							id={headerId}
							data-slot="course-arc-header"
							onKeyDown={onHeaderKeyDown}
							className="group/arc flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<ArcLabel
								number={number}
								handle={arc.handle}
								title={arc.title}
								here={shown}
								className={cn("min-w-0 overflow-hidden transition-colors group-hover/arc:text-foreground motion-reduce:transition-none [&>span:last-child]:truncate", past && !shown && "opacity-60")}
							/>
							{section.current && <span aria-hidden="true" data-slot="road-here" className="size-1.5 shrink-0 rounded-full bg-ring" />}
							<span className="flex-1" />
							{section.needsYou ? (
								<span data-slot="course-arc-state" data-kind="needs-you" className="inline-flex shrink-0 items-center gap-1.5 text-callout text-warning">
									<CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
									{GROUP_WORDS["needs-you"]}
								</span>
							) : (
								!checkable &&
								fact && (
									<span data-slot="course-arc-state" className="shrink-0 text-callout text-muted-foreground">
										{fact}
									</span>
								)
							)}
						</button>
					</CollapsibleTrigger>
					{checkable && (
						<Button ref={checkRef} variant="quiet" size="xs" data-slot="course-arc-check" disabled={checking} onClick={onCheck} onKeyDown={onCheckKeyDown} className="h-6 shrink-0 text-link hover:text-link">
							<ListChecksIcon aria-hidden />
							{CHECK_WORDS}
						</Button>
					)}
				</h2>
				<CollapsibleContent className="flex flex-col">{items.length > 0 && <ul className="-ml-4 flex flex-col pt-1 pb-2">{items.map(renderItem)}</ul>}</CollapsibleContent>
			</section>
		</Collapsible>
	);
}
