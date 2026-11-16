import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** A hairline between the facts of the standing line, 12px tall, 12px
 *  clear on each side. */
const BETWEEN_FACTS = "*:not-first:before:ml-3 *:not-first:before:mr-1.5 *:not-first:before:h-3 *:not-first:before:w-px *:not-first:before:bg-border *:not-first:before:content-['']";

/**
 * The page's head, every line on the column's one left edge, in the order
 * he reads it (Edo, 14 Nov 2026: minimal, with more structure): a line
 * above the title (`eyebrow`, the topic page's course), the title at
 * 20/500 with the page's actions at its right end, then the lines under
 * it: what to do next (`lead`, 14/500 in full ink), the standing line (a
 * 16px mark and a few words per fact, muted, a thin divider between
 * facts), then any more (`children`: a mistake, an error). The head's
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
	children,
	className,
	...rest
}: {
	eyebrow?: ReactNode;
	title: ReactNode;
	/** The page's actions, right to left in weight: `PageAction` last. */
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
					<div data-slot="page-actions" className="-mr-2 flex shrink-0 items-center gap-1">
						{actions}
					</div>
				)}
			</div>
			<div data-slot="page-lines" className="mt-1 flex min-h-12 flex-col gap-2">
				{lead && (
					<div data-slot="page-lead" className="flex min-h-5 min-w-0 items-center text-headline text-foreground">
						{lead}
					</div>
				)}
				{standing && (
					<div data-slot="page-standing" className={cn("flex min-h-5 min-w-0 flex-wrap items-center gap-y-1 text-body text-muted-foreground tabular-nums", BETWEEN_FACTS)}>
						{standing}
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

/**
 * The page's press, the topic page's Now press: its word in the accent at
 * 500 with an arrow that steps right on hover, on a quiet shadcn Button.
 * A link with `href`, else a button.
 */
export function PageAction({
	href,
	children,
	className,
	...button
}: { href?: string; children: ReactNode } & Omit<ComponentProps<typeof Button>, "asChild" | "variant" | "size" | "children">) {
	const press = cn("group/press text-link hover:text-link", className);
	const words = (
		<>
			{children}
			<ArrowRightIcon aria-hidden className="transition-transform duration-150 group-hover/press:translate-x-0.5 motion-reduce:transition-none" />
		</>
	);
	if (href) {
		return (
			<Button asChild variant="quiet" size="row" className={press} {...button}>
				<Link href={href} aria-disabled={button.disabled || undefined} onClick={button.disabled ? (e) => e.preventDefault() : undefined}>
					{words}
				</Link>
			</Button>
		);
	}
	return (
		<Button variant="quiet" size="row" className={press} {...button}>
			{words}
		</Button>
	);
}
