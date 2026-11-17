"use client";

import * as React from "react";
import { ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArcLabel } from "@/components/course-map/arc-label";
import { ARC_STATE_WORDS } from "@/components/study-words";
import { GROUP_WORDS, type CourseArcSection, type CourseTopic } from "@/components/course-page/course-model";
import { cn } from "@/lib/utils";

/** The words the arc's check says: what to do, literally (round 15, m10:
 *  "Check it" told him neither what nor how), and what it is in its hint. */
export const CHECK_WORDS = "Test this arc";
export const CHECK_HINT = "A question on each of its topics, in mixed order, with no hints";

/** What the list hands each arc's line (`SplitList`'s `arcLine`): the arc,
 *  its topics and how to draw one, whether it is open, its check, and the
 *  refs and keys of the list's arrow walk. */
export type ArcLineProps = Omit<React.ComponentProps<"section">, "children"> & {
	section: CourseArcSection;
	items: readonly CourseTopic[];
	renderItem: (item: CourseTopic) => React.ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Starts the arc's check; offered only on a `ready` arc. */
	onCheck?: () => void;
	/** Its check is starting. */
	checking?: boolean;
	headerRef?: React.Ref<HTMLButtonElement>;
	checkRef?: React.Ref<HTMLButtonElement>;
	onHeaderKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
};

/** Each arc is its own block on the road: a rail down its left edge, as tall as the arc with its open topics,
 *  set apart from the next by a small gap, so the arcs read as separate containers (Edo, 17 Nov 2026). Its 16px
 *  right inset ends every fact 16px in from the column's edge, so a topic row, which reaches 12px past its facts,
 *  ends its fill 4px inside the column and its 2px focus ring whole inside it too. */
export const BLOCK = "relative pr-4 pl-4";
/** The arc's rail: quiet, and bright on the arc the map shows. */
export function Rail({ bright = false }: { bright?: boolean }) {
	return (
		<span
			aria-hidden="true"
			data-slot={bright ? "road-bar" : "road-rail"}
			className={cn("pointer-events-none absolute top-1 bottom-1 left-0 w-0.5 rounded-full transition-colors duration-200 motion-reduce:transition-none", bright ? "bg-foreground" : "bg-white/10")}
		/>
	);
}

/**
 * One arc on the road (spec: road.md), drawn as the map's arc list draws
 * its rows (`ArcIndex`), since the road is the course's arcs and the map
 * beside it lists none: its place in study order and its whole name
 * (`ArcLabel`), the dot of "You are here" on the arc he is in, and at its
 * end the one fact the road needs ("Needs you" when Today takes up one of
 * its topics, Check it on an arc ready for its check, "Check passed", or
 * the day its first topic starts while none is, `starts`); nothing
 * otherwise. Each arc is its own block with a rail down its left, bright on
 * the arc the map shows (`shown`). An arc past the exam (`past`) is muted.
 * Open, its topics hang under its name. The list walks it by its
 * `ArcLineProps`.
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
	number,
	starts,
	shown = false,
	past = false,
	className,
	...rest
}: ArcLineProps & { number: number; starts: string | null; shown?: boolean; past?: boolean }) {
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
				className={cn(BLOCK, "flex flex-col pb-1", className)}
				{...rest}
			>
				<Rail bright={shown} />
				<h2 className="flex h-7 min-w-0 items-center gap-2">
					<CollapsibleTrigger asChild>
						<button
							ref={headerRef}
							type="button"
							id={headerId}
							data-slot="course-arc-header"
							onKeyDown={onHeaderKeyDown}
							// Focus selects: walking the road opens the arc reached and closes the last.
							onFocus={() => {
								if (!open) onOpenChange?.(true);
							}}
							className="group/arc flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<ArcLabel
								number={number}
								handle={arc.handle}
								title={arc.title}
								here={shown}
								className={cn(past && !shown && "opacity-60")}
							/>
							{section.current && <span aria-hidden="true" data-slot="road-here" className="size-1.5 shrink-0 rounded-full bg-ring" />}
							<span className="flex-1" />
							{section.needsYou ? (
								<span data-slot="course-arc-state" data-kind="needs-you" className="shrink-0 text-callout text-warning">
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
						<Hint label={CHECK_HINT} side="bottom">
							<Button
								ref={checkRef}
								variant="quiet"
								size="xs"
								data-slot="course-arc-check"
								disabled={checking}
								onClick={onCheck}
								className="-mr-1.5 h-6 shrink-0 gap-1.5 px-1.5 text-callout font-normal text-muted-foreground hover:text-link [&_svg]:size-3.5"
							>
								<ListChecksIcon aria-hidden />
								{CHECK_WORDS}
							</Button>
						</Hint>
					)}
				</h2>
				{/* Clipped only down, for the slide: a topic row reaches past the list's right edge to its own. */}
				<CollapsibleContent className="overflow-y-clip data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
					{items.length > 0 && <ul className="flex flex-col pt-0.5 pb-1.5 pl-4">{items.map(renderItem)}</ul>}
				</CollapsibleContent>
			</section>
		</Collapsible>
	);
}
