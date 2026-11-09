import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** A collapsible group of rows (spec: nav-group.md): the sessions of one
 *  course. The header is a real 32px row with a 16px glyph, the name at
 *  14/500 and one trailing column; its items are `NavRow inset`, whose
 *  labels start on the name's edge. The trailing column holds the group's
 *  fact (the exam countdown) at rest, and the chevron on hover, on focus
 *  and while collapsed, so it lines up with every item's time. */
export function NavGroup({
	icon,
	title,
	trailing,
	attention = false,
	open,
	onOpenChange,
	className,
	children,
	...props
}: Omit<React.ComponentProps<typeof Collapsible>, "title"> & {
	icon: React.ReactNode;
	title: string;
	/** A fact about the group in 12px tabular figures, hidden while collapsed. */
	trailing?: React.ReactNode;
	/** An item waits on the learner: a 6px accent dot while collapsed. */
	attention?: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const id = React.useId();
	return (
		<Collapsible
			data-slot="nav-group"
			role="group"
			aria-labelledby={id}
			open={open}
			onOpenChange={onOpenChange}
			className={cn("flex flex-col", className)}
			{...props}
		>
			<CollapsibleTrigger
				data-slot="nav-group-header"
				className="group/nav-group flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-control font-medium text-foreground/90 outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
			>
				{icon}
				<span id={id} className="min-w-0 flex-1 truncate">
					{title}
				</span>
				<span
					data-slot="nav-group-trailing"
					className="relative ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end gap-1.5 text-label font-normal tabular-nums text-muted-foreground"
				>
					{open ? (
						trailing && (
							<span className="transition-opacity group-hover/nav-group:opacity-0 group-focus-visible/nav-group:opacity-0 motion-reduce:transition-none">
								{trailing}
							</span>
						)
					) : (
						attention && (
							<span data-slot="nav-group-attention" className="size-1.5 rounded-full bg-link">
								<span className="sr-only">, your turn</span>
							</span>
						)
					)}
					<ChevronDownIcon
						aria-hidden
						className={cn(
							"size-3.5 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
							open
								? "absolute right-0 opacity-0 group-hover/nav-group:opacity-100 group-focus-visible/nav-group:opacity-100"
								: "-rotate-90",
						)}
					/>
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent data-slot="nav-group-content" className="flex flex-col">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
