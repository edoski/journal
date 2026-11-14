"use client";

import Link from "next/link";
import { HandHelpingIcon } from "lucide-react";
import { ArcPill } from "@/components/course-map/arc-strip";
import { SLIP_ICON } from "@/components/slip-icons";
import { MISTAKE_WORDS } from "@/components/study-words";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MathLine } from "@/components/ui/math-line";
import { mathPlain } from "@/components/ui/math-text";
import { useStartUnit } from "@/components/unit-inbox/start-unit";
import type { MistakeRow } from "@/components/course-page/standing/standing-model";
import { cn } from "@/lib/utils";

/** Today's hybrid row, at the list's width: the mark beside two lines. */
const ROW = "-mx-3 flex h-12 w-[calc(100%+1.5rem)] items-center gap-3 rounded-lg px-3 text-left font-normal whitespace-normal";

/** One open mistake (spec: standing/standing.md): its slip's mark, the
 *  topic and its arc's bubble, then what went wrong in the tutor's words
 *  and when, a hand when it had help. The whole row starts fixing it:
 *  Resume the session that waits on the topic, else a new one on it. */
export function MistakeLine({ row, start, starting }: { row: MistakeRow; start: ReturnType<typeof useStartUnit>["start"]; starting: string | null }) {
	const Icon = SLIP_ICON[row.slip];
	const key = `${row.href}#mistake`;
	const body = (
		<>
			<Icon aria-hidden className={cn("size-4 shrink-0", row.slip === "confident" ? "text-warning" : "text-muted-foreground")} />
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex min-w-0 items-center gap-3">
					<MathLine className="min-w-0 flex-1 text-row font-medium text-foreground">{row.topic.title}</MathLine>
					{row.arc && <ArcPill arc={row.arc} className="max-w-36 shrink-0" />}
				</span>
				<span className="flex min-w-0 items-center gap-3 text-label text-muted-foreground">
					<MathLine className="min-w-0 flex-1">{row.words}</MathLine>
					<span className="inline-flex shrink-0 items-center gap-1.5">
						{row.helped && <HandHelpingIcon role="img" aria-label={MISTAKE_WORDS.helped} className="size-3.5" />}
						{row.when}
					</span>
				</span>
			</span>
		</>
	);
	const label = `${row.resume ? "Resume" : "Fix"}: ${mathPlain(row.topic.title)}`;
	const control = row.resume ? (
		<Button variant="quiet" asChild data-slot="mistake-row" aria-label={label} className={ROW}>
			<Link href={`/chat/${row.resume.id}`}>{body}</Link>
		</Button>
	) : (
		<Button
			variant="quiet"
			data-slot="mistake-row"
			aria-label={label}
			disabled={starting !== null}
			onClick={() => start({ key, topic: row.topic, course: { workspace: row.workspace } })}
			className={ROW}
		>
			{body}
		</Button>
	);
	return <li>{row.hint ? <Hint label={row.hint}>{control}</Hint> : control}</li>;
}

/** The open mistakes, newest first, each a row that starts fixing it. */
export function MistakeList({ rows, className }: { rows: readonly MistakeRow[]; className?: string }) {
	const { start, starting } = useStartUnit();
	return (
		<ul data-slot="mistake-list" aria-label={MISTAKE_WORDS.title} className={cn("flex flex-col", className)}>
			{rows.map((row) => (
				<MistakeLine key={row.topic.handle} row={row} start={start} starting={starting} />
			))}
		</ul>
	);
}
