"use client";

import { ArrowRightIcon } from "lucide-react";
import { resumeLine } from "@/components/unit-inbox/topic-page/resume/resume-facts";
import { newLessonPlaceholder, ResumeIconMark, TopicComposer, type ResumeProps } from "@/components/unit-inbox/topic-page/resume/resume-parts";

/**
 * Resume option "line" (spec: resume.md): one quiet line docked on the
 * composer's top edge, inside its surface, says the page's action, what
 * waits and where, and one press does it. The field under it always
 * starts a new lesson.
 */
export function ResumeLineFoot({ facts, busy, text, onText, onSend, onAct }: ResumeProps) {
	const line = resumeLine(facts);
	return (
		<TopicComposer
			busy={busy}
			text={text}
			onText={onText}
			onSend={onSend}
			placeholder={newLessonPlaceholder(facts.topic.title)}
			head={
				<button
					type="button"
					data-slot="resume-line"
					data-action={line.kind}
					disabled={busy}
					onClick={onAct}
					className="group/line flex h-11 min-w-0 items-center gap-3 rounded-t-[19px] border-b border-border/50 px-4 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50 motion-reduce:transition-none"
				>
					<ResumeIconMark icon={line.icon} facts={facts} />
					<span className="flex min-w-0 flex-1 items-baseline gap-2">
						<span className="shrink-0 text-row font-medium text-foreground">{line.words}</span>
						{line.detail && <span className="truncate text-row text-muted-foreground">{line.detail}</span>}
					</span>
					<span className="flex shrink-0 items-center gap-1 text-row font-medium text-link">
						{line.press}
						<ArrowRightIcon aria-hidden className="size-4 transition-transform duration-150 group-hover/line:translate-x-0.5 motion-reduce:transition-none" />
					</span>
				</button>
			}
		/>
	);
}
