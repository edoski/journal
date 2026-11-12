import { spanWords, trackMarks, type TrackMark } from "@/components/study-home/lesson-facts";
import type { PathPlace } from "@/components/study-home/study-facts";
import { cn } from "@/lib/utils";
import type { StudyCourse, TopicHandle } from "@/src/core";

const TONE: Record<TrackMark, string> = {
	today: "bg-foreground",
	started: "bg-foreground/40",
	ahead: "bg-foreground/15",
};

/** Past this many topics the marks thin out, so the track keeps its width. */
const WIDE_MARKS = 40;

/**
 * A lesson's place in its course's path (spec: path-home.md): one mark per
 * topic in path order, today's topics in ink, the ones started before in
 * mid grey and the ones ahead faint, each a dot, then the place in words.
 */
export function PathTrack({ course, topics, place }: { course: StudyCourse; topics: readonly TopicHandle[]; place: PathPlace | null }) {
	const marks = trackMarks(course, topics);
	const started = course.map.topics.filter((t) => t.level !== "new").length;
	const thin = marks.length > WIDE_MARKS;
	return (
		<span data-slot="path-track" className="flex items-center gap-3">
			<span
				role="img"
				aria-label={`${started} of ${marks.length} topics started`}
				className={cn("flex h-4 shrink-0 items-center", thin ? "gap-0.5" : "gap-1")}
			>
				{marks.map((mark, i) => (
					<span key={i} className={cn("rounded-full", thin ? "size-1" : "size-1.5", TONE[mark])} />
				))}
			</span>
			{place && <span className="text-label whitespace-nowrap text-muted-foreground tabular-nums">{spanWords(place)}</span>}
		</span>
	);
}
