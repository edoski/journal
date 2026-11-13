"use client";

import Link from "next/link";
import { ArrowRightIcon, BookmarkIcon, CircleDashedIcon, HistoryIcon, MessageCircleQuestionIcon, WaypointsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { DayItem, SessionItem } from "@/components/unit-inbox/topic-page/hybrid/history";
import type { HybridPaneProps } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { BrailleSpinner } from "@/components/braille-spinner";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { ONE_LINE_ROW } from "@/components/unit-inbox/topic-page/row-classes";
import type { TrailDay } from "@/components/unit-inbox/topic-page/trail/trail-facts";
import type { NextItem, NowItem, ResumeIcon } from "@/components/unit-inbox/topic-page/pickup/pickup-facts";
import type { TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";

const ICON = "size-4 text-muted-foreground";

/** A section's quiet label: its word, then a hairline to the column's end.
 *  `now` draws it in the accent, as a calendar's line for the present. */
export function Divider({ children, now = false }: { children: string; now?: boolean }) {
	return (
		<h2
			data-slot="pickup-divider"
			className={cn(
				"flex h-8 items-center gap-3 text-label font-medium after:h-px after:flex-1",
				now ? "text-link after:bg-link/60" : "text-muted-foreground after:bg-border/50",
			)}
		>
			{children}
		</h2>
	);
}

/** One labelled section of the pane. */
export function Section({ label, now, children }: { label: string; now?: boolean; children: React.ReactNode }) {
	return (
		<section aria-label={label} data-slot="pickup-section" data-section={label.toLowerCase()} className="flex flex-col pb-3">
			<Divider now={now}>{label}</Divider>
			{children}
		</section>
	);
}

/**
 * Now's press, stretched over its whole container (`relative`) so the
 * container is the press: a link to the session it opens, else a button
 * that starts one. It carries the press word in the accent with an arrow,
 * so the row says what it does. Siblings with `relative z-10` stay their
 * own controls.
 */
export function NowPress({ now, busy, onAct, className }: { now: NowItem; busy: boolean; onAct?: () => void; className?: string }) {
	const press = cn(
		"flex shrink-0 items-center gap-1 text-row font-medium text-link outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
		className,
	);
	const words = (
		<>
			{now.press}
			<ArrowRightIcon aria-hidden className="size-4 transition-transform duration-150 group-hover/now:translate-x-0.5 motion-reduce:transition-none" />
		</>
	);
	return now.chat ? (
		<Link href={`/chat/${now.chat}`} data-slot="pickup-now-press" aria-disabled={busy || undefined} onClick={busy ? (event) => event.preventDefault() : undefined} className={press}>
			{words}
		</Link>
	) : (
		<button type="button" data-slot="pickup-now-press" disabled={busy || !onAct} onClick={onAct} className={cn(press, "disabled:opacity-50")}>
			{words}
		</button>
	);
}

/** The icon Now leads with, the app's own for the same thing: the reply mark in the accent, the tutor's spinner, the review
 *  clock, the task bookmark, or the topic's pie (a dashed ring while the
 *  head line is silent). */
export function ResumeIconMark({ icon, facts, className = "size-4" }: { icon: ResumeIcon; facts: TopicFacts; className?: string }) {
	switch (icon) {
		case "reply":
			return <MessageCircleQuestionIcon aria-hidden className={`${className} shrink-0 text-link`} />;
		case "writing":
			return <BrailleSpinner className="shrink-0 text-muted-foreground" />;
		case "review":
			return <HistoryIcon aria-hidden className={`${className} shrink-0 text-muted-foreground`} />;
		case "task":
			return <BookmarkIcon aria-hidden className={`${className} shrink-0 text-muted-foreground`} />;
		case "standing":
			return facts.standing ? <TopicGlyph standing={facts.standing} /> : <CircleDashedIcon aria-hidden className={`${className} shrink-0 text-muted-foreground`} />;
	}
}

/** The icon Now leads with. */
export function NowIcon({ now, facts }: { now: NowItem; facts: HybridPaneProps["facts"] }) {
	return <ResumeIconMark icon={now.icon} facts={facts} />;
}

/** The map button of a lesson that planned, above a stretched press. */
export function MapToggle({ chat, shown, onShow, className }: { chat: string; shown: boolean; onShow: (id: string) => void; className?: string }) {
	return (
		<Hint label={shown ? "Its steps are on the map" : "Show its steps on the map"} side="left">
			<Button
				variant="quiet"
				size="icon-inline"
				data-slot="topic-map-toggle"
				aria-label="Show its steps on the map"
				aria-pressed={shown}
				onClick={() => onShow(chat)}
				className={cn("relative z-10", shown && "text-foreground", className)}
			>
				<WaypointsIcon aria-hidden />
			</Button>
		</Hint>
	);
}

/** Next: each other place that waits, in Home's one-line row. A session
 *  row is the history's own, with its map button. */
export function NextList({ items, busy, onTask, shown, onShow }: { items: readonly NextItem[] } & Pick<HybridPaneProps, "busy" | "onTask" | "shown" | "onShow">) {
	return (
		<ul className="flex flex-col">
			{items.map((item) => {
				if (item.kind === "session") return <SessionItem key={item.entry.chat.id} entry={item.entry} shown={item.entry.chat.id === shown} onShow={onShow} ends={{ above: false, below: false }} />;
				return (
					<li key={item.kind === "task" ? item.key : "review"}>
						<Button variant="quiet" data-slot="pickup-next" data-kind={item.kind} disabled={busy} onClick={() => onTask(item.opening)} className={ONE_LINE_ROW}>
							{item.kind === "task" ? <BookmarkIcon aria-label="Open task" className={ICON} /> : <HistoryIcon aria-label="Review" className={ICON} />}
							<span className="truncate text-row text-foreground">{item.kind === "task" ? item.title : item.words}</span>
							<span className="max-w-40 truncate text-label text-muted-foreground">{item.kind === "task" ? item.step : null}</span>
						</Button>
					</li>
				);
			})}
		</ul>
	);
}

/** Scheduled: the engine's next review, a date and not a control. */
export function ScheduledEntry({ words }: { words: string }) {
	return (
		<p data-slot="pickup-scheduled" className="grid h-10 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-4">
			<HistoryIcon aria-hidden className={ICON} />
			<span className="truncate text-row text-muted-foreground">{words}</span>
		</p>
	);
}

/** Earlier: the history's own days on its line, newest first. */
export function EarlierDays({ days, shown, onShow, titleOf }: { days: readonly TrailDay[]; titleOf: (handle: string) => string } & Pick<HybridPaneProps, "shown" | "onShow">) {
	return (
		<ol aria-label="Earlier" className="flex flex-col">
			{days.map((day, i) => (
				<DayItem key={day.day} day={day} shown={shown} onShow={onShow} titleOf={titleOf} first={i === 0} last={i === days.length - 1} />
			))}
		</ol>
	);
}

/** Where Now stands, under its words: the lesson's title, the step it
 *  stopped on, else what waits, then the step after. */
function NowLines({ now }: { now: NowItem }) {
	return (
		<span className="col-start-2 flex min-w-0 flex-col gap-0.5 text-label text-muted-foreground">
			{now.title && <span className="truncate text-row">{now.title}</span>}
			{now.step && (
				<span data-slot="pickup-step" className="line-clamp-2">
					{now.step.lead} <span className="text-foreground">{now.step.title}</span>
				</span>
			)}
			{now.detail && <span className="truncate">{now.detail}</span>}
			{now.then && (
				<span data-slot="pickup-then" className="line-clamp-2">
					Then <span className="text-foreground/80">{now.then}</span>
				</span>
			)}
		</span>
	);
}

/**
 * Now as a row (the Sections and Now line options): its icon, what waits
 * and the press on top, where it stands under them, the whole row the
 * press. Bleeds 12px as Home's row. `marked` draws the accent rule down its
 * left edge so the eye lands there first; the lesson on the map has the
 * row filled, as the history's rows do.
 */
export function NowRow({ now, facts, busy, onAct, shown, onShow, marked }: { now: NowItem; marked: boolean } & Pick<HybridPaneProps, "facts" | "busy" | "onAct" | "shown" | "onShow">) {
	const onMap = now.chat !== null && now.chat === shown;
	return (
		<div
			data-slot="pickup-now"
			data-action={now.kind}
			data-shown={onMap || undefined}
			className={cn(
				"group/now relative -mx-3 grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-lg px-3 py-3 transition-colors hover:bg-fill-hover motion-reduce:transition-none",
				onMap && "bg-fill-selected hover:bg-fill-selected",
				marked && "before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-link",
			)}
		>
			<NowIcon now={now} facts={facts} />
			<span className="truncate text-control font-medium text-foreground">{now.words}</span>
			<NowPress now={now} busy={busy} onAct={onAct} className="justify-self-end" />
			<NowLines now={now} />
			{now.chat && facts.sessions.some((entry) => entry.chat.id === now.chat && entry.plan?.tree.nodes.length) && (
				<MapToggle chat={now.chat} shown={onMap} onShow={onShow} className="col-start-3 self-end justify-self-end" />
			)}
		</div>
	);
}
