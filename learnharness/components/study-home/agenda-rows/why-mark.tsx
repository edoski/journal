import { ArrowRightIcon, BookmarkIcon, CircleXIcon, HistoryIcon, MessageCircleQuestionIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Why } from "@/components/study-home/agenda-rows/row-facts";
import { MathText } from "@/components/ui/math-text";

/** One icon per kind of reason, everywhere a reason shows: Home's rows,
 *  the course page's header and the sidebar's status slot. */
export const WHY_ICON: Record<Why["kind"], LucideIcon> = {
	reply: MessageCircleQuestionIcon,
	missed: CircleXIcon,
	review: HistoryIcon,
	task: BookmarkIcon,
	next: ArrowRightIcon,
};

/** "row": Home's line end, a 14px icon; "slot": a sidebar row's status
 *  slot, a 12px icon, T3 Code's status label. */
export type WhyMarkSize = "row" | "slot";

/**
 * Why a line is on Today (spec: why-mark.md): its icon, then a few words.
 * A turn that waits wears the accent at 500, every other reason is muted
 * at 400. `words` replaces the reason's own short words (the sidebar's
 * slot words, `NowLine.slot`).
 */
export function WhyMark({ why, size = "row", words }: { why: Why | null; size?: WhyMarkSize; words?: string | null }) {
	if (!why) return <span />;
	const Icon = WHY_ICON[why.kind];
	const tone = why.kind === "reply" ? "font-medium text-link" : "text-muted-foreground";
	if (size === "row") {
		return (
			<span data-slot="today-why" data-kind={why.kind} className={cn("inline-flex max-w-56 items-center gap-1.5 justify-self-end text-label", tone)}>
				<Icon aria-hidden className="size-3.5" />
				<span className="truncate">
					<MathText>{words ?? why.short}</MathText>
				</span>
			</span>
		);
	}
	return (
		<span data-slot="why-mark" data-kind={why.kind} className={cn("inline-flex min-w-0 max-w-full items-center gap-1 text-label", tone)}>
			<Icon aria-hidden className="size-3 shrink-0" />
			<span className="sr-only">, </span>
			<span className="truncate">
				<MathText>{words ?? why.short}</MathText>
			</span>
		</span>
	);
}
