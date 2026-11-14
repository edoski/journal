import { Skeleton } from "@/components/ui/skeleton";

/** The sidebar's list while the courses are read: three 60px cards'
 *  places, so nothing moves when the cards arrive. */
export function NowSkeleton() {
	return (
		<li data-slot="now-skeleton" aria-busy className="flex list-none flex-col">
			<span className="sr-only">Loading</span>
			{[0, 1, 2].map((i) => (
				<span key={i} className="block py-0.5">
					<Skeleton className="h-[3.75rem] rounded-md motion-reduce:animate-none" />
				</span>
			))}
		</li>
	);
}
