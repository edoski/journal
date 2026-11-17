"use client";

import * as React from "react";
import { ChevronRightIcon, ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MathText } from "@/components/ui/math-text";
import type { CourseTopic } from "@/components/course-page/course-model";
import { CHECK_WORDS, type CourseArc } from "@/components/course-page/course-arc";
import { cn } from "@/lib/utils";

/**
 * The arc Agenda's list shows (spec: agenda.md): the arc the map shows, its
 * name as a quiet label over its topics, then what the exam leaves out of
 * it and, on an arc ready for its check, Check it at the label's end. The
 * label folds the topics away and back. Props as `CourseArc`'s, so the list
 * walks it the same way.
 */
export function AgendaArc({
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
							className="h-8 min-w-0 flex-1 gap-1.5 px-3 text-callout font-normal text-muted-foreground hover:text-foreground"
						>
							<span data-slot="course-arc-title" className="min-w-0 truncate">
								<MathText>{arc.title}</MathText>
							</span>
							<ChevronRightIcon aria-hidden className={cn("size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
							<span className="flex-1" />
							{section.exam && (
								<span data-slot="course-arc-exam" className="shrink-0 font-normal">
									{section.exam}
								</span>
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
				<CollapsibleContent className="flex flex-col">{items.length > 0 && <ul className="flex flex-col">{items.map(renderItem)}</ul>}</CollapsibleContent>
			</section>
		</Collapsible>
	);
}
