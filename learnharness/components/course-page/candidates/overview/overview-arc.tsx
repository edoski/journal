"use client";

import * as React from "react";
import { ChevronRightIcon, CircleAlertIcon, ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { GROUP_WORDS, type CourseTopic } from "@/components/course-page/course-model";
import { CHECK_WORDS, type CourseArc } from "@/components/course-page/course-arc";
import { cn } from "@/lib/utils";

/**
 * One arc of Overview's list (spec: overview.md): a 32px line, a shadcn
 * Collapsible's trigger, with the arc's ring, its whole name and a chevron
 * that turns when it opens. Its end says something only when he has
 * something to do there: "Needs you" in the slip's ink when Today takes up
 * one of its topics, Check it on an arc ready for its check, or what the
 * exam leaves out of it; every other line ends in nothing, its ring saying
 * where it stands. Open, its topics hang under its name. Props as
 * `CourseArc`'s, so the list walks it the same way.
 */
export function OverviewArc({
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
	className,
	...rest
}: React.ComponentProps<typeof CourseArc<CourseTopic>>) {
	const headerId = React.useId();
	const { arc } = section;
	const checkable = Boolean(arc.state === "ready" && onCheck);
	return (
		<Collapsible asChild open={open} onOpenChange={onOpenChange}>
			<section data-slot="course-arc" data-arc={arc.handle} data-current={section.current || undefined} aria-labelledby={headerId} className={cn("flex flex-col", className)} {...rest}>
				<h2 className="-mx-3 flex h-8 w-[calc(100%+1.5rem)] min-w-0 items-center gap-1">
					<CollapsibleTrigger asChild>
						<Button
							ref={headerRef}
							variant="list"
							size="row"
							id={headerId}
							data-slot="course-arc-header"
							onKeyDown={onHeaderKeyDown}
							className="h-8 min-w-0 flex-1 gap-3 px-3 text-body font-normal text-foreground"
						>
							{section.share === null ? <span className="size-4 shrink-0" /> : <Ring aria-hidden share={section.share} />}
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
								section.exam && (
									<span data-slot="course-arc-exam" className="shrink-0 text-callout text-muted-foreground">
										{section.exam}
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
				<CollapsibleContent className="flex flex-col">{items.length > 0 && <ul className="flex flex-col pl-7">{items.map(renderItem)}</ul>}</CollapsibleContent>
			</section>
		</Collapsible>
	);
}
