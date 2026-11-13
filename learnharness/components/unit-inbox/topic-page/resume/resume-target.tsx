"use client";

import { useState } from "react";
import { ChevronDownIcon, DumbbellIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { emptyPress, resumeTargets, targetAtFirst, targetPlaceholder, type ResumeTarget } from "@/components/unit-inbox/topic-page/resume/resume-facts";
import { TopicComposer, type ResumeProps } from "@/components/unit-inbox/topic-page/resume/resume-parts";
import { WhyMark } from "@/components/unit-inbox/topic-page/why-mark";

function TargetIcon({ target }: { target: ResumeTarget }) {
	if (!target.entry) return <PlusIcon aria-hidden />;
	return target.entry.chat.kind === "practice" ? <DumbbellIcon aria-hidden /> : <MessageSquareIcon aria-hidden />;
}

/**
 * Resume option "target" (spec: resume.md): a menu in the composer's
 * toolbar picks where the message goes, a new lesson or one of the
 * topic's sessions, starting on the session the page's action opens. A
 * typed message goes there; with the field empty, the button resumes the
 * session or starts the new lesson's action.
 */
export function ResumeTargetFoot({ facts, fresh, busy, text, onText, onSend, onStart, onOpen }: ResumeProps) {
	const targets = resumeTargets(facts);
	const [chosen, setChosen] = useState(() => targetAtFirst(facts.action));
	const target = targets.find((t) => t.id === chosen) ?? targets[0]!;
	const go = (message?: string) => (target.entry ? onOpen(target.entry.chat.id, message) : message ? onSend() : onStart(fresh.opening));
	return (
		<TopicComposer
			busy={busy}
			text={text}
			onText={onText}
			onSend={() => go(text.trim())}
			placeholder={targetPlaceholder(target, facts.topic.title)}
			emptyAction={{ label: emptyPress(target, fresh), run: () => go() }}
			toolbar={
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" variant="quiet" data-slot="composer-chip" data-target={target.id} aria-label={`Message goes to: ${target.label}`} className="h-8 max-w-72 min-w-0 rounded-full px-3 text-row font-normal text-foreground">
							<TargetIcon target={target} />
							<span className="truncate">{target.label}</span>
							<ChevronDownIcon aria-hidden className="text-muted-foreground" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" side="top" className="w-80">
						<DropdownMenuRadioGroup value={target.id} onValueChange={setChosen}>
							{targets.map((t) => (
								<DropdownMenuRadioItem key={t.id} value={t.id} data-slot="resume-target">
									<TargetIcon target={t} />
									<span className="shrink-0">{t.label}</span>
									{t.title && <span className="truncate text-muted-foreground">{t.title}</span>}
									{t.entry?.state === "your-turn" && <WhyMark kind="reply" />}
									{t.entry?.state === "working" && <WhyMark kind="writing" />}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			}
		/>
	);
}
