import Link from "next/link";
import type { ArcHandle } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { toggleVariants } from "@/components/ui/toggle";
import { Ring } from "@/components/ui/pie";
import { MathText } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";

/**
 * One arc as a bubble that opens a page (spec: arc-pill.md): the arc
 * strip's quiet pill (`toggleVariants` `pill` at `segment-sm`, the strip's
 * own style), its ring and its name, on one line, a long name ending in
 * …. A link, not a toggle: it picks nothing, it goes to `href`.
 */
export function ArcPill({ arc, share, href, className }: { arc: { handle: ArcHandle; title: string }; share: number | null; href: string; className?: string }) {
	return (
		<Link
			href={href}
			onClick={blurAfterPointerClick}
			data-slot="arc-pill"
			data-arc={arc.handle}
			className={cn(toggleVariants({ variant: "pill", size: "segment-sm" }), "min-w-0 max-w-full gap-1.5", className)}
		>
			{share !== null && <Ring aria-hidden share={share} className="size-3.5" />}
			<span className="min-w-0 truncate">
				<MathText>{arc.title}</MathText>
			</span>
		</Link>
	);
}
