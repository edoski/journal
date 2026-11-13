import { lessonWords } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import type { CourseMap, CourseMapTopic } from "@/src/core";
import { ACTION_WORDS, WRITING, topicAction, type SessionEntry, type TopicAction, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";

/**
 * What the hybrid topic page's resume options say (spec: resume.md), pure,
 * from the shared facts: the page's one action (`topicAction`, all seven
 * rows) in the words each option shows, where a typed message goes, and
 * what the empty composer's button does.
 */

/** The action a new lesson on the topic takes: `topicAction` with no
 *  session to open (rows 3 to 7). */
export type FreshAction = Exclude<TopicAction, { chat: unknown }>;

/** What a new lesson on the topic does: `topicAction` with no session. */
export function freshAction(topic: CourseMapTopic, map: CourseMap): FreshAction {
	const action = topicAction(topic, map, []);
	// With no session there is none to open; the branch only narrows the type.
	return "chat" in action ? { kind: "start", opening: topic.title } : action;
}

/** The icon a resume line or chip leads with, the one the rest of the app
 *  uses for the same thing: the reply mark, the tutor's spinner, the
 *  review clock, the task bookmark, or the topic's pie. */
export type ResumeIcon = "reply" | "writing" | "review" | "task" | "standing";

/** The page's action as the resume line says it. */
export interface ResumeLine {
	kind: TopicAction["kind"];
	icon: ResumeIcon;
	/** What waits, in a few words: "Your turn in today's lesson". */
	words: string;
	/** Where, when known: the step the lesson is on, the task's step. */
	detail: string | null;
	/** The press: "Resume", "Review", "Start". */
	press: string;
}

/** A session's name in a sentence: "today's lesson", "lesson of Tue 3 Nov". */
export function sessionName(entry: SessionEntry, today: string): string {
	const words = lessonWords(entry.day, today, entry.chat.kind === "practice" ? "practice" : "lesson");
	return words.charAt(0).toLowerCase() + words.slice(1);
}

const entryOf = (facts: TopicFacts, id: string) => facts.sessions.find((entry) => entry.chat.id === id);

/** Every one of the action table's seven rows as the line says it. */
export function resumeLine(facts: TopicFacts): ResumeLine {
	const { action } = facts;
	const press = ACTION_WORDS[action.kind];
	switch (action.kind) {
		case "resume":
		case "open": {
			const entry = entryOf(facts, action.chat.id);
			const name = entry ? sessionName(entry, facts.today) : "the lesson";
			const pickup = facts.pickups.find((p) => p.kind === "session" && p.chat.id === action.chat.id);
			const where = pickup?.kind === "session" && pickup.where !== WRITING ? pickup.where : null;
			return action.kind === "resume"
				? { kind: action.kind, icon: "reply", words: `Your turn in ${name}`, detail: where, press }
				: { kind: action.kind, icon: "writing", words: `The tutor is writing in ${name}`, detail: where, press };
		}
		case "review":
			return { kind: action.kind, icon: "review", words: facts.marks.find((mark) => mark.kind === "review")?.words ?? "Review due", detail: null, press };
		case "continue":
			return action.task
				? { kind: action.kind, icon: "task", words: action.task.title, detail: action.task.step, press }
				: { kind: action.kind, icon: "standing", words: facts.standing?.words ?? "Still learning", detail: null, press };
		case "start":
			return { kind: action.kind, icon: "standing", words: facts.standing?.words ?? "Not started", detail: null, press };
		case "study":
			return { kind: action.kind, icon: "review", words: facts.marks.find((mark) => mark.kind === "review")?.words ?? "Nothing due", detail: null, press };
	}
}
