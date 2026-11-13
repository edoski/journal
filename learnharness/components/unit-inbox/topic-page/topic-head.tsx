import { CircleXIcon, HistoryIcon, type LucideIcon } from "lucide-react";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { Button } from "@/components/ui/button";
import { ACTION_WORDS, type HeadMark, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";

/** One icon per kind of mark, the ones the map's nodes and Today's rows use. */
const MARK_ICON: Record<HeadMark["kind"], LucideIcon> = { slip: CircleXIcon, review: HistoryIcon };

/** A pause for a screen reader between the line's parts, which the eye
 *  separates by space and icons. */
const PAUSE = <span className="sr-only">. </span>;

/**
 * The head every topic page candidate opens with (spec: topic-head.md):
 * the course, the topic with the page's one action at its right, the
 * map's pie with where he stands, then why it needs him as icons and a
 * few words, when he last studied it, and what went wrong when the engine
 * can say. Study is the one action drawn in outline: the engine says
 * nothing needs him. Without `onAct` the head has no button: the page's
 * composer holds the action (the hybrid candidate).
 */
export function TopicHead({ facts, busy, onAct }: { facts: TopicFacts; busy: boolean; onAct?: () => void }) {
	const { action, standing, marks, studied, mistake } = facts;
	return (
		<header data-slot="topic-head" className="flex flex-col gap-1">
			<p className="text-label text-muted-foreground">{facts.course.title}</p>
			<div className="flex min-h-8 items-center justify-between gap-4">
				<h1 className="text-heading font-medium text-foreground">{facts.topic.title}</h1>
				{onAct && (
					<Button
						size="sm"
						variant={action.kind === "study" ? "outline" : "default"}
						className="shrink-0 text-row"
						disabled={busy}
						onClick={onAct}
						data-testid="topic-action"
						data-action={action.kind}
					>
						{ACTION_WORDS[action.kind]}
					</Button>
				)}
			</div>
			{standing && (
				<div data-slot="unit-standing" className="flex items-center gap-4 text-row text-muted-foreground">
					<TopicGlyph standing={standing} />
					<p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
						<span>{standing.words}</span>
						{marks.map((mark) => {
							const Icon = MARK_ICON[mark.kind];
							return (
								<span key={mark.kind} data-slot="topic-mark" data-kind={mark.kind} className="inline-flex items-center gap-1.5">
									{PAUSE}
									<Icon aria-hidden className="size-3.5 shrink-0" />
									{mark.words}
								</span>
							);
						})}
					</p>
					{studied && (
						<p data-slot="topic-studied" className="shrink-0 text-label tabular-nums">
							{studied}
						</p>
					)}
				</div>
			)}
			{mistake && (
				<p data-slot="unit-gap" className="pl-8 text-row text-foreground/90">
					{mistake}
				</p>
			)}
		</header>
	);
}
