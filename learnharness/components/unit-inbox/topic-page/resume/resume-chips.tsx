"use client";

import { Button } from "@/components/ui/button";
import { resumeChips } from "@/components/unit-inbox/topic-page/resume/resume-facts";
import { newLessonPlaceholder, ResumeIconMark, TopicComposer, type ResumeProps } from "@/components/unit-inbox/topic-page/resume/resume-parts";

/**
 * Resume option "chips" (spec: resume.md): the composer's toolbar holds
 * one chip per place to pick the topic up, the page's action first, then
 * each other open task that holds it. A chip does its thing in one press;
 * the field starts a new lesson.
 */
export function ResumeChipsFoot({ facts, busy, text, onText, onSend, onStart, onOpen }: ResumeProps) {
	const chips = resumeChips(facts);
	return (
		<TopicComposer
			busy={busy}
			text={text}
			onText={onText}
			onSend={onSend}
			placeholder={newLessonPlaceholder(facts.topic.title)}
			toolbar={chips.map((chip) => (
				<Button
					key={chip.key}
					type="button"
					variant="quiet"
					data-slot="composer-chip"
					data-chip={chip.key}
					disabled={busy}
					onClick={() => (chip.does.kind === "open" ? onOpen(chip.does.chat) : onStart(chip.does.opening, chip.does.from))}
					className="h-8 max-w-72 min-w-0 rounded-full px-3 text-row font-normal text-foreground"
				>
					<ResumeIconMark icon={chip.icon} facts={facts} />
					<span className="truncate">{chip.words}</span>
				</Button>
			))}
		/>
	);
}
