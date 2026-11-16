"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRightIcon, BookmarkIcon, BookOpenIcon, ChevronDownIcon, CircleDashedIcon, HistoryIcon, MessageCircleQuestionIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIRST_LESSON, LESSON_GOES_ON, moreWords } from "@/components/study-words";
import { daysThatFit } from "@/components/unit-inbox/topic-page/pickup/earlier-fit";
import { Button } from "@/components/ui/button";
import { AttemptEntry, SessionItem, type Ends } from "@/components/unit-inbox/topic-page/hybrid/history";
import type { HybridPaneProps } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { BrailleSpinner } from "@/components/braille-spinner";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { BLEED, GUTTER, HAIRLINE, NOW_RULE, ONE_LINE_ROW, TWO_LINE_ROW, WRAPPING_ROW } from "@/components/unit-inbox/topic-page/row-classes";
import type { TrailDay } from "@/components/unit-inbox/topic-page/trail/trail-facts";
import type { NextItem, NowIconKind, NowItem } from "@/components/unit-inbox/topic-page/pickup/pickup-facts";
import type { BuildsOn, StartsReason, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { STARTS_ICON } from "@/components/study-home/agenda-rows/why-mark";
import type { TopicRef } from "@/src/core";
import { MathText } from "@/components/ui/math-text";
import { LineText } from "@/components/line-text";

const ICON = "size-4 text-muted-foreground";

/** A section's quiet label: its word, then a hairline to the column's end.
 *  `now` draws it in the accent, as a calendar's line for the present. */
export function Divider({ children, now = false }: { children: string; now?: boolean }) {
	return (
		<h2
			data-slot="pickup-divider"
			className={cn(
				"flex h-8 items-center gap-3 text-callout after:h-px after:flex-1",
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
		"flex shrink-0 items-center gap-1 text-body text-link outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
		className,
	);
	const words = (
		<>
			{now.press}
			<ArrowRightIcon aria-hidden className="size-4 transition-transform duration-150 group-hover/now:translate-x-0.5 motion-reduce:transition-none" />
		</>
	);
	return now.chat ? (
		<Link href={now.href ?? `/chat/${now.chat}`} data-slot="pickup-now-press" aria-disabled={busy || undefined} onClick={busy ? (event) => event.preventDefault() : undefined} className={press}>
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
export function NowIconMark({ icon, facts, className = "size-4" }: { icon: NowIconKind; facts: TopicFacts; className?: string }) {
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
	return <NowIconMark icon={now.icon} facts={facts} />;
}

/** Next: each other place that waits, in Home's one-line row. A session
 *  row is the history's own, with its map button. */
export function NextList({ items, busy, onTask, shown, onShow }: { items: readonly NextItem[] } & Pick<HybridPaneProps, "busy" | "onTask" | "shown" | "onShow">) {
	return (
		<ul className="flex flex-col">
			{items.map((item) => {
				if (item.kind === "session") return <SessionItem key={item.entry.chat.id} entry={item.entry} shown={item.entry.chat.id === shown} onShow={onShow} ends={{ above: false, below: false }} writing="Tutor writing" />;
				return (
					<li key={item.kind === "task" ? item.key : "review"}>
						<Button variant="quiet" data-slot="pickup-next" data-kind={item.kind} disabled={busy} onClick={() => onTask(item.press)} className={item.kind === "task" && item.step ? TWO_LINE_ROW : ONE_LINE_ROW}>
							{item.kind === "task" ? <BookmarkIcon aria-label="Unfinished" className={ICON} /> : <HistoryIcon aria-label="Review" className={ICON} />}
							<span className="col-span-2 truncate text-body text-foreground"><LineText>{item.kind === "task" ? item.title : item.words}</LineText></span>
							{item.kind === "task" && item.step && (
								<span data-slot="pickup-next-step" className="col-span-2 col-start-2 truncate text-callout text-muted-foreground">
									<MathText>{item.step}</MathText>
								</span>
							)}
						</Button>
					</li>
				);
			})}
		</ul>
	);
}

/** Builds on: each topic this one builds on as a row, its pie, its title
 *  (two lines at most, never cut to one)
 *  and where he stands on it in the pie's words, opening its page; a
 *  pointer or focus on a row tells the page (`onPoint`), so the map beside
 *  can light it. */
export function BuildsOnList({ builds, onPoint }: { builds: readonly BuildsOn[]; onPoint?: (handle: string | null) => void }) {
	return (
		<ul className="flex flex-col">
			{builds.map(({ topic, standing, words, href }) => (
				<li key={topic.handle} className={HAIRLINE}>
					<Link
						href={href}
						data-slot="pickup-builds-on"
						data-topic={topic.handle}
						onMouseEnter={() => onPoint?.(topic.handle)}
						onMouseLeave={() => onPoint?.(null)}
						onFocus={() => onPoint?.(topic.handle)}
						onBlur={() => onPoint?.(null)}
						className={cn(WRAPPING_ROW, "outline-none transition-colors duration-150 hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none")}
					>
						<TopicGlyph standing={standing} />
						<span data-slot="pickup-builds-on-title" className="line-clamp-2 text-body text-foreground">
							<LineText>{topic.title}</LineText>
						</span>
						<span data-slot="pickup-builds-on-standing" className="text-callout text-muted-foreground">
							{words}
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

/** In your material: each place his material covers the topic, the place
 *  in it ("Section 4.7") over the source's title. Words, not a control. */
export function MaterialList({ refs }: { refs: readonly TopicRef[] }) {
	return (
		<ul className="flex flex-col">
			{refs.map((ref, i) => (
				<li key={`${ref.source}#${ref.locator ?? i}`} data-slot="pickup-material" className={cn(ref.locator ? TWO_LINE_ROW : ONE_LINE_ROW, "mx-0 w-full pr-0 has-[>svg]:pr-0", GUTTER)}>
					<BookOpenIcon aria-hidden className={ICON} />
					<span className="col-span-2 truncate text-body text-foreground">{ref.locator ?? ref.source}</span>
					{ref.locator && <span className="col-span-2 col-start-2 truncate text-callout text-muted-foreground">{ref.source}</span>}
				</li>
			))}
		</ul>
	);
}

/** Why the plan starts a topic not started when it does, as Home's rows
 *  say it: its icon and the whole sentence, 12 muted, wrapping rather than
 *  cut. */
export function StartsWhyLine({ why, className }: { why: StartsReason; className?: string }) {
	const Icon = STARTS_ICON[why.kind];
	return (
		<span data-slot="topic-starts-why" data-kind={why.kind} className={cn("flex items-start gap-1.5 text-callout text-muted-foreground", className)}>
			<Icon aria-hidden className="mt-0.5 size-3 shrink-0" />
			<MathText>{why.words}</MathText>
		</span>
	);
}

/** Scheduled: the engine's next review or a topic's first lesson, why it
 *  waits when something comes first, and its day in the date column; a
 *  first lesson also says why it comes then. A date, not a control. */
export function ScheduledEntry({ kind, day, waits, why }: { kind: "review" | "start" | "lesson"; day: string; waits: string | null; why?: StartsReason | null }) {
	const Icon = kind === "review" ? HistoryIcon : BookOpenIcon;
	return (
		<p data-slot="pickup-scheduled" data-kind={kind} className={cn("grid min-h-10 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-4", GUTTER, (waits || why) && "py-2")}>
			<Icon aria-hidden className={ICON} />
			<span className="truncate text-body text-muted-foreground">{kind === "review" ? "Review" : kind === "lesson" ? LESSON_GOES_ON : FIRST_LESSON}</span>
			<span data-slot="topic-history-date" className="text-callout text-muted-foreground tabular-nums">
				{day}
			</span>
			{why && <StartsWhyLine why={why} className="col-span-2 col-start-2" />}
			{waits && (
				<span data-slot="pickup-scheduled-waits" className="col-span-2 col-start-2 text-callout text-muted-foreground">
					{waits}
				</span>
			)}
		</p>
	);
}

/** The "Show the rest" row's height, which the days that fit leave room for. */
const MORE_ROW = 36;

/** Earlier: the history's sessions and attempts on its line, newest
 *  first, each session followed by the attempts it saved (`trailDays`),
 *  each day's words in the date column of its first row. The days that
 *  fit the pane whole (`daysThatFit`), then "Show the rest" for the older
 *  ones, so the list never runs off the window's bottom edge (round 11,
 *  1, shot 41); measured with every day drawn, again when the pane's
 *  height or the days change. */
export function EarlierDays({ days, shown, onShow, titleOf }: { days: readonly TrailDay[]; titleOf: (handle: string) => string } & Pick<HybridPaneProps, "shown" | "onShow">) {
	const list = useRef<HTMLOListElement>(null);
	const [fit, setFit] = useState<number | null>(null);
	const [expanded, setExpanded] = useState(false);
	const signature = days.map((day) => `${day.day}:${day.rows.length}`).join(",");
	const [measured, setMeasured] = useState(signature);
	if (measured !== signature) {
		setMeasured(signature);
		setFit(null);
	}
	useLayoutEffect(() => {
		if (expanded || fit !== null) return;
		const ol = list.current;
		const pane = ol?.closest<HTMLElement>('[data-slot="topic-history"]');
		if (!ol || !pane) return;
		const top = pane.getBoundingClientRect().top - pane.scrollTop;
		let at = 0;
		const ends = days.map((day) => {
			at += day.rows.length;
			return (ol.children[at - 1]?.getBoundingClientRect().bottom ?? top) - top;
		});
		setFit(daysThatFit(ends, pane.clientHeight, MORE_ROW));
	}, [days, expanded, fit]);
	useLayoutEffect(() => {
		const pane = list.current?.closest<HTMLElement>('[data-slot="topic-history"]');
		if (!pane) return;
		let height = pane.clientHeight;
		const observer = new ResizeObserver(() => {
			if (pane.clientHeight === height) return;
			height = pane.clientHeight;
			setFit(null);
		});
		observer.observe(pane);
		return () => observer.disconnect();
	}, []);
	const drawn = expanded || fit === null ? days : days.slice(0, fit);
	const count = drawn.reduce((n, day) => n + day.rows.length, 0);
	let at = 0;
	const ends = (): Ends => {
		const i = at++;
		return { above: i > 0, below: i < count - 1 };
	};
	return (
		<>
			<ol ref={list} aria-label="Earlier" className="flex flex-col">
				{drawn.flatMap((day) =>
					day.rows.map((row, i) => {
						const date = i === 0 ? day.label : null;
						return row.kind === "session" ? (
							<SessionItem key={row.entry.chat.id} entry={row.entry} shown={row.entry.chat.id === shown} onShow={onShow} ends={ends()} date={date} writing="Tutor writing" />
						) : (
							<AttemptEntry key={row.attempt.id} attempt={row.attempt} title={row.title} titleOf={titleOf} ends={ends()} date={date} />
						);
					}),
				)}
			</ol>
			{drawn.length < days.length && (
				<Button variant="list" size="row" data-slot="pickup-earlier-more" onClick={() => setExpanded(true)} className={cn(BLEED, "h-9 justify-start gap-4 duration-150")}>
					<ChevronDownIcon aria-hidden className="size-4 shrink-0" />
					{moreWords(1, Infinity)}
				</Button>
			)}
		</>
	);
}

/**
 * Now as a row: its icon, what to pick up and the press on top, where it
 * stands in a few words under them, the whole row the press. Bleeds 12px
 * as Home's row. A plain row like the rest of the list, no fill or box at
 * rest: its weight is its type and, when `marked`, the accent rule in
 * the rows' shared gutter, on the section label's x, so the eye lands
 * there first.
 */
export function NowRow({ now, facts, busy, onAct, shown, onShow, marked }: { now: NowItem; marked: boolean } & Pick<HybridPaneProps, "facts" | "busy" | "onAct" | "shown" | "onShow">) {
	const onMap = now.chat !== null && now.chat === shown;
	// Pointing at Now puts its lesson's steps back on the map, as pointing at any lesson row does (round 10, 1 m8).
	const planned = now.chat !== null && facts.sessions.some((entry) => entry.chat.id === now.chat && entry.plan?.tree.nodes.length);
	const point = planned && now.chat ? () => onShow(now.chat!) : undefined;
	return (
		<div
			data-slot="pickup-now"
			data-on-map={planned ? "point" : undefined}
			onPointerEnter={point}
			onFocus={point}
			data-action={now.kind}
			data-shown={onMap || undefined}
			className={cn(
				"group/now relative grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-lg py-3 transition-colors hover:bg-fill-hover motion-reduce:transition-none",
				BLEED,
				marked && NOW_RULE,
			)}
		>
			<NowIcon now={now} facts={facts} />
			<span data-slot="pickup-now-words" className="line-clamp-2 text-headline text-foreground">
				<LineText>{now.words}</LineText>
			</span>
			<NowPress now={now} busy={busy} onAct={onAct} className="justify-self-end" />
			{/* The note wraps whole, and Now carries no reason line under it: why the topic comes now is the pane's
			    Builds on and In your material (round 12, 3 n9: "Planned Thu 12 Nov, after Probabi…" cut, with a
			    two-line reason under it). */}
			{now.note && (
				<span data-slot="pickup-now-note" className="col-start-2 text-pretty text-callout text-muted-foreground">
					<MathText>{now.note}</MathText>
				</span>
			)}
		</div>
	);
}
