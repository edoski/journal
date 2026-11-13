"use client";

import { HistoryPane } from "@/components/unit-inbox/topic-page/hybrid/history";
import type { HybridPaneProps } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { pickupSections } from "@/components/unit-inbox/topic-page/pickup/pickup-facts";
import { Divider, EarlierDays, NextList, NowRow, ScheduledEntry, Section } from "@/components/unit-inbox/topic-page/pickup/pickup-parts";

/**
 * Pick up option "nowline" (spec: pickup.md): one list read as a
 * calendar, from what is coming down to what is past. Scheduled on top,
 * then Next, then the present as a line in the accent carrying the one
 * thing to pick up, and the past below it by day, with no label of its
 * own: the line divides it.
 */
export function NowLinePane({ facts, busy, onAct, onTask, shown, onShow, className }: HybridPaneProps) {
	const { now, next, scheduled, earlier } = pickupSections(facts);
	return (
		<HistoryPane className={className}>
			{scheduled && (
				<Section label="Scheduled">
					<ScheduledEntry words={scheduled} />
				</Section>
			)}
			{next.length > 0 && (
				<Section label="Next">
					<NextList items={next} busy={busy} onTask={onTask} shown={shown} onShow={onShow} />
				</Section>
			)}
			<section aria-label="Now" data-slot="pickup-section" data-section="now" className="flex flex-col pb-3">
				<Divider now>Now</Divider>
				<NowRow now={now} facts={facts} busy={busy} onAct={onAct} shown={shown} onShow={onShow} marked={false} />
			</section>
			{earlier.length > 0 && <EarlierDays days={earlier} shown={shown} onShow={onShow} titleOf={facts.titleOf} />}
		</HistoryPane>
	);
}
