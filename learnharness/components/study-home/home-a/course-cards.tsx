import { Button } from "@/components/ui/button";
import type { HomeProps } from "@/components/study-home/home-props";
import { TopicStrip } from "@/components/study-home/topic-strip";
import { WaitingRow } from "@/components/study-home/waiting-row";
import {
	byUrgency,
	continueWords,
	examWords,
	lastStudiedWords,
	standingWords,
	topicMarks,
} from "@/components/study-home/study-facts";
import type { StudyCourse } from "@/src/core";

/**
 * Candidate A, course cards (spec: course-cards.md): every course answers
 * "where do I stand?" in one sentence and one strip, most urgent first,
 * each with its own Continue. Sessions waiting on the learner sit above.
 */
export function CourseCards({ courses, waiting, busy, onContinue }: HomeProps) {
	return (
		<div data-slot="course-cards" className="flex flex-col gap-8">
			{waiting.length > 0 && (
				<section aria-labelledby="home-waiting" className="flex flex-col gap-1">
					<h2 id="home-waiting" className="text-label font-semibold text-muted-foreground">
						Waiting on you
					</h2>
					{waiting.map((chat) => (
						<WaitingRow key={chat.id} chat={chat} />
					))}
				</section>
			)}
			<section aria-labelledby="home-courses" className="flex flex-col gap-3">
				<h2 id="home-courses" className="text-label font-semibold text-muted-foreground">
					Courses
				</h2>
				<ul className="flex flex-col gap-4">
					{byUrgency(courses).map((course) => (
						<li key={course.map.workspace}>
							<CourseCard course={course} busy={busy} onContinue={onContinue} />
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}

function CourseCard({ course, busy, onContinue }: { course: StudyCourse; busy: boolean; onContinue: (workspace: string) => void }) {
	const exam = examWords(course);
	const task = course.map.tasks.find((t) => t.key === course.map.focus) ?? course.map.tasks[0];
	return (
		<article data-slot="course-card" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
			<header className="flex items-baseline justify-between gap-4">
				<h3 className="truncate text-control font-semibold text-foreground">{course.map.title}</h3>
				<span className="shrink-0 text-label text-muted-foreground tabular-nums">{exam ?? lastStudiedWords(course.lastActiveDaysAgo)}</span>
			</header>
			<div className="flex flex-col gap-3">
				<p className="text-row text-foreground">{standingWords(course)}</p>
				<TopicStrip marks={topicMarks(course)} />
			</div>
			<footer className="flex items-center justify-between gap-4 border-t border-border pt-4">
				<div className="flex min-w-0 flex-col">
					<span className="truncate text-row text-foreground">{continueWords(course)}</span>
					<span className="truncate text-label text-muted-foreground">{task?.step ?? lastStudiedWords(course.lastActiveDaysAgo)}</span>
				</div>
				<Button size="sm" variant="secondary" disabled={busy} onClick={() => onContinue(course.map.workspace)} className="shrink-0 font-normal">
					Continue
				</Button>
			</footer>
		</article>
	);
}
