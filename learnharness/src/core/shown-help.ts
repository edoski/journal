/**
 * An answer right after its solution was shown counts as helped (Edo, 14
 * Nov 2026). The rule sits on the record's write path, so a tutor's slip
 * cannot save such an answer as his own.
 *
 * A topic's solution is shown when a practice problem on it ends without
 * his right answer (Explain instead, Show me, a wrong or partial answer:
 * the committed solution is revealed), or when a lesson question on it he
 * did not answer right reveals its answer on submit. Until his next answer
 * on that topic in the session, the topic stays shown: that answer is
 * saved with the shown solution as its help, and any answer on the topic
 * clears it. Pure.
 */

/** The help a shown solution gives, in the record's words. */
export const SHOWN_HELP = "Its solution was shown just before this answer";

type Observation = Record<string, unknown>;

const isObject = (v: unknown): v is Observation => typeof v === "object" && v !== null && !Array.isArray(v);

const topicsOf = (o: Observation): string[] => (Array.isArray(o.topics) ? o.topics.filter((t): t is string => typeof t === "string") : []);

/** An attempt saved as his own: help "none", however cased. */
const unaided = (o: Observation) => (o.kind ?? "attempt") === "attempt" && typeof o.help === "string" && o.help.trim().toLowerCase() === "none";

/** The shown topics after one saved answer: an answer right clears its
 *  topics, any other reveals their answer. Exams and self-reports show
 *  nothing and clear nothing. */
export function afterAnswer(shown: ReadonlySet<string>, o: Observation): Set<string> {
	const next = new Set(shown);
	if ((o.kind ?? "attempt") !== "attempt") return next;
	for (const topic of topicsOf(o)) {
		if (o.result === "correct") next.delete(topic);
		else next.add(topic);
	}
	return next;
}

/** A save's observations with the rule applied, in order, and the shown
 *  topics once it is saved: each attempt saved as unaided on a topic whose
 *  solution was shown since his last answer on it takes the shown solution
 *  as its help. `helped` names the topics it changed. */
export function withShownHelp(
	observations: readonly unknown[],
	shown: ReadonlySet<string>,
): { observations: unknown[]; helped: string[]; shown: Set<string> } {
	let state = new Set(shown);
	const helped: string[] = [];
	const out = observations.map((o) => {
		if (!isObject(o)) return o;
		const hit = unaided(o) ? topicsOf(o).filter((t) => state.has(t)) : [];
		const saved = hit.length > 0 ? { ...o, help: SHOWN_HELP, shown: true } : o;
		helped.push(...hit.filter((t) => !helped.includes(t)));
		state = afterAnswer(state, saved);
		return saved;
	});
	return { observations: out, helped, shown: state };
}

/** The receipt's note for the topics the rule saved as helped. */
export function shownHelpNote(helped: readonly string[]): string | null {
	return helped.length > 0 ? `${helped.join(", ")}: saved as helped, since its solution was shown just before this answer` : null;
}
