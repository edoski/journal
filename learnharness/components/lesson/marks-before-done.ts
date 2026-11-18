import { partKey } from "@/components/lesson/roadmap-facts";
import { QUESTION_TOOLS } from "@/src/core";

/** A transcript part as this reading needs it. */
interface Part {
	type: string;
	text?: string;
	state?: string;
}

/** Parts that put words or a question on his screen. */
const SHOWS = new Set(["tool-send_to_user", "tool-problem", ...QUESTION_TOOLS.map((tool) => `tool-${tool}`)]);

/** Where each problem's close that answers his work from before Done for
 *  today goes: above the Done for today line, beside the answer it marks,
 *  not under it (round 14, 4 aspect 6: ⌘⇧D 2.5 s after a practice answer,
 *  and its "Right · On your own · Guessing" sat under the line, away from
 *  the answer). The close turn after his Done for today concludes his
 *  problem first, then writes its closing words: the conclude parts before
 *  any words are his answer's, drawn at the line's index (`before`) and
 *  skipped in their reply (`moved`, by `partKey`). Pure. */
export function marksBeforeDone(messages: ReadonlyArray<{ role: string; parts: readonly Part[] }>): { before: Map<number, Array<{ message: number; part: number }>>; moved: Set<string> } {
	const before = new Map<number, Array<{ message: number; part: number }>>();
	const moved = new Set<string>();
	messages.forEach((m, at) => {
		if (m.role !== "user" || !m.parts.some((p) => p.type === "data-done-tonight")) return;
		const reply = messages.findIndex((r, i) => i > at && r.role === "assistant");
		if (reply < 0 || messages.slice(at + 1, reply).some((r) => r.role === "user" && !r.parts.every((p) => p.type.startsWith("data-")))) return;
		const hoisted: Array<{ message: number; part: number }> = [];
		for (const [i, part] of messages[reply]!.parts.entries()) {
			if (part.type === "tool-conclude" && part.state !== "output-error") hoisted.push({ message: reply, part: i });
			else if ((part.type === "text" && part.text?.trim()) || SHOWS.has(part.type)) break;
		}
		if (hoisted.length === 0) return;
		before.set(at, hoisted);
		for (const h of hoisted) moved.add(partKey(h.message, h.part));
	});
	return { before, moved };
}
