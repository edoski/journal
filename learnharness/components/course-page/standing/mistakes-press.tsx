"use client";

import type { ReactElement } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { MISTAKE_WORDS } from "@/components/study-words";
import { MistakeList } from "@/components/course-page/standing/mistake-list";
import type { MistakeRow } from "@/components/course-page/standing/standing-model";

/** The head the Mistakes popover hangs from: it opens under the whole
 *  head, never under its press alone, so it covers none of the head's
 *  lines however far the readiness line runs (round 9, 2 m2: hung from
 *  the press, it covered Linear Algebra's two-row readiness line). */
export function MistakesHead({ children }: { children: ReactElement }) {
	return (
		<Popover>
			{/* Radix's own anchor: the shadcn one would stamp its data-slot over the head's. */}
			<PopoverPrimitive.Anchor asChild>{children}</PopoverPrimitive.Anchor>
		</Popover>
	);
}

/** Mistakes, in the head's actions, inside `MistakesHead`: a quiet press
 *  that opens the open mistakes, newest first, each a row that starts
 *  fixing it. Absent when none is open. */
export function MistakesPress({ rows }: { rows: readonly MistakeRow[] }) {
	if (rows.length === 0) return null;
	return (
		<>
			<PopoverTrigger asChild>
				<Button variant="quiet" size="row" data-slot="course-mistakes">
					<CircleAlertIcon aria-hidden />
					{MISTAKE_WORDS.press}
				</Button>
			</PopoverTrigger>
			<PopoverContent data-slot="course-mistakes-list" align="end" collisionPadding={12} className="p-3">
				<PopoverHeader className="px-1 pb-1">
					<PopoverTitle>{MISTAKE_WORDS.title}</PopoverTitle>
				</PopoverHeader>
				<div className="-mx-1 max-h-[28rem] overflow-y-auto px-1">
					<MistakeList rows={rows} className="px-3" />
				</div>
			</PopoverContent>
		</>
	);
}
