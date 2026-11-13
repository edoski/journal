import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { cn } from "@/lib/utils";
import { standingSentence, type StandingId, type StandingPart } from "./brief-model";

/** Each part's ink: the full pie's for what he can do on his own, half of
 *  it for what he is learning, the track for what is not started. */
const TONE: Record<StandingId, string> = {
	"on-your-own": "bg-muted-foreground",
	learning: "bg-muted-foreground/45",
	"not-started": "bg-muted-foreground/15",
};

/**
 * The course's pie unrolled (spec: brief-course.md): one line, an 8px bar
 * in up to three parts (on your own, learning, not started), each as wide
 * as its share of the topics, then the counts the header does not already
 * say ("7 learning", "6 not started"), each led by the pie a topic in that
 * part wears on the map. The header's "3 of 16 on your own" names the
 * first part. A screen reader hears the whole as one sentence.
 */
export function StandingBar({ parts }: { parts: readonly StandingPart[] }) {
	const counted = parts.filter((p) => p.id !== "on-your-own");
	return (
		<section data-slot="brief-standing" aria-label="Where you stand" className="flex h-5 shrink-0 items-center gap-4">
			<span className="sr-only">{standingSentence(parts)}</span>
			<div data-slot="brief-standing-bar" aria-hidden className="flex h-2 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-full">
				{parts.map((part) => (
					// The part's share is data, so its width is the one inline value (as shadcn's Progress sets its indicator's).
					<span key={part.id} data-slot="brief-standing-part" data-part={part.id} className={cn("h-full basis-0", TONE[part.id])} style={{ flexGrow: part.count }} />
				))}
			</div>
			{counted.map((part) => (
				<span key={part.id} data-slot="brief-standing-count" aria-hidden className="inline-flex h-5 shrink-0 items-center gap-1.5 text-row whitespace-nowrap text-muted-foreground tabular-nums">
					<TopicGlyph standing={{ fill: part.fill, slipping: false, words: part.words }} />
					{part.words}
				</span>
			))}
		</section>
	);
}
