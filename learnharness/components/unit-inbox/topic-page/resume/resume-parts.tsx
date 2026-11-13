import { BookmarkIcon, CircleDashedIcon, HistoryIcon, MessageCircleQuestionIcon } from "lucide-react";
import type { ComponentType } from "react";
import { BrailleSpinner } from "@/components/braille-spinner";
import { Composer } from "@/components/composer";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import type { TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import type { FreshAction, ResumeIcon } from "@/components/unit-inbox/topic-page/resume/resume-facts";

/** What every resume option takes from the topic page. */
export interface ResumeProps {
	facts: TopicFacts;
	/** What a new lesson on the topic does (rows 3 to 7 of the action table). */
	fresh: FreshAction;
	/** A start is in flight: every press waits. */
	busy: boolean;
	text: string;
	onText: (text: string) => void;
	/** Does the page's action: opens its session, or starts one with its opening. */
	onAct: () => void;
	/** Starts a new lesson whose first message is `opening`. */
	onStart: (opening: string, from?: string) => void;
	/** Starts a new lesson with the typed message. */
	onSend: () => void;
	/** Opens a session, handing it `message` first when given. */
	onOpen: (chat: string, message?: string) => void;
}

export type ResumeOption = ComponentType<ResumeProps>;

/** The words a new lesson's field shows. */
export const newLessonPlaceholder = (title: string) => `Ask about ${title} to start a new lesson`;

/** The icon a resume line or chip leads with, the app's own for the same
 *  thing: the reply mark in the accent, the tutor's spinner, the review
 *  clock, the task bookmark, or the topic's pie (a dashed ring while the
 *  head line is silent). */
export function ResumeIconMark({ icon, facts, className = "size-4" }: { icon: ResumeIcon; facts: TopicFacts; className?: string }) {
	switch (icon) {
		case "reply":
			return <MessageCircleQuestionIcon aria-hidden className={`${className} shrink-0 text-link`} />;
		case "writing":
			return <BrailleSpinner className="shrink-0 text-muted-foreground" />;
		case "review":
			return <HistoryIcon aria-hidden className={`${className} shrink-0 text-muted-foreground`} />;
		case "task":
			return <BookmarkIcon aria-hidden className={`${className} shrink-0 text-muted-foreground`} />;
		case "standing":
			return facts.standing ? <TopicGlyph standing={facts.standing} /> : <CircleDashedIcon aria-hidden className={`${className} shrink-0 text-muted-foreground`} />;
	}
}

/** The topic page's composer as every resume option draws it: the
 *  Proposed composer, which a typed message leaves through `onSend`. */
export function TopicComposer({ busy, text, onText, onSend, placeholder, head, toolbar, emptyAction }: Pick<ResumeProps, "busy" | "text" | "onText" | "onSend"> & {
	placeholder: string;
	head?: React.ReactNode;
	toolbar?: React.ReactNode;
	emptyAction?: { label: string; run: () => void };
}) {
	return (
		<Composer
			variant="proposed"
			busy={busy}
			value={text}
			onChange={onText}
			onSend={onSend}
			onStop={() => {}}
			canSend={text.trim().length > 0 && !busy}
			placeholder={placeholder}
			head={head}
			toolbar={toolbar}
			emptyAction={emptyAction}
		/>
	);
}
