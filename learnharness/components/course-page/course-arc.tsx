"use client";

import * as React from "react";
import { BookCheckIcon, ChevronDownIcon, CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, CircleDotDashedIcon, ListChecksIcon } from "lucide-react";
import type { ArcState } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { ARC_STATE_WORDS } from "@/components/study-words";
import { GROUP_WORDS, type CourseArcSection } from "@/components/course-page/course-model";
import { ROW_ACTION } from "@/components/unit-inbox/row-card";
import { cn } from "@/lib/utils";

/** The mark beside where an arc stands, and beside "Needs you". */
const STATE_ICON: Record<ArcState | "needs-you", typeof CircleCheckIcon> = {
	new: CircleDashedIcon,
	learning: CircleDotDashedIcon,
	ready: ListChecksIcon,
	checked: CircleCheckIcon,
	taught: BookCheckIcon,
	"needs-you": CircleAlertIcon,
};

/** The words Check it says. */
export const CHECK_WORDS = "Check it";

/** What an arc's line says at its end: "Needs you" in the slip's ink when
 *  Today takes up one of its topics, else where it stands (`ARC_STATE_WORDS`). */
export function arcLineWords(section: Pick<CourseArcSection, "needsYou" | "arc">): { kind: ArcState | "needs-you"; words: string } {
	return section.needsYou ? { kind: "needs-you", words: GROUP_WORDS["needs-you"] } : { kind: section.arc.state, words: ARC_STATE_WORDS[section.arc.state] };
}

/**
 * One arc of a course page (spec: course-arc.md): a 36px line, a shadcn
 * Collapsible's trigger, with the arc's ring, its name, its exam words when
 * the exam leaves some arc out, a chevron, and at its end "Needs you" or
 * where it stands, each with its mark, every line's ending on one right
 * edge. A `ready` arc's Check it (`onCheck`) is the line's action, the
 * sidebar row's (`ROW_ACTION`): it takes the status's place while the line
 * is hovered or has keyboard focus, and stays there while the arc is open;
 * it never moves the status. Open, its topics hang under its name
 * (`renderItem`). `open` and `onOpenChange` are the page's, which walks it
 * with arrows (`headerRef`, `checkRef`, `onHeaderKeyDown`, `onCheckKeyDown`).
 */
export function CourseArc<T>({
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
}: Omit<React.ComponentProps<"section">, "children"> & {
	section: CourseArcSection;
	items: readonly T[];
	renderItem: (item: T) => React.ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Starts the arc's check; offered only on a `ready` arc. */
	onCheck?: () => void;
	/** Its check is starting. */
	checking?: boolean;
	headerRef?: React.Ref<HTMLButtonElement>;
	checkRef?: React.Ref<HTMLButtonElement>;
	onHeaderKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
	onCheckKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
}) {
	const headerId = React.useId();
	const { arc } = section;
	const end = arcLineWords(section);
	const Icon = STATE_ICON[end.kind];
	const checkable = Boolean(arc.state === "ready" && onCheck);
	// The status gives way to Check it, in place, as a sidebar row's status gives way to its action.
	const giveWay = checkable && (open ? "opacity-0" : "transition-opacity group-hover/sidebar-row:opacity-0 group-has-[:focus-visible]/sidebar-row:opacity-0 motion-reduce:transition-none");
	return (
		<Collapsible asChild open={open} onOpenChange={onOpenChange}>
			<section data-slot="course-arc" data-arc={arc.handle} data-current={section.current || undefined} aria-labelledby={headerId} className={cn("flex flex-col", className)} {...rest}>
				<h2 className="group/sidebar-row relative -mx-3 flex h-9 w-[calc(100%+1.5rem)] min-w-0 items-center">
					<CollapsibleTrigger asChild>
						<Button
							ref={headerRef}
							variant="list"
							size="row"
							id={headerId}
							data-slot="course-arc-header"
							onKeyDown={onHeaderKeyDown}
							className="h-9 min-w-0 flex-1 gap-4 px-3 text-headline text-foreground duration-150"
						>
							{section.share === null ? <span className="size-4 shrink-0" /> : <Ring aria-hidden share={section.share} />}
							<span className="flex min-w-0 flex-1 items-center gap-1">
								<span data-slot="course-arc-title" className="min-w-0 truncate">
									<MathText>{arc.title}</MathText>
								</span>
								<ChevronDownIcon aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", !open && "-rotate-90")} />
								{section.exam && (
									<span data-slot="course-arc-exam" className="ml-1 min-w-0 truncate text-callout font-normal text-muted-foreground">
										{section.exam}
									</span>
								)}
							</span>
							<span
								data-slot="course-arc-state"
								data-kind={end.kind}
								className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 text-callout font-normal", end.kind === "needs-you" ? "text-warning" : "text-muted-foreground", giveWay)}
							>
								<Icon aria-hidden className="size-3.5 shrink-0" />
								{end.words}
							</span>
						</Button>
					</CollapsibleTrigger>
					{checkable && (
						<Button
							ref={checkRef}
							variant="quiet"
							size="xs"
							data-slot="course-arc-check"
							disabled={checking}
							onClick={onCheck}
							onKeyDown={onCheckKeyDown}
							className={cn(
								ROW_ACTION,
								"top-1/2 right-1.5 h-6 -translate-y-1/2 text-link hover:text-link group-has-[[data-slot=course-arc-header]:focus-visible]/sidebar-row:pointer-events-auto group-has-[[data-slot=course-arc-header]:focus-visible]/sidebar-row:opacity-100",
								open && "pointer-events-auto opacity-100",
							)}
						>
							<ListChecksIcon aria-hidden />
							{CHECK_WORDS}
						</Button>
					)}
				</h2>
				<CollapsibleContent className="flex flex-col">{items.length > 0 && <ul className="flex flex-col pl-8">{items.map(renderItem)}</ul>}</CollapsibleContent>
			</section>
		</Collapsible>
	);
}
