"use client";

import Link from "next/link";
import { ListFilterIcon } from "lucide-react";
import type { StudyCourse } from "@/src/core";
import { examText } from "@/components/start/course-facts";
import { CourseMark } from "@/components/unit-inbox/unit-row";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { Hint } from "@/components/ui/hint";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MathText } from "@/components/ui/math-text";

const ALL = "";

/** Which courses the sidebar lists, T3 Code's project filter: a 28px icon
 *  button beside the search (the filter glyph, or the chosen course's mark)
 *  opening every course with its exam countdown, then each course again as
 *  a link to its page. */
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
	const label = chosen ? `Showing ${chosen.map.title}` : "Show one course";
	return (
		<DropdownMenu>
			<Hint label={label} side="bottom">
				<DropdownMenuTrigger
					data-testid="unit-scope"
					aria-label={label}
					className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-fill-hover motion-reduce:transition-none"
				>
					{chosen ? <CourseMark title={chosen.map.title} /> : <ListFilterIcon aria-hidden className="size-4" />}
				</DropdownMenuTrigger>
			</Hint>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuRadioGroup value={scope ?? ALL} onValueChange={(v) => onScopeChange(v === ALL ? null : v)}>
					<DropdownMenuRadioItem value={ALL} indicator={false}>
						All courses
					</DropdownMenuRadioItem>
					{courses.map((c) => (
						<DropdownMenuRadioItem key={c.map.workspace} value={c.map.workspace} indicator={false}>
							<CourseMark title={c.map.title} />
							<span className="min-w-0 flex-1 truncate">
								<MathText>{c.map.title}</MathText>
							</span>
							{examText(c.map.exam) && <DropdownMenuShortcut>{examText(c.map.exam)}</DropdownMenuShortcut>}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuLabel>Open a course page</DropdownMenuLabel>
					{courses.map((c) => (
						<DropdownMenuItem key={c.map.workspace} asChild>
							<Link href={courseHref(c.map.workspace)} data-testid="course-scope-page">
								<CourseMark title={c.map.title} />
								<span className="min-w-0 flex-1 truncate">
									<MathText>{c.map.title}</MathText>
								</span>
							</Link>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
