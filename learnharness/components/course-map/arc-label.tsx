import type { ArcHandle } from "@/src/core";
import { MathText } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";

/**
 * An arc's name (arc-label.md), the one way the app names an arc wherever it
 * lists or links one: its place in study order (`namedArc`), then its whole
 * name, both in the muted ink, never a pill and no ring (Edo, 16 Nov 2026:
 * the pills were "too in the way"). `here` brightens the name; so does the
 * pointer on the press it sits in, when that press is a `group/arc`. A name
 * wider than its room ends in "…".
 */
export function ArcLabel({
	number,
	handle,
	title,
	here = false,
	className,
}: {
	number: number;
	handle: ArcHandle;
	title: string;
	here?: boolean;
	className?: string;
}) {
	return (
		<span
			data-slot="arc-label"
			data-arc={handle}
			className={cn("flex min-w-0 items-baseline gap-2 text-callout whitespace-nowrap text-muted-foreground transition-colors group-hover/arc:text-foreground motion-reduce:transition-none", className)}
		>
			<span data-slot="arc-number" aria-hidden="true" className="tabular-nums">
				{number}
			</span>
			<span className={cn("truncate", here && "text-foreground")}>
				<MathText>{title}</MathText>
			</span>
		</span>
	);
}
