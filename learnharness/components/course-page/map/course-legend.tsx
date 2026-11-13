"use client";

import type { FocusEvent, KeyboardEvent } from "react";
import { CircleXIcon, HistoryIcon, type LucideIcon } from "lucide-react";
import type { GroupId } from "@/components/course-page/course-model";
import type { Need } from "@/components/course-map/topic-map/topic-standing";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { LegendFact, LegendMark } from "./map-plan";

/** The need line's icons, as the map's nodes draw them (topic-node.tsx). */
const NEED_ICON: Record<Need["kind"], LucideIcon> = { slip: CircleXIcon, review: HistoryIcon };

/** The words a pie's standing says, for the glyph's own (hidden) label. */
const PIE_WORDS = { 0: "Not started", 0.5: "Learning", 1: "On your own" } as const;

/** The mark a fact explains, drawn as the map draws it, at 16px. */
function Mark({ mark }: { mark: LegendMark }) {
	if (mark.kind === "pie") {
		const fill = mark.fill === 0 || mark.fill === 1 ? mark.fill : 0.5;
		return <TopicGlyph standing={{ fill, slipping: false, words: PIE_WORDS[fill] }} />;
	}
	const Icon = NEED_ICON[mark.need];
	return <Icon aria-hidden="true" className="size-4 shrink-0" />;
}

/**
 * The map candidate's legend (spec: course-legend.md): one line of the
 * page's groups, each its map mark and its count in a few words ("7 need
 * you"). Pointing at a fact, or reaching it by keyboard, lights its topics
 * on the map; pressing it keeps them lit until it is pressed again or Esc.
 * Arrows move along the line; Down goes to the map.
 */
export function CourseLegend({
	facts,
	pinned,
	onPin,
	onPoint,
	onFocusFact,
	onLeave,
	ref,
}: {
	facts: readonly LegendFact[];
	/** The fact kept lit, or null. */
	pinned: GroupId | null;
	onPin: (id: GroupId | null) => void;
	/** The fact under the pointer, or null when it leaves. */
	onPoint: (id: GroupId | null) => void;
	/** The fact keyboard focus reached, or null when focus came by a click or left. */
	onFocusFact: (id: GroupId | null) => void;
	/** Down from the line: the map takes focus. */
	onLeave: () => void;
	ref?: React.Ref<HTMLDivElement>;
}) {
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			onLeave();
		}
	};
	// Only keyboard focus lights a fact: a click's focus would keep it lit after the press is let go.
	const onFocus = (id: GroupId) => (event: FocusEvent<HTMLButtonElement>) => onFocusFact(event.currentTarget.matches(":focus-visible") ? id : null);
	return (
		<ToggleGroup
			ref={ref}
			type="single"
			orientation="horizontal"
			value={pinned ?? ""}
			onValueChange={(value) => onPin((value || null) as GroupId | null)}
			onKeyDown={onKeyDown}
			aria-label="Light topics on the map"
			data-slot="course-legend"
			className="mt-2 -ml-3 shrink-0 gap-1"
		>
			{facts.map((fact) => (
				<ToggleGroupItem
					key={fact.id}
					value={fact.id}
					variant="segmented"
					size="segment"
					data-slot="course-legend-fact"
					data-group={fact.id}
					onPointerEnter={() => onPoint(fact.id)}
					onPointerLeave={() => onPoint(null)}
					onFocus={onFocus(fact.id)}
					onBlur={() => onFocusFact(null)}
					className="cursor-pointer gap-1.5 tabular-nums hover:data-[state=off]:bg-fill-hover lh-no-drag"
				>
					<Mark mark={fact.mark} />
					{fact.words}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
