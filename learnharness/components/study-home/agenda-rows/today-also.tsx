import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TodayRow } from "@/components/study-home/study-facts";

/** Past five courses, the last line: "Also today:" and each further course
 *  as a quiet button that opens its lesson. */
export function TodayAlso({ rows, busy, onContinue, className }: { rows: readonly TodayRow[]; busy: boolean; onContinue: (workspace: string) => void; className?: string }) {
	return (
		<li data-slot="today-also" className={cn("flex h-13 items-center gap-1 text-row text-muted-foreground", className)}>
			Also today:
			{rows.map((row) =>
				row.kind === "session" ? (
					<Button key={row.chat.id} variant="quiet" size="sm" asChild className="text-row font-normal text-foreground">
						<Link href={`/chat/${row.chat.id}`}>{row.course ? row.course.map.title : row.chat.title}</Link>
					</Button>
				) : (
					<Button
						key={row.course.map.workspace}
						variant="quiet"
						size="sm"
						disabled={busy}
						onClick={() => onContinue(row.course.map.workspace)}
						className="text-row font-normal text-foreground"
					>
						{row.course.map.title}
					</Button>
				),
			)}
		</li>
	);
}
