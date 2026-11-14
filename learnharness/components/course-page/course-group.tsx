"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moreWords } from "@/components/study-words";

/**
 * One group of a course page (spec: course-group.md): a 28px header with
 * the group's name, on the anatomy of the
 * sidebar's NavSection but with its label on the rows' glyph edge, then its
 * rows (`CourseTopicRow`s). `foldable` makes the header a button that folds
 * the rows away, the sidebar's Known shelf; `limit` shows the first rows and
 * "Show the rest" (`moreWords`) for the rest. Neither is stored: each visit starts as the
 * page draws it, so there is nothing to keep tidy.
 */
export function CourseGroup<T>({
	title,
	items,
	renderItem,
	foldable = false,
	defaultFolded = false,
	limit,
	className,
	...section
}: Omit<React.ComponentProps<"section">, "title" | "children"> & {
	title: string;
	items: readonly T[];
	renderItem: (item: T) => React.ReactNode;
	foldable?: boolean;
	defaultFolded?: boolean;
	/** Rows shown before "Show the rest". */
	limit?: number;
}) {
	const headerId = React.useId();
	const [folded, setFolded] = React.useState(foldable && defaultFolded);
	const [expanded, setExpanded] = React.useState(false);
	const shown = folded ? [] : limit !== undefined && !expanded ? items.slice(0, limit) : items;
	const more = folded ? 0 : items.length - shown.length;
	// The chevron follows the name. No count: a bare number told him nothing (13 Nov 2026).
	const label = (chevron: React.ReactNode) => (
		<>
			<span className="min-w-0 truncate">{title}</span>
			{chevron}
		</>
	);
	return (
		<section data-slot="course-group" aria-labelledby={headerId} className={cn("flex flex-col", className)} {...section}>
			<h2 className="contents">
				{foldable ? (
					<Button
						variant="list"
						size="row"
						id={headerId}
						data-slot="course-group-header"
						aria-expanded={!folded}
						onClick={() => setFolded(!folded)}
						className="-mx-3 h-7 w-[calc(100%+1.5rem)] gap-1 px-3 text-label font-medium duration-150 hover:bg-transparent"
					>
						{label(<ChevronDownIcon aria-hidden className={cn("size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none", folded && "-rotate-90")} />)}
					</Button>
				) : (
					<span id={headerId} data-slot="course-group-header" className="flex h-7 items-center gap-1 rounded-md text-label font-medium text-muted-foreground">
						{label(null)}
					</span>
				)}
			</h2>
			{shown.length > 0 && <ul className="flex flex-col">{shown.map(renderItem)}</ul>}
			{more > 0 && (
				<Button
					variant="list"
					size="row"
					data-slot="course-group-more"
					onClick={() => setExpanded(true)}
					className="-mx-3 h-9 w-[calc(100%+1.5rem)] gap-4 px-3 duration-150"
				>
					<ChevronDownIcon aria-hidden className="size-4 shrink-0" />
					{moreWords(more, Infinity)}
				</Button>
			)}
		</section>
	);
}
