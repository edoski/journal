"use client";

import { useState } from "react";
import { FolderIcon, GlobeIcon, PencilLineIcon } from "lucide-react";
import { PageHead } from "@/components/page-frame/page-frame";
import type { CourseView } from "@/components/course-page/course-model";
import { useCourseContext } from "@/components/course-context/use-course-context";
import { ContextButton, CourseAction, ExamFact, LessonError, StudiedFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";

/** Linked folders and websites the standing line names before "More"
 *  opens Context: the line stays one row in his window. */
const LINKS_SHOWN = 2;
const PRESS = "inline-flex h-5 min-w-0 max-w-48 items-center gap-1.5 whitespace-nowrap rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

/**
 * Brief (spec: course-head.md): the head is the course's own brief, as a
 * Claude project's instructions or a Linear project's description lead
 * its page. Under the title, the course in his words from Context (or an
 * invitation to write it); then the exam, when he last studied, and the
 * folders and websites linked to the course, each opening where it lives.
 * An arc, once the engine has them, sits above the title: "In <arc>".
 */
export function BriefHead({ view, busy, onContinue }: { view: CourseView; busy: boolean; onContinue: (workspace: string) => void }) {
	const { course, facts } = view;
	const runup = useCourseRunup(course.map.workspace);
	const context = useCourseContext(course.map.workspace);
	const [contextOpen, setContextOpen] = useState(false);
	const ready = context.read.status === "ready" ? context.read.context : null;
	const links = ready ? [...ready.folders.map((f) => ({ kind: "folder" as const, ...f })), ...ready.websites.map((w) => ({ kind: "website" as const, ...w }))] : [];
	return (
		<PageHead
			data-head="brief"
			title={<span data-slot="course-title">{course.map.title}</span>}
			actions={
				<>
					<ContextButton course={course} open={contextOpen} onOpenChange={setContextOpen} />
					<CourseAction view={view} busy={busy} onContinue={onContinue} />
				</>
			}
			lead={
				<div data-slot="course-brief" className="min-h-5 min-w-0">
					{ready?.description ? (
						<p className="line-clamp-2 max-w-[48rem] font-normal text-pretty text-foreground/85">{ready.description}</p>
					) : (
						ready && (
							<button type="button" onClick={() => setContextOpen(true)} className="inline-flex h-5 items-center gap-1.5 rounded-sm font-normal text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
								<PencilLineIcon aria-hidden className="size-4 shrink-0" />
								Say what this course is, for the tutor and the map
							</button>
						)
					)}
				</div>
			}
			standing={
				<>
					{facts.exam && <ExamFact course={course} runup={runup} words={facts.exam} />}
					{facts.studied && <StudiedFact words={facts.studied} session={facts.lastSession} />}
					{links.slice(0, LINKS_SHOWN).map((link) =>
						link.kind === "website" ? (
							<a key={link.handle} href={link.url} target="_blank" rel="noreferrer" data-slot="course-link" className={PRESS}>
								<GlobeIcon aria-hidden className="size-4 shrink-0" />
								<span className="truncate">{link.title}</span>
							</a>
						) : (
							<button key={link.handle} type="button" data-slot="course-link" onClick={() => void context.open(link.handle)} className={PRESS}>
								<FolderIcon aria-hidden className="size-4 shrink-0" />
								<span className="truncate">{link.title}</span>
							</button>
						),
					)}
					{links.length > LINKS_SHOWN && (
						<button type="button" data-slot="course-link-more" onClick={() => setContextOpen(true)} className={PRESS}>
							More in Context
						</button>
					)}
				</>
			}
		>
			<LessonError />
		</PageHead>
	);
}
