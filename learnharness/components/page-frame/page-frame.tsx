import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The page frame (spec: page-frame.md) every page with a head and a body
 * shares, the course page and the topic page first: one centred column
 * under the window's 52px band, its head, then its body filling the rest.
 */
export function PageFrame({ className, children, ...rest }: ComponentProps<"div">) {
	return (
		<div data-slot="page-frame" className={cn("mx-auto flex min-h-0 w-full max-w-[72rem] flex-1 flex-col gap-5 px-6 pt-6 pb-6", className)} {...rest}>
			{children}
		</div>
	);
}

/**
 * The page's head, every line on the column's one left edge: an optional
 * line above the title (`eyebrow`, the topic page's course), the title at
 * 20/500 with the page's actions at its right end, the standing line (a
 * 16px mark and a few words per fact, muted), then any lines under it
 * (`children`: what comes next, an error).
 */
export function PageHead({
	eyebrow,
	title,
	actions,
	standing,
	children,
	className,
	...rest
}: {
	eyebrow?: ReactNode;
	title: ReactNode;
	/** The page's actions, right to left in weight: `PageAction` last. */
	actions?: ReactNode;
	/** Where he stands: a row of facts, each a 16px mark and a few words. */
	standing?: ReactNode;
	children?: ReactNode;
} & Omit<ComponentProps<"header">, "title">) {
	return (
		<header data-slot="page-head" className={cn("flex shrink-0 flex-col gap-1", className)} {...rest}>
			{eyebrow && (
				<p data-slot="page-eyebrow" className="text-label text-muted-foreground">
					{eyebrow}
				</p>
			)}
			<div className="flex min-h-8 items-center justify-between gap-4">
				<h1 data-slot="page-title" className="min-w-0 text-heading font-medium text-pretty text-foreground">
					{title}
				</h1>
				{actions && (
					<div data-slot="page-actions" className="-mr-2 flex shrink-0 items-center gap-1">
						{actions}
					</div>
				)}
			</div>
			{standing && (
				<div data-slot="page-standing" className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-row text-muted-foreground tabular-nums">
					{standing}
				</div>
			)}
			{children}
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
	const press = cn("group/press font-medium text-link hover:text-link", className);
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
