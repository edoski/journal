import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { PressWord } from "@/components/study-words";
import { cn } from "@/lib/utils";

/** The column every page sits in: centred, up to 80rem, 24px sides, 24px
 *  above the window's foot. Home wears it too, so moving between pages no
 *  edge moves. */
export const PAGE_COLUMN = "mx-auto w-full max-w-[80rem] px-6 pb-6";

/**
 * The page frame (spec: page-frame.md) every page with a head and a body
 * shares, the course page and the topic page first: one centred column
 * whose first 32px row is centred on the band's centre line
 * (`--lh-band-centre`), level with the folded rail's open button and
 * Home's course tabs, its head, then its body filling the rest.
 */
export function PageFrame({ className, children, ...rest }: ComponentProps<"div">) {
	return (
		<div data-slot="page-frame" className={cn(PAGE_COLUMN, "flex min-h-0 flex-1 flex-col gap-5 pt-[calc(var(--lh-band-centre)-1rem)]", className)} {...rest}>
			{children}
		</div>
	);
}

/**
 * What a page says in its place (spec: page-frame.md, "Notices"): one
 * line in the frame's first row, the 32px row its title takes, so nothing
 * jumps when the page arrives or between pages. Every page's notice is
 * this one: why it can't show (the engine down is `CoursesUnavailable`
 * in it), and while it reads (`PageReading`).
 */
export function PageNotice({ children, ...rest }: ComponentProps<"div">) {
	return (
		<PageFrame className="h-full">
			<div data-slot="page-notice" className="flex min-h-8 flex-wrap items-center text-body text-muted-foreground" {...rest}>
				{children}
			</div>
		</PageFrame>
	);
}

/** Every page while it reads: one sentence in the notice's place, never a
 *  skeleton of one page's head. */
export function PageReading() {
	return <PageNotice role="status">Reading your courses…</PageNotice>;
}

/** A hairline between the facts of the standing line, 12px tall, 12px
 *  clear on each side, drawn in the gap before each fact: the facts sit a
 *  gap left of a clip, so the first fact on each line, wrapped or not, has
 *  its hairline cut away and starts on the line's left edge (round 18, m9:
 *  "Studied 10 Nov" wrapped to its own line with the hairline in front). */
const BETWEEN_FACTS = "-ml-6 *:relative *:ml-6 *:before:absolute *:before:top-1/2 *:before:-left-3 *:before:h-3 *:before:w-px *:before:-translate-y-1/2 *:before:bg-border *:before:content-['']";

/**
 * The page's head, every line on the column's one left edge, in the order
 * he reads it (Edo, 14 Nov 2026: minimal, with more structure): a line
 * above the title (`eyebrow`, the topic page's course), the title at
 * 20/500 with the page's actions at its right end, then the lines under
 * it: what to do next (`lead`, 14/500 in full ink), the standing line (a
 * 16px mark and a few words per fact, muted, a thin divider between
 * facts on one line), then any more (`children`: a mistake, an error). The head's
 * first row stands on the band's centre line: the title, or the line
 * above it when a page has one, a 32px row so it centres there (Edo,
 * 16 Nov 2026: the course page's title should align with the open button,
 * as Home's tabs do, with no empty line above it). The lines under the
 * title take two lines' room at least. A hairline under it closes the
 * head off from the page's body.
 */
export function PageHead({
	eyebrow,
	title,
	actions,
	lead,
	standing,
	compact = false,
	children,
	className,
	...rest
}: {
	/** The lines under the title take the room they fill, one line's at
	 *  least, not two (the course page, and the topic page beside it). */
	compact?: boolean;
	eyebrow?: ReactNode;
	title: ReactNode;
	/** The page's actions, quiet buttons, right to left in weight. */
	actions?: ReactNode;
	/** What to do next: the head's primary line, under the title. */
	lead?: ReactNode;
	/** Where he stands: a row of facts, each a 16px mark and a few words. */
	standing?: ReactNode;
	children?: ReactNode;
} & Omit<ComponentProps<"header">, "title">) {
	return (
		<header data-slot="page-head" className={cn("flex shrink-0 flex-col gap-1 border-b border-border/60 pb-4", className)} {...rest}>
			{eyebrow && (
				<p data-slot="page-eyebrow" className="flex h-8 min-w-0 items-center truncate text-callout text-muted-foreground">
					{eyebrow}
				</p>
			)}
			<div className="flex min-h-8 items-center justify-between gap-4">
				<h1 data-slot="page-title" className="min-w-0 text-title-1 text-pretty text-foreground">
					{title}
				</h1>
				{actions && (
					<div data-slot="page-actions" className="lh-no-drag -mr-2 flex shrink-0 items-center gap-1">
						{actions}
					</div>
				)}
			</div>
			<div data-slot="page-lines" className={cn("mt-1 flex flex-col gap-2", compact ? "min-h-5" : "min-h-12")}>
				{lead && (
					<div data-slot="page-lead" className="flex min-h-5 min-w-0 items-center text-headline text-foreground">
						{lead}
					</div>
				)}
				{standing && (
					// The clip, with 2px of room on every side for a fact's focus ring.
					<div data-slot="page-standing" className="-m-0.5 min-w-0 overflow-hidden p-0.5">
						<div className={cn("flex min-h-5 min-w-0 flex-wrap items-center gap-y-1 text-body text-muted-foreground tabular-nums", BETWEEN_FACTS)}>{standing}</div>
					</div>
				)}
				{children}
			</div>
		</header>
	);
}

/** One fact of the standing line: a 16px mark, then a few words. */
export function PageFact({ icon, children, className, ...rest }: { icon: ReactNode } & ComponentProps<"span">) {
	return (
		<span data-slot="page-fact" className={cn("inline-flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap", className)} {...rest}>
			{icon}
			{children}
		</span>
	);
}

/** The page's one press, the course page's Now and the topic page's Now
 *  alike: its word (`pressWord`) in a 32px pill in the send button's fill,
 *  centred on its row, the arrow stepping right while the row
 *  (`group/press`) is hovered. Drawn inside the row that is the press,
 *  never a control of its own. */
export function PagePress({ word }: { word: PressWord }) {
	return (
		<span data-slot="page-press" className={cn(buttonVariants({ size: "pill" }), "pointer-events-none shrink-0 self-center font-medium")}>
			{word}
			<ArrowRightIcon aria-hidden className="size-4 transition-transform duration-150 group-hover/press:translate-x-0.5 motion-reduce:transition-none" />
		</span>
	);
}
