import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import type { NamedArc } from "@/src/core";
import { ArcLabel } from "@/components/course-map/arc-label";
import { MathText } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";

/** One place on the trail: the course, an arc of it, a topic. A crumb
 *  with no page to open is plain words. */
export type Crumb = { kind: "course"; title: string; href?: string } | { kind: "arc"; arc: NamedArc; href: string } | { kind: "topic"; title: string; href: string };

/** A crumb takes the room its words need and gives way first when the
 *  trail is full (round 8: "Rank and the column s…" with half the bar
 *  free). */
const CRUMB = "min-w-0 shrink-[2] truncate text-body text-muted-foreground";
const CRUMB_LINK = `lh-no-drag ${CRUMB} rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none`;

function CrumbPart({ crumb }: { crumb: Crumb }) {
	if (crumb.kind === "arc") {
		return (
			<Link href={crumb.href} data-slot="crumb" data-kind="arc" className={cn(CRUMB_LINK, "group/arc")}>
				<ArcLabel number={crumb.arc.number} handle={crumb.arc.handle} title={crumb.arc.title} className="text-body" />
			</Link>
		);
	}
	const words = <MathText>{crumb.title}</MathText>;
	return crumb.href === undefined ? (
		<span data-slot="crumb" data-kind={crumb.kind} className={CRUMB}>
			{words}
		</span>
	) : (
		<Link href={crumb.href} data-slot="crumb" data-kind={crumb.kind} className={CRUMB_LINK}>
			{words}
		</Link>
	);
}

/**
 * Where he is (spec: crumbs.md), the one trail: any run of course, arc and
 * topic, each a link to its page lifting to full ink on hover, a 14px
 * chevron at 60% between them, then `end` (the lesson's title) after one
 * more. An arc is its `ArcLabel`, as everywhere it is named.
 */
export function Crumbs({ crumbs, end, className }: { crumbs: readonly Crumb[]; end?: ReactNode; className?: string }) {
	const parts = crumbs.map((crumb) => ({ key: crumb.kind, node: <CrumbPart crumb={crumb} /> }));
	const trail = end ? [...parts, { key: "end", node: end }] : parts;
	return (
		<div data-slot="crumbs" className={cn("flex min-w-0 items-center gap-1.5", className)}>
			{trail.map((part, i) => (
				<Fragment key={part.key}>
					{i > 0 && <ChevronRightIcon aria-hidden data-slot="crumb-chevron" className="size-3.5 shrink-0 text-muted-foreground/60" />}
					{part.node}
				</Fragment>
			))}
		</div>
	);
}
