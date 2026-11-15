import { TOPIC_LEVELS, type ChatListItem, type CourseMap, type CourseMapTopic, type CourseReadiness, type CourseStanding, type OpenMistake, type ReadinessPart, type StudyCourse, type TopicHandle } from "@/src/core";
import type { StripArc } from "@/components/course-map/arc-strip";
import { misfitWords } from "@/components/calendar/calendar-facts";
import { topicAction } from "@/components/unit-inbox/topic-page/topic-facts";
import { topicCreation } from "@/components/unit-inbox/start-unit";
import type { SessionCreation } from "@/components/start-session";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { finalReviewMissWords, notReadyHeading, notReadyWords, READY_WORDS, shortDay, slipMark, type SlipKey } from "@/components/study-words";
import { namesWords } from "@/components/course-page/course-head/head-facts";
import type { CourseArcSection } from "@/components/course-page/course-model";

/**
 * The course page's exam readiness and open mistakes (spec:
 * standing/standing.md), from the engine's `standing` only: the engine
 * sorts every topic and finds every open mistake; this only words them.
 * Pure.
 */

/** Where a part stands: every topic solid, some not yet (or still to
 *  start), or some with no room before the exam. */
export type PartState = "ready" | "notYet" | "short";

export function partState(part: ReadinessPart): PartState {
	if (part.wontFit.length > 0) return "short";
	return part.notYet.length > 0 || part.toStart.length > 0 ? "notYet" : "ready";
}

/** The answer to "am I ready for the exam, and where not?":
 *  - `short`: topics with no room before the exam, else taught topics the
 *    final review has no room for, named (the run-up's words);
 *  - `notYet`: the arcs not ready, as their bubbles (`arcs`), none when no
 *    arc is ready; in a course the page shows without arcs, the topics,
 *    named (`words`): every one when they are few, else the least ready
 *    and "and the rest", a press that shows `rest` (every topic the line
 *    means, least ready first, under `heading`; null when it names them all);
 *  - `ready`: every part solid. */
export type ExamReady =
	| { kind: "short"; words: string }
	| { kind: "notYet"; words: string; arcs: readonly StripArc[]; rest: { heading: string; topics: readonly CourseMapTopic[] } | null }
	| { kind: "ready"; words: string };

/** How many least-ready topics the line names before "and the rest": a
 *  line of every name said little about what to do (round 9, 2 m13: nine of
 *  Linear Algebra's ten started topics); a list one longer is named whole,
 *  so the press always holds at least two more. */
export const READY_NAMED = 3;

/** The topics least ready for the exam first, from the engine's standing
 *  facts: a topic with a mistake still open (`standing.mistakes`) before
 *  one without, the newest mistake first; then the lower engine level (its
 *  `progress` standing, on the map: introduced, attempted, assisted, then
 *  on his own); then the engine's weak verdict; then the engine's path
 *  order, which only breaks a tie. Pure. */
export function leastReadyFirst(handles: readonly TopicHandle[], map: Pick<CourseMap, "topics">, mistakes: readonly OpenMistake[]): CourseMapTopic[] {
	const open = new Map(mistakes.map((m, at) => [m.topic, at]));
	const ranked = handles.flatMap((handle, at) => {
		const topic = map.topics.find((t) => t.handle === handle);
		return topic ? [{ topic, mistake: open.get(handle) ?? mistakes.length, level: TOPIC_LEVELS.indexOf(topic.level), weak: topic.weak ? 0 : 1, at }] : [];
	});
	return ranked.sort((a, b) => a.mistake - b.mistake || a.level - b.level || a.weak - b.weak || a.at - b.at).map((r) => r.topic);
}

export function examReady(readiness: CourseReadiness, map: Pick<CourseMap, "topics" | "exam">, arcs: readonly CourseArcSection[] | null, mistakes: readonly OpenMistake[]): ExamReady {
	const titleOf = (handle: string) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
	const wontFit = readiness.parts.flatMap((p) => p.wontFit);
	if (wontFit.length > 0) return { kind: "short", words: misfitWords(wontFit.map(titleOf))! };
	// Never "ready" while the final review leaves a taught topic out (the engine's `map`).
	if (map.exam?.unreviewed?.length) return { kind: "short", words: finalReviewMissWords(map.exam.unreviewed.map(titleOf)) };
	const notReady = readiness.parts.filter((p) => partState(p) === "notYet");
	if (notReady.length === 0) return { kind: "ready", words: READY_WORDS.ready };
	if (arcs && notReady.length === readiness.parts.length) return { kind: "notYet", words: READY_WORDS.notYet, arcs: [], rest: null };
	if (arcs) {
		const shown = notReady.flatMap((p) => {
			const section = arcs.find((s) => s.arc.handle === p.arc);
			return section ? [{ handle: section.arc.handle, title: section.arc.title, share: section.share }] : [];
		});
		if (shown.length > 0) return { kind: "notYet", words: READY_WORDS.notYetIn, arcs: shown, rest: null };
	}
	const notYet = notReady.flatMap((p) => p.notYet);
	const kind = notYet.length > 0 ? "notYet" : "toStart";
	const topics = leastReadyFirst(kind === "notYet" ? notYet : notReady.flatMap((p) => p.toStart), map, mistakes);
	if (topics.length <= READY_NAMED + 1) return { kind: "notYet", words: notReadyWords(kind, namesWords(topics.map((t) => t.title))), arcs: [], rest: null };
	const named = topics.slice(0, READY_NAMED).map((t) => t.title).join(", ");
	return { kind: "notYet", words: notReadyWords(kind, named), arcs: [], rest: { heading: notReadyHeading(kind), topics } };
}

/** One open mistake as a row: the topic, what went wrong in the tutor's
 *  words (the diagnosis, else the newest answer), its slip's icon, when,
 *  whether it had help, what it was on, the topic's arc bubble, and what
 *  a press does: Resume the session that waits on the topic, else start
 *  one on it, as the sidebar's rows do. */
export interface MistakeRow {
	topic: CourseMapTopic;
	slip: SlipKey;
	words: string;
	/** "Today", "5 Nov"; null when the engine gives no day. */
	when: string | null;
	helped: boolean;
	/** What it was on, with his answer: the row's hint. */
	hint: string | null;
	arc: StripArc | null;
	/** The session its press opens: the one the topic's page would. */
	resume: ChatListItem | null;
	/** What its press starts when it opens none: the open task continued
	 *  from the lesson that holds it, as the topic's page does, else a
	 *  session on the topic. */
	creation: SessionCreation;
	workspace: string;
	href: string;
}

/** A row's press from its topic's action: the session to open, else what
 *  to start, a continued task as the page starts it. Pure. */
function pressOf(action: ReturnType<typeof topicAction>, workspace: string, topic: CourseMapTopic, today: string): Pick<MistakeRow, "resume" | "creation"> {
	const creation = topicCreation(workspace, topic, today);
	if ("chat" in action) return { resume: action.chat, creation };
	if (action.kind !== "continue") return { resume: null, creation };
	return { resume: null, creation: { title: action.opening, course: { workspace }, topics: [topic.handle], ...(action.from ? { resume: { from: action.from } } : {}) } };
}

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The day of a mistake, never a count of days (round 8: "3d ago"):
 *  "Today", "5 Nov", as narrow as the count was, so the gap beside it
 *  keeps its room. */
function mistakeDayWords(day: string, today: string): string {
	return days(day, today) <= 0 ? "Today" : shortDay(day);
}

/** The open mistakes in the engine's order, newest first, as rows; a
 *  topic the map no longer lists is left out. `arcs` are the arcs the page
 *  shows, whose bubbles the rows wear. A row's press is its topic page's
 *  action (`topicAction`): the session waiting on the topic, else the open
 *  task continued from the lesson that holds it, else a session on the
 *  topic (round 10, 2 m1: the Eigen row started a fresh session while the
 *  lesson's task waited). */
export function mistakeRows(standing: CourseStanding, course: StudyCourse, chats: readonly ChatListItem[], arcs: readonly CourseArcSection[] | null): MistakeRow[] {
	const { map } = course;
	return standing.mistakes.flatMap((m) => {
		const topic = map.topics.find((t) => t.handle === m.topic);
		if (!topic || topic.excluded !== undefined) return [];
		const [newest] = m.answers;
		// The icon the sidebar and the map draw for the topic's slip, else this mistake's own.
		const shared = slipMark(topic.signals, (h) => map.topics.find((t) => t.handle === h)?.title ?? h).key;
		const slip: SlipKey = shared !== "repaired" && shared !== "check" ? shared : newest?.confident ? "confident" : newest?.chose ? "mixed" : m.gap ? "gap" : "lapsed";
		const section = arcs?.find((s) => s.arc.handle === topic.arc);
		const said = newest ? [newest.on, newest.response && `You answered ${newest.response}`].filter((s): s is string => Boolean(s)) : [];
		return [
			{
				topic,
				slip,
				words: m.gap ?? newest!.text,
				when: m.latest ? mistakeDayWords(m.latest, map.today) : null,
				helped: Boolean(newest?.helped),
				hint: said.length > 0 ? said.join(". ") : null,
				arc: section ? { handle: section.arc.handle, title: section.arc.title, share: section.share } : null,
				...pressOf(topicAction(topic, map, chats), map.workspace, topic, map.today),
				workspace: map.workspace,
				href: unitHref(map.workspace, topic.handle),
			},
		];
	});
}
