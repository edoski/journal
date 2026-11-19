/**
 * An answer to a question whose solution he had already seen counts as
 * helped (Edo, 14 Nov 2026). The rule sits on the record's write path, so a
 * tutor's slip cannot save such an answer as his own.
 *
 * It keys on the question itself, never its topic (round 4: a cold answer
 * to a brand-new question on the same topic was saved as helped). A
 * question's solution is shown once the record keeps his answer to it as
 * an attempt, which the tutor's reply then grades, or he pressed Show me,
 * and when a practice problem ends (the committed solution is revealed,
 * unless he left it for today). A question he typed into the answer box is
 * no attempt and shows nothing (fix round 18). The same words asked
 * again later, as a new question or a re-posed problem, were seen: an
 * attempt on them saved as unaided takes the shown solution as its help.
 * A different question on the same idea is his own work. Pure.
 */

/** The help a shown solution gives, in the record's words. */
export const SHOWN_HELP = "Its solution was shown just before this answer";

type Observation = Record<string, unknown>;

const isObject = (v: unknown): v is Observation => typeof v === "object" && v !== null && !Array.isArray(v);

const topicsOf = (o: Observation): string[] => (Array.isArray(o.topics) ? o.topics.filter((t): t is string => typeof t === "string") : []);

/** An attempt saved as his own: help "none", however cased. */
const unaided = (o: Observation) => (o.kind ?? "attempt") === "attempt" && typeof o.help === "string" && o.help.trim().toLowerCase() === "none";

/** A question's words, for telling the same question asked again: its
 *  text with runs of white space made one. */
export function sameQuestionKey(text: string): string {
	return text.trim().replace(/\s+/g, " ");
}

/** A save's observations with the rule applied, in order: each attempt
 *  saved as unaided whose question `seen` (given it and its place) says he
 *  had seen solved before it was asked takes the shown solution as its help. `helped` names the
 *  topics it changed. */
export function withShownHelp(observations: readonly unknown[], seen: (o: Observation, index: number) => boolean): { observations: unknown[]; helped: string[] } {
	const helped: string[] = [];
	const out = observations.map((o, index) => {
		if (!isObject(o) || !unaided(o) || !seen(o, index)) return o;
		helped.push(...topicsOf(o).filter((t) => !helped.includes(t)));
		return { ...o, help: SHOWN_HELP, shown: true };
	});
	return { observations: out, helped };
}

/** The receipt's note for the topics the rule saved as helped. */
export function shownHelpNote(helped: readonly string[]): string | null {
	return helped.length > 0 ? `${helped.join(", ")}: saved as helped, since its solution was shown just before this answer` : null;
}
