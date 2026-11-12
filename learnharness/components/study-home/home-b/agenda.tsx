import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { HomeProps } from "@/components/study-home/home-props";
import { TopicStrip } from "@/components/study-home/topic-strip";
import { WaitingRow } from "@/components/study-home/waiting-row";
import {
	addDays,
	byUrgency,
	examWords,
	nextStepOf,
	nextUp,
	shortDay,
	stepDetail,
	stepWords,
	topicMarks,
	upcomingReviews,
	type NextUp,
} from "@/components/study-home/study-facts";
import { courseLabel, type StudyCourse } from "@/src/core";

/**
 * Candidate B, the agenda (spec: agenda.md): one ordered list from now to
 * the last exam, with courses as labels rather than containers. Now holds
 * the page's one primary action; Today the rest of the day's steps; the
 * week the reviews the engine scheduled, day by day; then the exams.
 */
export function Agenda({ courses, waiting, today, busy, onContinue }: HomeProps) {
	const now = nextUp(courses, waiting);
	const ordered = byUrgency(courses);
	const later = ordered.filter((c) => !(now.kind === "course" && now.course === c) && nextStepOf(c).kind !== "none");
	const week = upcomingReviews(courses);
	const days = [...new Set(week.map((r) => r.date))];
	const exams = ordered.filter((c) => c.map.exam && c.map.exam.daysLeft >= 0).sort((a, b) => a.map.exam!.daysLeft - b.map.exam!.daysLeft);
	const otherWaiting = now.kind === "session" ? waiting.slice(1) : waiting;

	return (
		<div data-slot="agenda" className="flex flex-col gap-10">
			{now.kind !== "none" && <NowRow now={now} busy={busy} onContinue={onContinue} />}
			{(otherWaiting.length > 0 || later.length > 0) && (
				<Section id="agenda-today" title="Today">
					{otherWaiting.map((chat) => (
						<WaitingRow key={chat.id} chat={chat} />
					))}
					{later.map((course) => (
						<StepRow key={course.map.workspace} course={course} busy={busy} onContinue={onContinue} />
					))}
				</Section>
			)}
			{days.length > 0 && (
				<Section id="agenda-week" title="This week">
					{days.map((day) => (
						<div key={day} data-slot="agenda-day" className="grid grid-cols-[6rem_1fr] gap-x-4 py-2">
							<span className="text-label text-muted-foreground tabular-nums">{day === addDays(today, 1) ? "Tomorrow" : shortDay(day)}</span>
							<ul className="flex flex-col gap-1">
								{week
									.filter((r) => r.date === day)
									.map((r) => (
										<li key={`${r.workspace}:${r.topic}`} className="flex items-baseline justify-between gap-4">
											<span className="truncate text-row text-foreground">Review {r.topic}</span>
											<span className="shrink-0 text-label text-muted-foreground">{r.course}</span>
										</li>
									))}
							</ul>
						</div>
					))}
				</Section>
			)}
			{exams.length > 0 && (
				<Section id="agenda-exams" title="Exams">
					{exams.map((course) => (
						<div key={course.map.workspace} data-slot="agenda-exam" className="grid grid-cols-[6rem_1fr] items-center gap-x-4 py-2">
							<span className="text-label text-muted-foreground tabular-nums">{shortDay(course.map.exam!.date)}</span>
							<div className="flex flex-col gap-2">
								<div className="flex items-baseline justify-between gap-4">
									<span className="truncate text-row text-foreground">{course.map.title}</span>
									<span className="shrink-0 text-label text-muted-foreground tabular-nums">{examWords(course)}</span>
								</div>
								<TopicStrip marks={topicMarks(course)} />
							</div>
						</div>
					))}
				</Section>
			)}
		</div>
	);
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
	return (
		<section aria-labelledby={id} className="flex flex-col gap-1">
			<h2 id={id} className="mb-1 text-label font-semibold text-muted-foreground">
				{title}
			</h2>
			{children}
		</section>
	);
}

/** The one step worth doing now, as the page's only primary action. */
function NowRow({ now, busy, onContinue }: { now: Exclude<NextUp, { kind: "none" }>; busy: boolean; onContinue: (workspace: string) => void }) {
	const title = now.kind === "session" ? now.chat.title : stepWords(now.step);
	const meta =
		now.kind === "session"
			? `${now.chat.course ? courseLabel(now.chat.course) : "No course"}, your turn`
			: [now.course.map.title, examWords(now.course)].filter(Boolean).join(", ");
	const detail = now.kind === "course" ? stepDetail(now.step) : null;
	return (
		<section aria-labelledby="agenda-now" data-slot="agenda-now" className="flex flex-col gap-1">
			<h2 id="agenda-now" className="mb-1 text-label font-semibold text-muted-foreground">
				Now
			</h2>
			<div className="flex items-center justify-between gap-6 rounded-xl border border-border bg-card p-5">
				<div className="flex min-w-0 flex-col gap-1">
					<p className="text-control font-semibold text-foreground">{title}</p>
					{detail && <p className="text-row text-muted-foreground">{detail}</p>}
					<p className="text-label text-muted-foreground">{meta}</p>
				</div>
				{now.kind === "session" ? (
					<Button asChild disabled={busy} className="shrink-0 font-normal">
						<Link href={`/chat/${now.chat.id}`}>Open</Link>
					</Button>
				) : (
					<Button disabled={busy} onClick={() => onContinue(now.course.map.workspace)} className="shrink-0 font-normal">
						Continue
					</Button>
				)}
			</div>
		</section>
	);
}

/** A course's next step as a row; the whole row opens a lesson in it. */
function StepRow({ course, busy, onContinue }: { course: StudyCourse; busy: boolean; onContinue: (workspace: string) => void }) {
	return (
		<Button
			variant="quiet"
			data-slot="agenda-step"
			disabled={busy}
			onClick={() => onContinue(course.map.workspace)}
			className="-mx-3 h-10 justify-between gap-4 rounded-lg px-3 font-normal"
		>
			<span className="min-w-0 truncate text-row text-foreground">{stepWords(nextStepOf(course))}</span>
			<span className="shrink-0 text-label text-muted-foreground">{course.map.title}</span>
		</Button>
	);
}
