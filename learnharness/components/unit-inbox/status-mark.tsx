"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { CircleDashedIcon } from "lucide-react";
import { BrailleSpinner } from "@/components/braille-spinner";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { MathText } from "@/components/ui/math-text";
import { factIcon, factInk, type Fact } from "@/components/unit-inbox/fact-icon";
import { SLOT_WORDS } from "@/components/unit-inbox/row-card";
import { cn } from "@/lib/utils";

/** A fact's icon alone, from the one table (`factIcon`), in its ink
 *  (`factInk`): the spinner while the tutor writes, the topic's pie for
 *  where he stands. `label` names it for a screen reader where no words
 *  beside it do. */
export function FactIcon({ fact, className, label }: { fact: Fact; className?: string; label?: string }) {
	const name = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
	if (fact.kind === "working") return <BrailleSpinner />;
	if (fact.kind === "standing") return fact.standing ? <TopicGlyph standing={fact.standing} className={className} /> : <CircleDashedIcon {...name} className={cn("shrink-0 text-muted-foreground", className)} />;
	const Icon = factIcon(fact);
	return Icon && <Icon {...name} className={cn("shrink-0", factInk(fact.kind), className)} />;
}

/** "row": a row's line end, a 14px icon; "slot": a sidebar card's status
 *  slot, a 12px icon, its icon and words the slot's own items. */
export type StatusSize = "row" | "slot";

const ICON_SIZE: Record<StatusSize, string> = { row: "size-3.5", slot: "size-3" };

/** What a screen reader hears between the slot's course and its words. */
const PAUSE: Partial<Record<Fact["kind"], string>> = { studied: ", studied " };

/**
 * One fact as an icon and a few words (spec: status-mark.md), the one mark
 * every surface draws a status with: the fact's icon (`FactIcon`), then
 * its words, in the fact's ink, so Your turn wears the accent everywhere
 * and the tutor writing is the spinner everywhere. `whole` keeps the words
 * whole; else they end in an ellipsis. `short`, at size `row`: what it
 * says instead when its words would be cut (Home's reason for a new topic,
 * its plain words in place of why it starts). The surface places it
 * through `className` and names it through `data-slot`.
 */
export function StatusMark({
	fact,
	words,
	size = "row",
	whole = false,
	short,
	className,
	...rest
}: { fact: Fact; words: string; size?: StatusSize; whole?: boolean; short?: { fact: Fact; words: string } } & Omit<ComponentProps<"span">, "children">) {
	const text = useRef<HTMLSpanElement>(null);
	const [cutAt, setCutAt] = useState<string | null>(null);
	const said = short && cutAt === words ? short : { fact, words };
	const fits = short !== undefined;
	useLayoutEffect(() => {
		const el = text.current;
		const row = el?.parentElement?.parentElement;
		if (!fits || !el || !row) return;
		if (el.scrollWidth > el.clientWidth) setCutAt(words);
		let width = row.clientWidth;
		const observer = new ResizeObserver(() => {
			if (row.clientWidth === width) return;
			width = row.clientWidth;
			setCutAt(null);
		});
		observer.observe(row);
		return () => observer.disconnect();
	}, [fits, words, cutAt]);
	const icon = <FactIcon fact={said.fact} className={ICON_SIZE[size]} />;
	return (
		<span data-kind={said.fact.kind} className={cn(size === "slot" ? "contents" : "inline-flex items-center gap-1.5", "text-callout", factInk(said.fact.kind), className)} {...rest}>
			{said.fact.kind !== "studied" && said.fact.kind !== "unstarted" && <span className="flex h-4 shrink-0 items-center">{icon}</span>}
			{size === "slot" && <span className="sr-only">{PAUSE[said.fact.kind] ?? ", "}</span>}
			<span ref={text} data-slot="status-words" className={whole ? "whitespace-nowrap" : SLOT_WORDS}>
				<MathText>{said.words}</MathText>
			</span>
		</span>
	);
}
