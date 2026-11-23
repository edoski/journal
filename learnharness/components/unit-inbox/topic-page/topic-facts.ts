import { isReviewSession, markHow, namedArc, topicOpening, type ArcHandle, type NamedArc, type ChatListItem, type CourseMap, type CourseMapTask, type CourseMapTopic, type SessionPlan, type StartsWhy, type StudyCourse, type TopicAttempt, type TopicHandle, type TopicRecord, type TopicRef } from "@/src/core";
import { slipBeside, standingOf, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { agoWords, ATTEMPT_WORDS, examGapTopicWords, heldExamWords, leftOutWords, lessonBegun, LESSON_WORDS, MARK_HOW_WORDS, movedWords, reviewWords, SLIP_WORDS, startsAfterWords, startsWhyShort, startsWhyTells, startsWhyWords, studiedDaysWords, TUTOR_WRITING, type SlipKey } from "@/components/study-words";
import { closedReview, continueMove, pausedWords, resumableSession, sessionState, type ContinueMove, type SessionState } from "@/components/nav/session-state";
import { daysBetween, mapsOn, shelfOf, taskSessions, topicSession, topicSessions, worksOn, type SessionFact } from "@/components/unit-inbox/units";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { continueWords } from "@/components/study-home/study-facts";
import { sidebarSays, type Said } from "@/components/unit-inbox/sidebar-says";
import type { TopicRead } from "@/components/unit-inbox/topic-page/use-topic-read";

/**
 * What the topic page reads (spec: topic-page.md). Engine
 * fields and session facts only: the app judges no standing, and the one
 * clock is the engine's study day. Every function here is pure.
 */

/** The page's one action: open the session that waits, is being written
 *  or stopped, or the lesson Continue picks up; else start one whose first
 *  message is `opening`, `from` a finished lesson when Continue starts a
 *  fresh session from it (FINISHED_LESSON). */
export type TopicAction =
	| { kind: "resume" | "open"; chat: ChatListItem }
	| { kind: "continue"; chat: ChatListItem; task: CourseMapTask | null }
	| { kind: "review" | "start" | "study"; opening: string }
	| { kind: "review"; opening: string; chat: ChatListItem }
	| { kind: "continue"; opening: string; task: CourseMapTask | null; from?: string };

/** What a press on an open task does: open the session Continue picks up,
 *  else start one with `opening`, `from` a finished lesson as above. */
export type Press = { open: ChatListItem } | { opening: string; from?: string };

/** A Continue move as a press: no move starts a new session. */
export function pressOf(move: ContinueMove | null, opening: string): Press {
	if (move?.kind === "open") return { open: move.chat };
	return move ? { opening, from: move.from.id } : { opening };
}

/** Continue on a task or a topic, as the page's action. */
function continueAction(sessions: readonly ChatListItem[], opening: string, task: CourseMapTask | null): TopicAction {
	const press = pressOf(continueMove(sessions), opening);
	return "open" in press ? { kind: "continue", chat: press.open, task } : { kind: "continue", ...press, task };
}

/** A place to pick the topic back up: the session that waits or is being
 *  written, or an open task that holds the topic. */
export type Pickup =
	| { kind: "session"; chat: ChatListItem; waits: boolean; title: string; where: string; when: string }
	| { kind: "task"; task: CourseMapTask; title: string; where: string; when: string | null; press: Press };

export interface SessionEntry {
	chat: ChatListItem;
	/** Its work is on the topic (`worksOn`), rather than only touching it:
	 *  only such a session is the page's Now, Next or first map. */
	own: boolean;
	/** Its step map is the topic's (`mapsOn`): the topic its plan's steps
	 *  are on, so only that page draws it (round 19, M4). */
	maps: boolean;
	state: SessionState;
	/** The day of its last message, YYYY-MM-DD. */
	day: string;
	/** "Today", "6 Nov". */
	when: string;
	/** Its plan, when its tutor authored one. */
	plan: SessionPlan | null;
}

/** One thing the head says beside the pie, as an icon and a few words in
 *  the map's: why the engine calls the topic weak, or its review, due or
 *  dated. */
export interface HeadMark {
	kind: "slip" | "review";
	words: string;
	/** A slip's own kind, which picks its icon (`slip-icons.ts`). */
	slip?: SlipKey;
}

/** A topic this one builds on (a `needs` edge into it on the course map),
 *  where he stands on it, its words, and its page. */
export interface BuildsOn {
	topic: CourseMapTopic;
	standing: Standing;
	/** Where he stands on it, its pie's words: how ready it is, never a
	 *  session's status (round 14, m38: "Basis and dimension · Your turn"
	 *  said nothing of how ready it was). The card beside keeps the
	 *  sidebar's fact under the same pie. */
	words: string;
	href: string;
}

/** Why the plan starts a topic not started when it does, in his course's
 *  names (`startsWhyWords`), and its kind, which picks its icon. */
export interface StartsReason {
	kind: StartsWhy["kind"];
	words: string;
	/** The same cut to fit a line ("After Binomial distribution", `startsWhyShort`). */
	short: string;
}

export interface TopicFacts {
	course: { workspace: string; title: string };
	/** The arc the topic lies in, named with its place in study order
	 *  (`namedArc`); null in a course without arcs. */
	arc: NamedArc | null;
	topic: CourseMapTopic;
	/** The engine's study day. */
	today: string;
	/** The pie and its words; null when the head line is silent: a topic
	 *  not started that has a session, where "Not started" would contradict
	 *  the lesson. */
	standing: Standing | null;
	/** What the topic's own open session says (`Said.now`), which the head
	 *  says in place of the standing's words, as its map card does: a
	 *  lesson in progress reads "Your turn" or "Left off today", never its
	 *  last answer's mark (round 20, m4). Null when no session on it is
	 *  open. */
	now: SessionFact | null;
	/** What the head says beside the pie; empty when the line is silent. */
	marks: readonly HeadMark[];
	/** The engine's diagnosed mistake, else the last attempt of a topic it
	 *  calls weak when that attempt was not right, in the tutor's words. */
	mistake: string | null;
	/** Why its next review waits past the day memory asks for it
	 *  (`waitsWords`), the exam first for a topic taught: it leaves it out
	 *  ("Not on the exam") or its final review has no room for it; null
	 *  when nothing holds it back. */
	waits: string | null;
	/** A topic not started that the engine's plan starts later: the day of
	 *  its first lesson and, when it waits behind other courses' new
	 *  topics, which (`startsAfterWords`); null otherwise. */
	starts: { day: string; waits: string | null } | null;
	/** A lesson he began: the day the engine's daily plan first reviews the
	 *  topic, after the lesson goes on (the topic read's `firstReview`);
	 *  null otherwise or when the plan reviews it on none. */
	firstReview: string | null;
	/** For a topic not started, what the exam ahead means for it
	 *  (`examWords`): it leaves it out, or its plan has no room to start
	 *  it; null otherwise. */
	exam: string | null;
	/** Why the plan starts a topic not started then ("After Expectation
	 *  and linearity, which it needs", "Early, ahead of its place, while
	 *  earlier topics wait on Change of basis"), or for a topic the exam leaves out ("Not on
	 *  the exam; after it"); null once taught and with no plan for it. */
	startsWhy: StartsReason | null;
	action: TopicAction;
	pickups: readonly Pickup[];
	/** The open tasks that hold the topic (`heldTasks`), by which a
	 *  session holding one is named. */
	tasks: readonly CourseMapTask[];
	/** Every session tied to the topic, newest first: its own and those
	 *  that only touched it (`SessionEntry.own`). */
	sessions: readonly SessionEntry[];
	/** The sessions not already shown as a pick-up row. */
	listed: readonly SessionEntry[];
	/** Newest first; empty without the topic read. */
	attempts: readonly TopicAttempt[];
	/** The topics it builds on, in the engine's path order. */
	builds: readonly BuildsOn[];
	/** The course map cut to the topic and every topic it builds on, near or
	 *  far (`buildsMapOf`); null when it builds on none. */
	buildsMap: CourseMap | null;
	/** What the sidebar says for each topic of the course (`sidebarSays`),
	 *  for the cards of the map of what it builds on. */
	said: ReadonlyMap<TopicHandle, Said>;
	/** Where it is in his material (the record's refs); empty without the
	 *  topic read or when the record points nowhere. */
	refs: readonly TopicRef[];
	titleOf: (handle: string) => string;
}

/** The course map cut to a topic and every topic it builds on, near or
 *  far, with the edges among them, and "You are here" only when the
 *  current topic is among them; null when it builds on none. */
export function buildsMapOf(topic: CourseMapTopic, map: CourseMap): CourseMap | null {
	const chain = new Set<string>([topic.handle]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const edge of map.edges) {
			if (edge.kind === "needs" && chain.has(edge.topic) && !chain.has(edge.prerequisite)) {
				chain.add(edge.prerequisite);
				grew = true;
			}
		}
	}
	if (chain.size === 1) return null;
	return {
		...map,
		topics: map.topics.filter((t) => chain.has(t.handle)),
		edges: map.edges.filter((edge) => (edge.kind === "needs" ? chain.has(edge.topic) && chain.has(edge.prerequisite) : edge.pair.every((h) => chain.has(h)))),
		current: map.current && chain.has(map.current) ? map.current : null,
	};
}

/** The topics a topic builds on, from the course map's `needs` edges, in
 *  the engine's path order, each with where he stands on it. */
export function buildsOn(topic: CourseMapTopic, map: CourseMap): BuildsOn[] {
	const needs = new Set(map.edges.flatMap((edge) => (edge.kind === "needs" && edge.topic === topic.handle ? [edge.prerequisite] : [])));
	return map.topics
		.filter((t) => needs.has(t.handle))
		.map((t) => {
			const standing = standingOf(t);
			return { topic: t, standing, words: standing.words, href: unitHref(map.workspace, t.handle) };
		});
}

/** Why a scheduled review comes when it does, under its day: the day he
 *  was told that it moved from (`movedWords`), else the exam it waits for
 *  (`heldExamWords`); never memory's day, which he was never told (round
 *  19, m2). */
/** What the exam ahead means for the topic: it leaves it out, or its plan
 *  has no room to start or review it; null otherwise. */
const examWords = (topic: CourseMapTopic, map: CourseMap) => leftOutWords(topic, map.exam) ?? examGapTopicWords(topic, map.exam, map.today);

/** `TopicFacts.startsWhy`: the exam first, since a topic it leaves out, or
 *  has no room for, waits for the exam whatever else it waits on. */
function startsReason(topic: CourseMapTopic, map: CourseMap): StartsReason | null {
	const exam = examWords(topic, map);
	if (exam) return { kind: "after", words: exam, short: exam };
	return topic.startsWhy && startsWhyTells(topic.startsWhy) ? { kind: topic.startsWhy.kind, words: startsWhyWords(topic.startsWhy, map), short: startsWhyShort(topic.startsWhy, map) } : null;
}

function waitsWords(topic: CourseMapTopic, today: string): string | null {
	if (topic.moved && topic.review) return movedWords(topic.moved, today);
	return heldExamWords(topic.review);
}

/** The open tasks that hold the topic: the focused one first, then the
 *  map's order. */
export function heldTasks(topic: CourseMapTopic, map: CourseMap): CourseMapTask[] {
	const held = map.tasks.filter((task) => topic.tasks.includes(task.key));
	return [...held.filter((task) => task.key === map.focus), ...held.filter((task) => task.key !== map.focus)];
}

/**
 * The one thing to do on the topic now, first match: resume the session
 * on the topic that waits on him or that the tutor stopped in, open the one
 * the tutor is writing in, review it when the engine has its review due
 * (a new review session, never an old lesson), continue the open task that
 * holds it, start a topic not started, continue one being learned that has
 * no review set, else study (the engine has set the next review in the
 * future, so nothing needs him; when the plan holds a review memory asked
 * for already, Study opens that review, `topicOpening`). Continue picks up the lesson that holds
 * the task, or the topic's newest lesson, as the session model says
 * (`continueMove`). `chats` are every session; the topic's are those that
 * work on it (`worksOn`), never one that only touched it on the way
 * (round 7: Kernel's page resumed the Eigen lesson). A review he closed
 * with Done for today is no session to resume (`closedReview`): it waits
 * for the topic's next review, whose press opens it (round 10, 1 m7).
 */
export function topicAction(topic: CourseMapTopic, map: CourseMap, chats: readonly ChatListItem[]): TopicAction {
	const sessions = topicSessions(chats, map.workspace, topic.handle).filter((chat) => worksOn(chat, topic.handle));
	const active = topicSession(sessions, topic.handle, chats);
	if (active) return { kind: sessionState(active) === "working" ? "open" : "resume", chat: active };
	if (topic.review?.kind === "due") {
		const left = sessions.find(closedReview);
		return { kind: "review", opening: `Review ${topic.title}`, ...(left ? { chat: left } : {}) };
	}
	const [task] = heldTasks(topic, map);
	if (task) return continueAction(taskSessions(chats, map.workspace, task.key), continueWords(task.title), task);
	if (topic.level === "new") return { kind: "start", opening: topic.title };
	if (shelfOf(topic, null) === "learning" && !topic.review) return continueAction(sessions, `Continue ${topic.title}`, null);
	return { kind: "study", opening: topicOpening(topic, map.today) };
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** A date as the page writes it: "Tue 3 Nov". */
export const dayOf = (date: string) => DAY.format(new Date(`${date}T00:00:00Z`)).replace(",", "");

/** A day against the engine's: "Today", "Yesterday", else "Tue 3 Nov". A
 *  day after the engine's reads as today. */
export function dayWords(day: string, today: string): string {
	const days = daysBetween(day, today);
	if (days <= 0) return "Today";
	return days === 1 ? "Yesterday" : dayOf(day);
}

/** How long ago in a trailing column, and when he last studied the
 *  topic: the app's one form, in days (`study-words.ts`). */
export { agoWords, studiedDaysWords as studiedWords };

/**
 * What the head says beside the pie, in the app's words (study-words.ts),
 * each drawn as an icon and a few words: why the engine calls the topic
 * weak (the sidebar keeps it as the row's reason), then its review, due ("Due 5 Nov"), held past memory's day ("Due
 * 1 Oct") or dated ("Back in 5d"), as the map, Home and the sidebar
 * say it (`reviewWords`). `today` is the engine's study day.
 */
export function headMarks(topic: CourseMapTopic, titleOf: (handle: string) => string, today: string): HeadMark[] {
	const slip = slipBeside(topic, titleOf);
	const review = topic.review ? reviewWords(topic.review, today) : null;
	return [...(slip ? [{ kind: "slip" as const, words: slip.words, slip: slip.key }] : []), ...(review ? [{ kind: "review" as const, words: review }] : [])];
}

/** What went wrong, when the engine can say: the mistake it diagnosed,
 *  else, for a topic it calls weak, the newest attempt that counts (never
 *  a prediction) in the tutor's words when it was not right. Nothing once
 *  he has fixed it on his own: the head says "Check again another day",
 *  and the mistake under it read as one still open (round 5). */
export function mistakeOf(topic: CourseMapTopic, attempts: readonly TopicAttempt[]): string | null {
	const { gap, repaired, repairedWithHelp } = topic.signals;
	if (repaired && !repairedWithHelp) return null;
	if (gap) return gap;
	const last = attempts.find((attempt) => !attempt.predicted);
	return topic.weak && last && last.result !== "correct" ? last.text : null;
}

/** The local day of a moment, YYYY-MM-DD: the engine's study day is the
 *  local date, so a session's day is too. */
export function localDay(iso: string): string {
	const at = new Date(iso);
	return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

/** The topic's sessions as the page lists them, in the order given
 *  (newest first), each with whether it belongs to `handle` and its plan
 *  when the read holds one. A session dated after the engine's day counts
 *  as that day. */
export function sessionEntries(sessions: readonly ChatListItem[], plans: readonly SessionPlan[], today: string, handle: string): SessionEntry[] {
	return sessions.map((chat) => {
		const local = localDay(chat.updatedAt);
		const day = local > today ? today : local;
		return { chat, own: worksOn(chat, handle), maps: mapsOn(chat, handle), state: sessionState(chat), day, when: agoWords(daysBetween(day, today), today), plan: plans.find((plan) => plan.id === chat.id) ?? null };
	});
}

/** Where a session stands: the step its newest tagged question is about;
 *  else, while the tutor writes, that it writes; else that it stopped
 *  mid-reply; else that he left it for next time; else a practice problem
 *  waits; else a question waits. */
function whereOf(entry: SessionEntry): string {
	const step = entry.plan?.tree.nodes.find((node) => node.id === entry.plan?.current);
	if (step) return step.title;
	if (entry.state === "working") return TUTOR_WRITING;
	if (entry.state === "paused") return pausedWords(entry.chat);
	if (entry.state === "left") return LESSON_WORDS.leftForTonight;
	return entry.chat.pendingProblem ? "Problem waiting" : "Question waiting";
}

/**
 * The places to pick the topic back up: the topic's own session that
 * waits on him, is being written or stopped, if any, then each open task that holds the
 * topic at the step it was left on, the focused one first, except a task
 * that session holds. A task's press continues the lesson that holds it.
 */
export function pickupsOf(topic: CourseMapTopic, map: CourseMap, entries: readonly SessionEntry[], chats: readonly ChatListItem[], record: TopicRecord | null, today: string): Pickup[] {
	const active = resumableSession(entries.filter((entry) => entry.own && !closedReview(entry.chat)).map((entry) => entry.chat), chats);
	const entry = entries.find((e) => e.chat === active);
	const session: Pickup[] = entry ? [{ kind: "session", chat: entry.chat, waits: entry.state !== "working", title: entry.chat.title, where: whereOf(entry), when: entry.when }] : [];
	const tasks = heldTasks(topic, map)
		.filter((task) => !active?.tasks?.includes(task.key))
		.map((task): Pickup => {
			const updated = record?.tasks.find((t) => t.key === task.key)?.updated;
			const press = pressOf(continueMove(taskSessions(chats, map.workspace, task.key)), continueWords(task.title));
			return { kind: "task", task, title: task.title, where: task.step ?? "Unfinished", when: updated ? agoWords(daysBetween(updated, today), today) : null, press };
		});
	return [...session, ...tasks];
}

/** How an attempt went, and the one thing worth saying about it: a
 *  prediction that never counted, that he gave up, the method he reached
 *  for in its place, that he was sure and wrong, or how a right answer
 *  counted when not as his own (round 4: a helped ✓ read as an unaided
 *  one). */
export function attemptMark(attempt: TopicAttempt, titleOf: (handle: string) => string): { result: "right" | "partly" | "wrong"; words: string | null } {
	const result = attempt.result === "correct" ? "right" : attempt.result === "partial" ? "partly" : "wrong";
	const how = markHow({ ...attempt, helped: !attempt.unaided });
	if (how === "predicted" || how === "gaveUp") return { result, words: MARK_HOW_WORDS[how] };
	if (attempt.chose) return { result, words: `Mixed up with ${titleOf(attempt.chose)}` };
	if (attempt.result === "incorrect") return { result, words: attempt.sure === "confident" ? SLIP_WORDS.confident : ATTEMPT_WORDS.wrong };
	// How a right or partly right answer counted, in the answer card's words;
	// a right one on his own says nothing, so the ones that differ stand out,
	// and a partly right one says so (round 12, 1 m12: its icon alone).
	if (how !== "ownWork") return { result, words: MARK_HOW_WORDS[how] };
	return { result, words: result === "partly" ? ATTEMPT_WORDS.partly : null };
}

/** The arc a topic lies in, by handle and title; null in a course without
 *  arcs or for a topic the arc list does not hold. Pure. */
function arcOf(course: StudyCourse, topic: CourseMapTopic): TopicFacts["arc"] {
	return topic.arc && course.map.arcs ? namedArc(course.map.arcs, topic.arc) : null;
}

/** Everything the page draws, from the course, every course (Today
 *  weighs them together), the topic, every session and the topic read;
 *  `read` is null when it failed. */
export function topicFacts({
	course,
	courses = [course],
	topic,
	chats,
	read,
}: {
	course: StudyCourse;
	courses?: readonly StudyCourse[];
	topic: CourseMapTopic;
	chats: readonly ChatListItem[];
	read: TopicRead | null;
}): TopicFacts {
	const { map } = course;
	const sessions = topicSessions(chats, map.workspace, topic.handle);
	const titleOf = (handle: string) => map.topics.find((t) => t.handle === handle)?.title ?? handle;
	const attempts = read?.record?.attempts ?? [];
	const entries = sessionEntries(sessions, read?.plans ?? [], map.today, topic.handle);
	const pickups = pickupsOf(topic, map, entries, chats, read?.record ?? null, map.today);
	const picked = new Set(pickups.flatMap((pickup) => (pickup.kind === "session" ? [pickup.chat.id] : [])));
	// A lesson he began says "Lesson in progress" (`standingWords`), never "Not started" (round 14, m36: the begun
	// Poisson page left an empty band under its title); only a topic not started that a session merely touched is silent.
	const silent = topic.level === "new" && sessions.length > 0 && !lessonBegun(topic);
	const said = sidebarSays(courses, chats, map.workspace);
	return {
		course: { workspace: map.workspace, title: map.title },
		arc: arcOf(course, topic),
		topic,
		today: map.today,
		standing: silent ? null : standingOf(topic),
		now: said.get(topic.handle)?.now ?? null,
		marks: silent ? [] : headMarks(topic, titleOf, map.today),
		mistake: mistakeOf(topic, attempts),
		// A topic the exam leaves out stays left out once he starts it: its review says so (the demo world's
		// Simulation of continuous probabilities, introduced by a probe two days before the exam, read only "Left off today").
		waits: (topic.level !== "new" ? examWords(topic, map) : null) ?? waitsWords(topic, map.today),
		starts: topic.level === "new" && topic.starts && topic.starts > map.today ? { day: topic.starts, waits: examWords(topic, map) ? null : topic.moved ? movedWords(topic.moved, map.today) : startsAfterWords(topic.startsAfter) } : null,
		firstReview: lessonBegun(topic) ? (read?.firstReview ?? null) : null,
		startsWhy: topic.level === "new" ? startsReason(topic, map) : null,
		exam: topic.level === "new" ? examWords(topic, map) : null,
		action: topicAction(topic, map, chats),
		pickups,
		tasks: heldTasks(topic, map),
		sessions: entries,
		listed: entries.filter((entry) => !picked.has(entry.chat.id)),
		attempts,
		builds: buildsOn(topic, map),
		buildsMap: buildsMapOf(topic, map),
		said,
		refs: read?.record?.refs ?? [],
		titleOf,
	};
}
