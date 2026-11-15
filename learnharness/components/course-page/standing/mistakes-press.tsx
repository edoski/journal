"use client";

import { CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { MISTAKE_WORDS } from "@/components/study-words";
import { MistakeList } from "@/components/course-page/standing/mistake-list";
import type { MistakeRow } from "@/components/course-page/standing/standing-model";

/** Mistakes, in the head's actions: a quiet press
 *  that opens the open mistakes, newest first, each a row that starts
 *  fixing it. Absent when none is open. */
export function MistakesPress({ rows }: { rows: readonly MistakeRow[] }) {
	if (rows.length === 0) return null;
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="quiet" size="row" data-slot="course-mistakes">
					<CircleAlertIcon aria-hidden />
					{MISTAKE_WORDS.press}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[26rem] p-3">
				<PopoverHeader className="px-1 pb-1">
					<PopoverTitle>{MISTAKE_WORDS.title}</PopoverTitle>
				</PopoverHeader>
				<div className="-mx-1 max-h-[28rem] overflow-y-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<MistakeList rows={rows} className="px-3" />
				</div>
			</PopoverContent>
		</Popover>
	);
}
