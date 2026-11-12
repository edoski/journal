import type { ChatListItem, StudyCourse } from "@/src/core";

/** What the home's body receives. */
export interface HomeProps {
	/** Every course the engine read, in its listing order. */
	courses: readonly StudyCourse[];
	/** Sessions waiting on the learner's reply, most recent first. */
	waiting: readonly ChatListItem[];
	/** The engine's study day. */
	today: string;
	/** A lesson is being opened: every Continue waits. */
	busy: boolean;
	/** Open a lesson in the course with "Let's continue". */
	onContinue: (workspace: string) => void;
}
