import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { HomeProps } from "@/components/study-home/home-props";
import { TopicStrip } from "@/components/study-home/topic-strip";
import {
	byUrgency,
	examWords,
	lastStudiedWords,
	nextStepOf,
	nextUp,
	reviewTopics,
	stepWords,
	titleList,
	topicMarks,
} from "@/components/study-home/study-facts";
import { courseLabel, type StudyCourse } from "@/src/core";

/**
 * Candidate C, one table (spec: course-table.md): every course on one row so
 * they compare down the columns: the exam, the topics' strip, what to
 * review by name, and the next step with its Continue. The step worth
 * doing now leads the page in one line; a dot marks a row that needs you.
 */
export function CourseTable({ courses, waiting, busy, onContinue }: HomeProps) {
	const now = nextUp(courses, waiting);
	const needs = (c: StudyCourse) =>
		waiting.some((w) => w.course?.workspace === c.map.workspace) || reviewTopics(c).some((t) => t.weak);
	return (
		<div data-slot="course-table" className="flex flex-col gap-8">
			{now.kind !== "none" && (
				<section aria-labelledby="table-now" data-slot="course-table-now" className="flex flex-col gap-1">
					<h2 id="table-now" className="text-label font-semibold text-muted-foreground">Now</h2>
					<p className="flex flex-wrap items-baseline gap-x-1.5 text-row text-muted-foreground">
					{now.kind === "session" ? (
						<Link href={`/chat/${now.chat.id}`} className="rounded-sm text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
							Answer {now.chat.title} in {now.chat.course ? courseLabel(now.chat.course) : "No course"}
						</Link>
					) : (
						<span className="text-foreground">
							{stepWords(now.step)} in {now.course.map.title}
						</span>
					)}
					{waiting.length > 1 && <span>and {waiting.length - 1 === 1 ? "one more session" : "more sessions"} waiting on you</span>}
					</p>
				</section>
			)}
			<table className="w-full table-fixed border-collapse text-left">
				<colgroup>
					<col className="w-[22%]" />
					<col className="w-[14%]" />
					<col className="w-[18%]" />
					<col />
					<col className="w-24" />
				</colgroup>
				<thead>
					<tr className="border-b border-border text-label text-muted-foreground">
						<th scope="col" className="pb-2 font-semibold">Course</th>
						<th scope="col" className="pb-2 text-right font-semibold">Exam</th>
						<th scope="col" className="pb-2 pl-6 font-semibold">Topics</th>
						<th scope="col" className="pb-2 pl-6 font-semibold">Next</th>
						<th scope="col" className="pb-2"><span className="sr-only">Action</span></th>
					</tr>
				</thead>
				<tbody>
					{byUrgency(courses).map((course) => {
						const reviews = reviewTopics(course).map((t) => t.title);
						return (
							<tr key={course.map.workspace} data-slot="course-table-row" className="border-b border-border align-top">
								<td className="py-3 pr-4">
									<div className="flex items-center gap-2">
										<span className={needs(course) ? "size-1.5 shrink-0 rounded-full bg-link" : "size-1.5 shrink-0"} aria-hidden="true" />
										<span className="truncate text-control font-semibold text-foreground">{course.map.title}</span>
									</div>
									<span className="block pl-3.5 text-label text-muted-foreground">{lastStudiedWords(course.lastActiveDaysAgo)}</span>
								</td>
								<td className="py-3 text-right text-row text-foreground tabular-nums">{examWords(course)?.replace("Exam ", "") ?? "None"}</td>
								<td className="py-3 pl-6 pt-[1.1rem]">
									<TopicStrip marks={topicMarks(course)} />
								</td>
								<td className="min-w-0 py-3 pl-6">
									<span className="block truncate text-row text-foreground">{stepWords(nextStepOf(course))}</span>
									{reviews.length > 2 && <span className="block truncate text-label text-muted-foreground">Also due: {titleList(reviews.slice(2))}</span>}
								</td>
								<td className="py-2 text-right">
									<Button size="sm" variant="secondary" disabled={busy} onClick={() => onContinue(course.map.workspace)} className="font-normal">
										Continue
									</Button>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
