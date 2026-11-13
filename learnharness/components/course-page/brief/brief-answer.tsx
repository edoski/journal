"use client";

import { useEffect, useRef, useState } from "react";
import { CourseGroup } from "@/components/course-page/course-group";
import { CourseTopicRow } from "@/components/course-page/course-topic-row";
import { cn } from "@/lib/utils";
import type { Answer } from "./brief-model";

/**
 * One of the brief's three answers (spec: brief-course.md): the course
 * page's group header with the answer's name and how many topics it holds,
 * its first `limit` topics as two-line rows (the title, then what the row
 * says, with that fact's icon at the row's end, so the icons line up down
 * the column and its words show in a hint), and "Show N more" for the
 * rest; or one quiet line when it has none. Escape folds an opened answer
 * back to its first rows.
 */
export function BriefAnswer({ answer, limit, className }: { answer: Answer; limit: number; className?: string }) {
	const root = useRef<HTMLDivElement>(null);
	// CourseGroup keeps its own Show more; drawing it afresh folds it back.
	const [drawn, setDrawn] = useState(0);
	const [open, setOpen] = useState(false);
	const [refocus, setRefocus] = useState(false);

	useEffect(() => {
		if (!open) return;
		// Every opened answer folds on one Escape; one that a dialog or menu took first is left alone.
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			setRefocus(root.current?.contains(document.activeElement) ?? false);
			setOpen(false);
			setDrawn((n) => n + 1);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open]);

	useEffect(() => {
		if (!refocus) return;
		root.current?.querySelector<HTMLElement>("[data-slot=course-group-more]")?.focus({ preventScroll: true });
		setRefocus(false);
	}, [refocus]);

	return (
		<div
			ref={root}
			data-slot="brief-answer"
			data-answer={answer.id}
			data-open={open || undefined}
			onClickCapture={(event) => {
				if (event.target instanceof Element && event.target.closest("[data-slot=course-group-more]")) setOpen(true);
			}}
			className={cn("flex min-w-0 flex-col", className)}
		>
			<CourseGroup
				key={drawn}
				title={answer.title}
				items={answer.topics}
				limit={limit}
				renderItem={(t) => <CourseTopicRow key={t.row.topic.handle} row={{ ...t.row, fact: t.fact }} detail={t.words} compact />}
			/>
			{answer.topics.length === 0 && (
				<p data-slot="brief-empty" className="flex h-9 min-w-0 items-center text-row text-muted-foreground">
					<span className="truncate">{answer.empty}</span>
				</p>
			)}
		</div>
	);
}
