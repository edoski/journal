"use client";

import { CircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HistoryPane } from "@/components/unit-inbox/topic-page/hybrid/history";
import type { HybridPaneProps } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { pickupSections, type NowItem } from "@/components/unit-inbox/topic-page/pickup/pickup-facts";
import { EarlierDays, MapToggle, NextList, NowIcon, NowPress, ScheduledEntry, Section } from "@/components/unit-inbox/topic-page/pickup/pickup-parts";

/** The lesson's path in the block: the step it stopped on with the map's
 *  current dot, a line down to the step after it, marked Next. */
function StepPath({ now }: { now: NowItem }) {
	if (!now.step) return now.detail ? <p className="px-4 pl-12 text-row text-muted-foreground">{now.detail}</p> : null;
	return (
		<div className="flex flex-col gap-1 px-4">
			<p className="pl-8 text-label text-muted-foreground">{now.step.lead}</p>
			<ol className="flex flex-col">
				<li data-slot="pickup-step" className={cn("relative grid h-7 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-4", now.then && "after:absolute after:top-[calc(50%+7px)] after:-bottom-[calc(50%-7px)] after:left-[7.5px] after:w-px after:bg-white/33")}>
					<span aria-hidden className="size-2 justify-self-center rounded-full bg-link ring-4 ring-link/20" />
					<span className="truncate text-row text-foreground">{now.step.title}</span>
				</li>
				{now.then && (
					<li data-slot="pickup-then" className="grid h-7 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-4">
						<CircleIcon aria-hidden strokeWidth={3} className="size-2.5 justify-self-center text-muted-foreground" />
						<span className="truncate text-row text-muted-foreground">{now.then}</span>
						<span className="text-label text-muted-foreground">Next</span>
					</li>
				)}
			</ol>
		</div>
	);
}

/**
 * Now as a block heading the pane: what waits and the lesson's title, the
 * step it stopped on and the step after on a short path, and a foot with
 * the press; the whole block is the press. Its own surface and border set
 * it apart from the rows under it.
 */
function NowBlock({ now, facts, busy, onAct, shown, onShow }: { now: NowItem } & Pick<HybridPaneProps, "facts" | "busy" | "onAct" | "shown" | "onShow">) {
	const onMap = now.chat !== null && now.chat === shown;
	const planned = now.chat !== null && facts.sessions.some((entry) => entry.chat.id === now.chat && entry.plan?.tree.nodes.length);
	return (
		<div
			data-slot="pickup-now"
			data-action={now.kind}
			data-shown={onMap || undefined}
			className="group/now relative mb-3 flex flex-col gap-3 rounded-xl border border-border bg-fill-hover pt-4 transition-colors hover:bg-fill-selected motion-reduce:transition-none"
		>
			<div className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-4 gap-y-0.5 px-4">
				<NowIcon now={now} facts={facts} />
				<span className="truncate text-control font-medium text-foreground">{now.words}</span>
				{now.title && <span className="col-start-2 truncate text-row text-muted-foreground">{now.title}</span>}
			</div>
			<StepPath now={now} />
			<div className="flex h-11 items-center justify-between gap-4 border-t border-border/60 px-4">
				{planned && now.chat ? <MapToggle chat={now.chat} shown={onMap} onShow={onShow} className="-ml-1" /> : <span />}
				<NowPress now={now} busy={busy} onAct={onAct} />
			</div>
		</div>
	);
}

/**
 * Pick up option "block" (spec: pickup.md): a block heads the history
 * with the one thing to pick up, then Next, Scheduled and Earlier under
 * quiet dividers.
 */
export function BlockPane({ facts, busy, onAct, onTask, shown, onShow, className }: HybridPaneProps) {
	const { now, next, scheduled, earlier } = pickupSections(facts);
	return (
		<HistoryPane className={className}>
			<NowBlock now={now} facts={facts} busy={busy} onAct={onAct} shown={shown} onShow={onShow} />
			{next.length > 0 && (
				<Section label="Next">
					<NextList items={next} busy={busy} onTask={onTask} shown={shown} onShow={onShow} />
				</Section>
			)}
			{scheduled && (
				<Section label="Scheduled">
					<ScheduledEntry words={scheduled} />
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
