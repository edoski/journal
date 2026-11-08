import * as React from "react";
import { cn } from "@/lib/utils";

/** A titled group of rows (spec: nav-section.md): a 12px sentence-case
 *  muted header over its rows. */
export function NavSection({
	title,
	className,
	children,
	...props
}: React.ComponentProps<"section"> & { title: React.ReactNode }) {
	const id = React.useId();
	return (
		<section data-slot="nav-section" aria-labelledby={id} className={cn("flex flex-col", className)} {...props}>
			<h2
				id={id}
				data-slot="nav-section-header"
				className="flex h-7 items-center truncate px-2 text-label font-medium text-muted-foreground"
			>
				{title}
			</h2>
			{children}
		</section>
	);
}
