"use client";

import * as React from "react";
import { ChevronRightIcon, CircleAlertIcon, ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { ARC_STATE_WORDS } from "@/components/study-words";
import { GROUP_WORDS, type CourseTopic } from "@/components/course-page/course-model";
import { CHECK_WORDS, type CourseArc } from "@/components/course-page/course-arc";
import { cn } from "@/lib/utils";

/** The road's track, a hairline down the markers' centre line: each
 *  marker draws the stretch above it to its row's top (`above`) and below
 *  it to the next row's top (`below`), and an open arc's topics carry it
 *  on beside them (`TRACK_BESIDE`). */
const LINE = "before:absolute before:left-[7.5px] before:w-px before:bg-white/15 before:content-[''] after:absolute after:left-[7.5px] after:w-px after:bg-white/15 after:content-['']";
const ABOVE = "before:-top-2 before:h-2";
const BELOW = "after:top-4 after:h-2.5";
export const TRACK_BESIDE = "relative before:absolute before:-top-0.5 before:-bottom-0.5 before:left-[7.5px] before:w-px before:bg-white/15 before:content-['']";

/** A marker on the track, the track running to it from above and on below it. */
export function Marker({ above, below, children }: { above: boolean; below: boolean; children: React.ReactNode }) {
	return <span className={cn("relative flex size-4 shrink-0 items-center justify-center", LINE, !above && "before:hidden", !below && "after:hidden", above && ABOVE, below && BELOW)}>{children}</span>;
}

/**
 * One arc on Road's list (spec: road.md): a 32px line on the track, the
 * arc's ring as its marker, its whole name and a chevron, and at its end
 * the one fact the road needs: "Needs you" when Today takes up one of its
 * topics, Check it on an arc ready for its check, "Check passed", or the
 * day its first topic starts while none is ("Starts 15 Nov", `starts`);
 * nothing otherwise. An arc past the exam (`past`) is muted. Open, its
 * topics hang under its name, the track running on beside them while the
 * road goes on (`below`; `above` while it comes from above). `before`
 * is what the road puts on the track above it: the exam's stop. Props
 * otherwise as `CourseArc`'s, so the list walks it the same way.
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
	starts,
	past = false,
	above,
	below,
	before,
	className,
	...rest
}: React.ComponentProps<typeof CourseArc<CourseTopic>> & { starts: string | null; past?: boolean; above: boolean; below: boolean; before?: React.ReactNode }) {
	const headerId = React.useId();
	const { arc } = section;
	const checkable = Boolean(arc.state === "ready" && onCheck);
	const fact = section.needsYou ? null : arc.state === "checked" ? ARC_STATE_WORDS.checked : starts;
	return (
		<>
			{before}
			<Collapsible asChild open={open} onOpenChange={onOpenChange}>
				<section
					data-slot="course-arc"
					data-arc={arc.handle}
					data-current={section.current || undefined}
					data-past={past || undefined}
					aria-labelledby={headerId}
					className={cn("flex flex-col", className)}
					{...rest}
				>
					<h2 className="-mx-3 flex h-8 w-[calc(100%+1.5rem)] min-w-0 items-center gap-1">
						<CollapsibleTrigger asChild>
							<Button
								ref={headerRef}
								variant="list"
								size="row"
								id={headerId}
								data-slot="course-arc-header"
								onKeyDown={onHeaderKeyDown}
								className={cn("h-8 min-w-0 flex-1 gap-3 px-3 text-body font-normal", past ? "text-muted-foreground" : "text-foreground")}
							>
								<Marker above={above} below={below || (open && items.length > 0)}>{section.share === null ? null : <Ring aria-hidden share={section.share} />}</Marker>
								<span data-slot="course-arc-title" className="min-w-0 truncate">
									<MathText>{arc.title}</MathText>
								</span>
								<ChevronRightIcon aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
								<span className="flex-1" />
								{section.needsYou ? (
									<span data-slot="course-arc-state" data-kind="needs-you" className="inline-flex h-5 shrink-0 items-center gap-1.5 text-callout text-warning">
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
							</Button>
						</CollapsibleTrigger>
						{checkable && (
							<Button ref={checkRef} variant="quiet" size="xs" data-slot="course-arc-check" disabled={checking} onClick={onCheck} onKeyDown={onCheckKeyDown} className="mr-1.5 h-6 text-link hover:text-link">
								<ListChecksIcon aria-hidden />
								{CHECK_WORDS}
							</Button>
						)}
					</h2>
					<CollapsibleContent className="flex flex-col">{items.length > 0 && <ul className={cn("flex flex-col pl-7", below && TRACK_BESIDE)}>{items.map(renderItem)}</ul>}</CollapsibleContent>
				</section>
			</Collapsible>
		</>
	);
}
