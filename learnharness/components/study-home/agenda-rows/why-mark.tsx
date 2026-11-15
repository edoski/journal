"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRightIcon, BookmarkIcon, CircleXIcon, CornerDownRightIcon, FastForwardIcon, HistoryIcon, MessageCircleQuestionIcon, PauseIcon, PenLineIcon, type LucideIcon } from "lucide-react";
import type { StartsWhy } from "@/src/core";
import { cn } from "@/lib/utils";
import type { Why } from "@/components/study-home/agenda-rows/row-facts";
import { MathText } from "@/components/ui/math-text";

/** One icon per kind of reason, everywhere a reason shows: Home's rows,
 *  the course page's header and the sidebar's status slot. */
export const WHY_ICON: Record<Why["kind"], LucideIcon> = {
	reply: MessageCircleQuestionIcon,
	working: PenLineIcon,
	stopped: PauseIcon,
	missed: CircleXIcon,
	review: HistoryIcon,
	task: BookmarkIcon,
	next: ArrowRightIcon,
};

/** Why a new topic starts now, one icon each: next in its arc, the
 *  arrow; after what it needs, a turn that follows on; early, ahead of
 *  its place. */
export const STARTS_ICON: Record<StartsWhy["kind"], LucideIcon> = {
	next: ArrowRightIcon,
	after: CornerDownRightIcon,
	early: FastForwardIcon,
};

/** "row": Home's line end, a 14px icon; "slot": a sidebar row's status
 *  slot, a 12px icon, T3 Code's status label, its words always whole. */
export type WhyMarkSize = "row" | "slot";

/**
 * Why a line is on Today (spec: why-mark.md): its icon, then a few words.
 * A turn that waits wears the accent at 500, every other reason is muted
 * at 400. `words` replaces the reason's own short words (the sidebar's
 * slot words, `NowLine.slot`).
 */
export function WhyMark({ why, size = "row", words }: { why: Why | null; size?: WhyMarkSize; words?: string | null }) {
	if (!why) return <span />;
	const tone = why.kind === "reply" ? "font-medium text-link" : "text-muted-foreground";
	if (size === "row") return <RowMark key={why.starts?.words ?? why.short} why={why} words={words} tone={tone} />;
	const Icon = WHY_ICON[why.kind];
	return (
		// `contents`: the icon and the words are the status slot's own items (`TRAILING_SLOT`).
		<span data-slot="why-mark" data-kind={why.kind} className={cn("contents text-label", tone)}>
			<span className="flex h-4 shrink-0 items-center">
				<Icon aria-hidden className="size-3" />
			</span>
			<span className="sr-only">, </span>
			<span className="whitespace-nowrap">
				<MathText>{words ?? why.short}</MathText>
			</span>
		</span>
	);
}

/** Home's line end. A new topic's reason (`why.starts`) shows with its own
 *  icon only while it fits on one line; cut, the line says its plain words
 *  instead ("Planned today"), since the topic page says the whole reason. */
function RowMark({ why, words, tone }: { why: Why; words?: string | null; tone: string }) {
	const [cut, setCut] = useState(false);
	const ref = useRef<HTMLSpanElement>(null);
	const starts = why.starts && !cut ? why.starts : null;
	useLayoutEffect(() => {
		const text = ref.current;
		const row = text?.closest<HTMLElement>("[data-slot=today-why]")?.parentElement;
		if (!why.starts || !text || !row) return;
		const measure = () => text.scrollWidth > text.clientWidth;
		if (measure()) setCut(true);
		let width = row.clientWidth;
		const observer = new ResizeObserver(() => {
			if (row.clientWidth === width) return;
			width = row.clientWidth;
			setCut(false);
		});
		observer.observe(row);
		return () => observer.disconnect();
	}, [why.starts?.words, cut]);
	const Icon = starts ? STARTS_ICON[starts.kind] : WHY_ICON[why.kind];
	return (
		<span data-slot="today-why" data-kind={why.kind} data-starts={starts?.kind} className={cn("inline-flex max-w-56 items-center gap-1.5 justify-self-end text-label", tone)}>
			<Icon aria-hidden className="size-3.5" />
			<span ref={ref} className="truncate">
				<MathText>{starts?.words ?? words ?? why.short}</MathText>
			</span>
		</span>
	);
}
