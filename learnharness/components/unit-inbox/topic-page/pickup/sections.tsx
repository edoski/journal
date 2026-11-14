"use client";

import { HistoryPane } from "@/components/unit-inbox/topic-page/hybrid/history";
import type { HybridPaneProps } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { pickupSections } from "@/components/unit-inbox/topic-page/pickup/pickup-facts";
import { BuildsOnList, EarlierDays, MaterialList, NextList, NowRow, ScheduledEntry, Section } from "@/components/unit-inbox/topic-page/pickup/pickup-parts";

/**
 * The history pane, Pick up's sections (spec: pickup.md): the history sorted by
 * relevance into Now, Next, Scheduled and Earlier, each under a quiet
 * divider. Now is the weightiest row, marked in the accent; an empty
 * section is not drawn. While Now starts a topic, Builds on and In your
 * material say why it comes now.
 */
export function SectionsPane({ facts, busy, onAct, onTask, shown, onShow, onPoint, className }: HybridPaneProps & { onPoint?: (handle: string | null) => void }) {
	const { now, next, scheduled, earlier, why } = pickupSections(facts);
	return (
		<HistoryPane className={className}>
			<Section label="Now">
				<NowRow now={now} facts={facts} busy={busy} onAct={onAct} shown={shown} onShow={onShow} marked />
			</Section>
			{why && why.builds.length > 0 && (
				<Section label="Builds on">
					<BuildsOnList builds={why.builds} onPoint={onPoint} />
				</Section>
			)}
			{why && why.refs.length > 0 && (
				<Section label="In your material">
					<MaterialList refs={why.refs} />
				</Section>
			)}
			{next.length > 0 && (
				<Section label="Next">
					<NextList items={next} busy={busy} onTask={onTask} shown={shown} onShow={onShow} />
				</Section>
			)}
			{scheduled && (
				<Section label="Scheduled">
					<ScheduledEntry kind={scheduled.kind} day={scheduled.day} waits={scheduled.waits} />
				</Section>
			)}
			{earlier.length > 0 && (
				<Section label="Earlier">
					<EarlierDays days={earlier} shown={shown} onShow={onShow} titleOf={facts.titleOf} />
				</Section>
			)}
		</HistoryPane>
	);
}
