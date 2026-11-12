import { spanWords, type Lesson } from "@/components/study-home/lesson-facts";
import { cn } from "@/lib/utils";

/**
 * A lesson in up to three lines (spec: lessons.md): its course with the
 * exam and its place in the course's path, the lesson by name, then what
 * follows. `place` off leaves the place to a home that draws it.
 */
export function LessonText({ lesson, place = true, className }: { lesson: Lesson; place?: boolean; className?: string }) {
	return (
		<span data-slot="lesson-text" className={cn("flex min-w-0 flex-col gap-0.5", className)}>
			<span className="flex min-w-0 flex-wrap items-baseline gap-x-3 text-label">
				<span className="max-w-full truncate text-foreground">{lesson.courseTitle}</span>
				{lesson.exam && <span className="shrink-0 text-muted-foreground">{lesson.exam}</span>}
				{place && lesson.place && <span className="shrink-0 text-muted-foreground tabular-nums">{spanWords(lesson.place)}</span>}
			</span>
			<span className="line-clamp-3 text-control font-medium text-pretty text-foreground">{lesson.title}</span>
			{lesson.detail && <span className="truncate text-label text-muted-foreground">{lesson.detail}</span>}
		</span>
	);
}
