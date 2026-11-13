import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { Button } from "@/components/ui/button";
import { ACTION_WORDS, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * The head every topic page candidate opens with (spec: topic-head.md):
 * the course, the topic with the page's one action at its right, the
 * map's pie with where he stands and when he last studied it, and what
 * went wrong when the engine can say. Study is the one action drawn in
 * outline: the engine says nothing needs him.
 */
export function TopicHead({ facts, busy, onAct }: { facts: TopicFacts; busy: boolean; onAct: () => void }) {
	const { action, standing, line, studied, mistake } = facts;
	return (
		<header data-slot="topic-head" className="flex flex-col gap-1">
			<p className="text-label text-muted-foreground">{facts.course.title}</p>
			<div className="flex min-h-8 items-center justify-between gap-4">
				<h1 className="text-heading font-medium text-foreground">{facts.topic.title}</h1>
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
			</div>
			{standing && line && (
				<p data-slot="unit-standing" className="flex items-center gap-4 text-row text-muted-foreground">
					<TopicGlyph standing={standing} />
					<span className="min-w-0 flex-1">{line}</span>
					{studied && (
						<span data-slot="topic-studied" className="shrink-0 text-label tabular-nums">
							{studied}
						</span>
					)}
				</p>
			)}
			{mistake && (
				<p data-slot="unit-gap" className="pl-8 text-row text-foreground/90">
					{mistake}
				</p>
			)}
		</header>
	);
}
