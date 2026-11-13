"use client";

import { useMemo, useState } from "react";
import { useCalendarController, type DayHeaderInfo, type EventInput } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, MoonIcon } from "lucide-react";
import type { CalendarCourse, ScheduledDay } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventCalendarViews } from "@/components/ui/event-calendar-views";
import { EventCalendarCloseIcon } from "@/components/event-calendar-icons";
import { SidebarToggle } from "@/components/sidebar";
import { CourseScope } from "@/components/unit-inbox/course-scope";
import { CalendarEntryView, type StartSession } from "@/components/calendar/calendar-entry";
import { quietBetween, studyTimeWords, type CalendarEntry } from "@/components/calendar/calendar-facts";
import { cn } from "@/lib/utils";

/** The two views, Week first: the days of the week as columns, then the
 *  month around them. */
export const CALENDAR_VIEWS = [
	{ id: "dayGridWeek", words: "Week", quiet: "Nothing scheduled this week" },
	{ id: "dayGridMonth", words: "Month", quiet: "Nothing scheduled this month" },
] as const;

const PLUGINS = [dayGridPlugin];

/** The day grid's rows: an entry's own face draws it, so the row adds
 *  only its inset; More is a quiet text row. */
const DAY_GRID = {
	rowEventClass: "mx-1 mb-0.5",
	rowEventInnerClass: "",
	rowMoreLinkClass: "mx-1 mb-0.5 rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground",
	rowMoreLinkInnerClass: "px-1.5 py-0.5 text-label",
};

const VIEW_KEY = "lh:calendar-view";

/** The view he last picked, Week until he picks one. */
function storedView(): string {
	try {
		const stored = localStorage.getItem(VIEW_KEY);
		return CALENDAR_VIEWS.find((v) => v.id === stored)?.id ?? CALENDAR_VIEWS[0].id;
	} catch {
		return CALENDAR_VIEWS[0].id;
	}
}

/** A date as the engine writes it, from the calendar's UTC midnight. */
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2 to 8 Nov 2026" for a week, "November 2026" for a month. */
function rangeTitle(view: string, start: Date, end: Date): string {
	if (view === "dayGridMonth") return MONTH.format(new Date((start.getTime() + end.getTime()) / 2));
	const last = new Date(end.getTime() - 86_400_000);
	const year = last.getUTCFullYear();
	return start.getUTCMonth() === last.getUTCMonth()
		? `${start.getUTCDate()} to ${DAY_MONTH.format(last)} ${year}`
		: `${DAY_MONTH.format(start)} to ${DAY_MONTH.format(last)} ${year}`;
}

/** A week's day head: the weekday, the date (today's filled), and the
 *  Journal's study time for that day, or Day off. */
function DayHead({ info, schedule }: { info: DayHeaderInfo; schedule: ReadonlyMap<string, ScheduledDay> }) {
	const day = schedule.get(isoDay(info.date));
	const words = studyTimeWords(day);
	return (
		<div data-slot="calendar-day-head" data-today={info.isToday || undefined} className="flex w-full min-w-0 flex-col items-start gap-1 px-2 pb-2 pt-1">
			<div className="flex items-center gap-1.5">
				<span className="text-label text-muted-foreground">{info.weekdayText}</span>
				<span
					className={cn(
						"flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-control tabular-nums",
						info.isToday ? "bg-foreground font-semibold text-background" : "text-foreground",
					)}
				>
					{info.dayNumberText}
				</span>
			</div>
			{words && (
				<span className="flex min-w-0 items-center gap-1 text-label text-muted-foreground">
					{day?.off ? <MoonIcon aria-hidden className="size-3.5 shrink-0" /> : <ClockIcon aria-hidden className="size-3.5 shrink-0" />}
					<span className="truncate">{words}</span>
				</span>
			)}
		</div>
	);
}

/**
 * The calendar (spec: calendar.md): a toolbar (the sidebar's toggle,
 * Today, back and forward, the range, the course filter and Week or
 * Month, the last one picked) over FullCalendar's day grid, every entry drawn by
 * CalendarEntryView. Week shows each day's study time in its head; the
 * day grid fills the window and folds what does not fit under More.
 */
export function CalendarView({
	courses,
	entries,
	schedule,
	today,
	scope,
	onScopeChange,
	busy,
	onStart,
}: {
	courses: readonly CalendarCourse[];
	entries: readonly CalendarEntry[];
	schedule: readonly ScheduledDay[];
	today: string;
	scope: string | null;
	onScopeChange: (scope: string | null) => void;
	busy: boolean;
	onStart: StartSession;
}) {
	const controller = useCalendarController();
	const [initialView] = useState(storedView);
	const changeView = (next: string) => {
		controller.changeView(next);
		try {
			localStorage.setItem(VIEW_KEY, next);
		} catch {}
	};
	const view = controller.view;
	const viewId = view?.type ?? initialView;
	const compact = viewId === "dayGridMonth";
	const days = useMemo(() => new Map(schedule.map((day) => [day.date, day])), [schedule]);
	const events = useMemo<EventInput[]>(
		() => entries.map((entry, order) => ({ id: entry.id, title: entry.title, start: entry.day, allDay: true, extendedProps: { entry, order } })),
		[entries],
	);
	const quiet = view ? quietBetween(entries, isoDay(view.currentStart), isoDay(view.currentEnd)) : false;
	const words = CALENDAR_VIEWS.find((v) => v.id === viewId) ?? CALENDAR_VIEWS[0];

	return (
		<div data-slot="calendar" className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<header data-slot="calendar-toolbar" className="relative z-10 flex h-13 shrink-0 items-center gap-3 px-3">
				<SidebarToggle />
				<div className="lh-no-drag flex items-center gap-1">
					<Button variant="quiet" size="sm" onClick={() => controller.today()} className="text-foreground">
						Today
					</Button>
					<Hint label={`Previous ${words.words.toLowerCase()}`}>
						<Button variant="quiet" size="icon-row" aria-label={`Previous ${words.words.toLowerCase()}`} onClick={() => controller.prev()}>
							<ChevronLeftIcon />
						</Button>
					</Hint>
					<Hint label={`Next ${words.words.toLowerCase()}`}>
						<Button variant="quiet" size="icon-row" aria-label={`Next ${words.words.toLowerCase()}`} onClick={() => controller.next()}>
							<ChevronRightIcon />
						</Button>
					</Hint>
				</div>
				<h1 data-slot="calendar-range" className="min-w-0 truncate text-subheading font-semibold text-foreground">
					{view ? rangeTitle(viewId, view.currentStart, view.currentEnd) : ""}
				</h1>
				<div className="lh-no-drag ml-auto flex items-center gap-3">
					<CourseScope courses={courses} scope={scope} onScopeChange={onScopeChange} />
					<Tabs value={viewId} onValueChange={changeView}>
						<TabsList variant="line">
							{CALENDAR_VIEWS.map((v) => (
								<TabsTrigger key={v.id} value={v.id} data-testid={`calendar-view-${v.words.toLowerCase()}`}>
									{v.words}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
			</header>
			<main className="relative min-h-0 flex-1 px-3 pb-3">
				<EventCalendarViews
					controller={controller}
					plugins={PLUGINS}
					initialView={initialView}
					initialDate={today}
					now={today}
					timeZone="UTC"
					firstDay={1}
					height="100%"
					expandRows
					dayMaxEvents
					navLinks
					navLinkDayClick="dayGridWeek"
					events={events}
					eventOrder="order"
					eventColor="transparent"
					eventClass=""
					eventDisplay="block"
					blockEventClass="border-0"
					rowEventClass=""
					rowEventInnerClass=""
					blockEventInnerClass="min-w-0"
					eventContent={(info) => (
						<CalendarEntryView entry={info.event.extendedProps.entry as CalendarEntry} today={today} compact={compact} busy={busy} onStart={onStart} />
					)}
					moreLinkContent="More"
					views={{ dayGrid: DAY_GRID }}
					dayHeaderAlign="start"
					dayHeaderClass="border-border/60"
					dayHeaderInnerClass="flex w-full"
					dayHeaderContent={(info) =>
						compact ? <span className="px-2 pb-2 pt-1 text-label text-muted-foreground">{info.weekdayText}</span> : <DayHead info={info} schedule={days} />
					}
					dayCellClass={(info) => cn("border border-border/60", info.isDisabled && "bg-transparent")}
					dayCellTopClass={compact ? "flex flex-row justify-start" : "hidden"}
					dayCellTopInnerClass={(info) =>
						cn(
							"m-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-row tabular-nums",
							info.isToday ? "bg-foreground font-semibold text-background" : info.isOther ? "text-muted-foreground/60" : "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
						)
					}
					dayHeaderRowClass="border-0"
					dayRowClass="border-border/60"
					tableHeaderClass="bg-background"
					popoverCloseContent={() => <EventCalendarCloseIcon />}
				/>
				{quiet && (
					<p data-slot="calendar-quiet" className="pointer-events-none absolute inset-0 flex items-center justify-center text-row text-muted-foreground">
						{words.quiet}
					</p>
				)}
			</main>
		</div>
	);
}
