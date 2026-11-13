import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PULSE = "motion-reduce:animate-none";

/** The course header's place while the course is read (spec:
 *  course-header.md): the same three rows at the same heights, so nothing
 *  moves when the course arrives. Read as one busy region. */
export function CourseHeaderSkeleton({ className }: { className?: string }) {
	return (
		<div data-slot="course-header-skeleton" role="status" aria-label="Reading the course" className={cn("flex shrink-0 flex-col gap-2", className)}>
			<div className="flex h-8 items-center justify-between gap-4">
				<Skeleton className={cn("h-6 w-48", PULSE)} />
				<Skeleton className={cn("h-8 w-20", PULSE)} />
			</div>
			<div className="flex h-5 items-center">
				<Skeleton className={cn("h-3.5 w-80", PULSE)} />
			</div>
			<div className="flex h-5 items-center">
				<Skeleton className={cn("h-3.5 w-64", PULSE)} />
			</div>
		</div>
	);
}
