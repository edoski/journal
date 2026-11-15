import * as React from "react";
import { cn } from "@/lib/utils";

/** A titled, fixed group of rows (spec: nav-section.md): a 12px sentence-case
 *  muted header over its rows, with an optional trailing fact. */
export function NavSection({
	title,
	trailing,
	className,
	children,
	...props
}: React.ComponentProps<"section"> & { title: React.ReactNode; trailing?: React.ReactNode }) {
	const id = React.useId();
	return (
		<section data-slot="nav-section" aria-labelledby={id} className={cn("flex flex-col", className)} {...props}>
			<h2
				id={id}
				data-slot="nav-section-header"
				className="flex h-7 items-center gap-2 px-2 text-callout system-current:text-label system-current:font-medium text-muted-foreground"
			>
				<span className="min-w-0 flex-1 truncate">{title}</span>
				{trailing && (
					<span data-slot="nav-section-trailing" className="shrink-0 font-normal system-current:font-normal tabular-nums">
						{trailing}
					</span>
				)}
			</h2>
			{children}
		</section>
	);
}
