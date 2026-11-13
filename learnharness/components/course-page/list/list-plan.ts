import type { CourseMapTopic } from "@/src/core";
import { needOf } from "@/components/course-map/topic-map/topic-standing";
import { GROUP_IDS, GROUP_WORDS, type CourseTopic, type CourseView, type GroupId, type TopicFact } from "@/components/course-page/course-model";
import { whyOf } from "@/components/study-home/agenda-rows/row-facts";
import { todaysReview } from "@/components/study-home/study-facts";

/** How many topics not started the list shows before "Show N more": the
 *  next few on the path, not the whole rest of the course. */
export const NOT_STARTED_SHOWN = 3;

/** Each group's name on the list: the model's, with the sidebar's "Known"
 *  for the topics he can do on his own that need nothing, so the header's
 *  "3 of 16 on your own" (Home's pie, which counts the due ones too) is the
 *  only "on your own" on the page. */
export const LIST_TITLES: Record<GroupId, string> = { ...GROUP_WORDS, "on-your-own": "Known" };

/** One topic as the list draws it: its row, with the fact it ends with,
 *  and the muted line under its title, or null. */
export interface ListRow {
	row: CourseTopic;
	detail: string | null;
}

/** One group as the list draws it. */
export interface ListGroup {
	id: GroupId;
	title: string;
	rows: readonly ListRow[];
	/** The header folds the rows away (the sidebar's Known shelf). */
	foldable: boolean;
	/** It opens folded. */
	folded: boolean;
	/** Rows shown before "Show N more"; undefined shows them all. */
	limit: number | undefined;
}

/** A session on the topic waits on him or the tutor is writing in one. */
const busy = (row: CourseTopic) => row.now !== null;
const isSession = (fact: TopicFact | null) => fact?.kind === "your-turn" || fact?.kind === "working";

/** Home's words for a due review ("3d overdue"). `needOf` says them for a
 *  topic he can do on his own, so it is asked as one. */
function reviewFact(topic: CourseMapTopic): TopicFact | null {
	const need = needOf({ ...topic, level: "independent", weak: false }, () => "");
	return need ? { kind: "review", words: need.short } : null;
}

/**
 * One row's fact and second line:
 *   - A topic still being learned that today's review takes up (the
 *     header's review) says so, "3d overdue",
 *     so the rows name what the button covers.
 *   - A slip the engine has diagnosed shows its sentence for the mistake
 *     under the title ("Counts nonzero entries instead of pivots").
 *   - Where a session's "Your turn" takes the row's end, the reason it
 *     needs him moves under the title, so it is never hidden.
 * Pure.
 */
export function listRow(row: CourseTopic, reviewing: ReadonlySet<string>): ListRow {
	const session = isSession(row.fact);
	const due = row.group === "learning" && reviewing.has(row.topic.handle) ? reviewFact(row.topic) : null;
	const reason = row.need?.short ?? due?.words ?? null;
	const fact = session ? row.fact : (due ?? row.fact);
	const gap = row.need?.kind === "slip" ? row.topic.signals.gap : null;
	return { row: fact === row.fact ? row : { ...row, fact }, detail: gap ?? (session ? reason : null) };
}

/**
 * How the list draws the course's groups (spec: list-course.md):
 *   - A topic with a session but not started yet (its pie empty) sits
 *     under Not started in path order, so the group and the pie agree.
 *   - A group with no topics is left out, as the sidebar leaves out an
 *     empty shelf.
 *   - Not started shows the next three on the path, then "Show N more";
 *     never "Show 1 more", which would take the room of the row it hides,
 *     and never hiding the topic he is at or one a session holds.
 *   - Known folds, as the sidebar's shelf does, unless a session on one of
 *     its topics waits on him or is being written, or nothing waits under
 *     Needs you or Not started (everything learned), when the folded
 *     header would hide the course he has finished.
 * Nothing is stored: each visit opens as drawn here. Pure.
 */
export function listPlan({ course, groups }: Pick<CourseView, "course" | "groups">): ListGroup[] {
	const path = new Map(course.map.topics.map((t, i) => [t.handle, i]));
	const reviewing = new Set<string>(todaysReview(course).map((t) => t.handle));
	const topicsOf = (id: GroupId) => groups.find((g) => g.id === id)?.topics ?? [];
	const unstarted = (row: CourseTopic) => row.topic.level === "new";
	const byPath = (a: CourseTopic, b: CourseTopic) => path.get(a.topic.handle)! - path.get(b.topic.handle)!;
	const sorted: Record<GroupId, readonly CourseTopic[]> = {
		"needs-you": topicsOf("needs-you"),
		learning: topicsOf("learning").filter((r) => !unstarted(r)),
		"not-started": [...topicsOf("not-started"), ...topicsOf("learning").filter(unstarted).map((r) => ({ ...r, group: "not-started" as const }))].sort(byPath),
		"on-your-own": topicsOf("on-your-own"),
	};
	const shown = GROUP_IDS.filter((id) => sorted[id].length > 0);
	return shown.map((id) => {
		const topics = sorted[id];
		const base = { id, title: LIST_TITLES[id], rows: topics.map((r) => listRow(r, reviewing)), foldable: false, folded: false, limit: undefined };
		if (id === "not-started") {
			const kept = topics.reduce((last, t, i) => (t.current || busy(t) ? i + 1 : last), 0);
			const limit = Math.max(NOT_STARTED_SHOWN, kept);
			return { ...base, limit: topics.length > limit + 1 ? limit : undefined };
		}
		if (id === "on-your-own") {
			const open = topics.some(busy) || (!shown.includes("needs-you") && !shown.includes("not-started"));
			return { ...base, foldable: true, folded: !open };
		}
		return base;
	});
}

/** Where he was in the course, for the lines under the header: the topic
 *  he is at ("You are here") and the open task at its step, each left out
 *  where the header's next line already names it. Pure. */
export interface ListWhere {
	here: CourseMapTopic | null;
	task: { title: string; step: string } | null;
}

export function listWhere({ course, next }: Pick<CourseView, "course" | "next">): ListWhere {
	const { map } = course;
	const step = next.row.kind === "course" ? next.row.step.kind : null;
	const current = map.topics.find((t) => t.handle === map.current) ?? null;
	// The course's open task, the one its Continue takes up (`nextStepOf`).
	const open = map.tasks.find((t) => t.key === map.focus) ?? map.tasks[0];
	const words = open && whyOf({ kind: "course", course, step: { kind: "task", key: open.key, title: open.title, step: open.step, topics: [] } })?.short;
	return {
		here: step === "topic" ? null : current,
		task: open && words && step !== "task" ? { title: open.title, step: words } : null,
	};
}
