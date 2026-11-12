"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import type { StudyCourse } from "@/src/core";
import { examText } from "@/components/start/course-facts";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ALL = "";

/** Which courses the inbox lists: every course, or one, with each course's
 *  exam countdown in the menu. A 32px row-shaped trigger above the
 *  shelves. */
export function CourseScope({
	courses,
	scope,
	onScopeChange,
}: {
	courses: readonly StudyCourse[];
	scope: string | null;
	onScopeChange: (scope: string | null) => void;
}) {
	if (courses.length < 2) return null;
	const chosen = courses.find((c) => c.map.workspace === scope);
	const exam = chosen ? examText(chosen.map.exam) : null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				data-testid="unit-scope"
				className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-control font-medium text-foreground/90 outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-fill-hover motion-reduce:transition-none"
			>
				<span className="min-w-0 flex-1 truncate">{chosen ? chosen.map.title : "All courses"}</span>
				{exam && <span className="shrink-0 text-label font-normal tabular-nums text-muted-foreground">{exam}</span>}
				<ChevronsUpDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-60">
				<DropdownMenuRadioGroup value={scope ?? ALL} onValueChange={(v) => onScopeChange(v === ALL ? null : v)}>
					<DropdownMenuRadioItem value={ALL} indicator={false}>
						All courses
					</DropdownMenuRadioItem>
					{courses.map((c) => (
						<DropdownMenuRadioItem key={c.map.workspace} value={c.map.workspace} indicator={false}>
							<span className="min-w-0 flex-1 truncate">{c.map.title}</span>
							{examText(c.map.exam) && <DropdownMenuShortcut>{examText(c.map.exam)}</DropdownMenuShortcut>}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
