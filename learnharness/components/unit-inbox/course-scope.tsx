"use client";

import Link from "next/link";
import { ArrowRightIcon, ListFilterIcon } from "lucide-react";
import type { StudyCourse } from "@/src/core";
import { courseFactText } from "@/components/start/course-facts";
import { CourseMark } from "@/components/unit-inbox/unit-row";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { Hint } from "@/components/ui/hint";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MathText, mathPlain } from "@/components/ui/math-text";

const ALL = "";

/** Which courses the sidebar lists, T3 Code's project filter: a 28px icon
 *  button beside the search (the filter glyph, or the chosen course's mark)
 *  opening every course once (round 4: a second list of the same courses
 *  under "Open a course page" read as a duplicate). A row filters by its
 *  course and shows its exam countdown; the arrow at its end opens the
 *  course's page, as Home's "Course page →" does. */
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
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuRadioGroup value={scope ?? ALL} onValueChange={(v) => onScopeChange(v === ALL ? null : v)}>
					<DropdownMenuRadioItem value={ALL} indicator={false}>
						All courses
					</DropdownMenuRadioItem>
					{courses.map((c) => {
						const page = `Open the ${mathPlain(c.map.title)} course page`;
						return (
							<div key={c.map.workspace} data-slot="course-scope-row" className="flex items-center gap-0.5">
								<DropdownMenuRadioItem value={c.map.workspace} indicator={false} className="min-w-0 flex-1">
									<CourseMark title={c.map.title} />
									<span className="min-w-0 flex-1 truncate">
										<MathText>{c.map.title}</MathText>
									</span>
									{courseFactText(c.map) && <DropdownMenuShortcut>{courseFactText(c.map)}</DropdownMenuShortcut>}
								</DropdownMenuRadioItem>
								<Hint label={page} side="right">
									<DropdownMenuItem asChild className="size-8 shrink-0 justify-center px-0 data-[highlighted]:[&_svg]:text-foreground">
										<Link href={courseHref(c.map.workspace)} aria-label={page} data-testid="course-scope-page">
											<ArrowRightIcon aria-hidden />
										</Link>
									</DropdownMenuItem>
								</Hint>
							</div>
						);
					})}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
