import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PULSE = "motion-reduce:animate-none";

/** The course header's place while the course is read (spec:
 *  course-head/course-head.md): the compact page head's two rows at their
 *  heights, the title row and the one line under it, so the head does not
 *  move when the course arrives. Read as one busy region. */
export function CourseHeaderSkeleton({ className }: { className?: string }) {
	return (
		<div data-slot="course-header-skeleton" role="status" aria-label="Reading the course" className={cn("flex shrink-0 flex-col gap-1 border-b border-border/60 pb-4", className)}>
			<div className="flex h-8 items-center justify-between gap-4">
				<Skeleton className={cn("h-6 w-48", PULSE)} />
				<Skeleton className={cn("h-6 w-40", PULSE)} />
			</div>
			<div className="mt-1 flex h-5 items-center">
				<Skeleton className={cn("h-3.5 w-64", PULSE)} />
			</div>
		</div>
	);
}
