/**
 * The voice, checked (spec: src/agent/prompts/shared/10-voice.md). Pure: it
 * reads a tutor turn's text, or a prompt's text, and names each rule the
 * text breaks, so a test can hold recorded turns and every prompt to the
 * voice instead of trusting the model to read it.
 *
 * Two readings share one set of phrase rules:
 * - `voiceBreaks(text, kind)` and `sessionVoiceBreaks(turns)`: a turn he
 *   reads, with the budget for its kind and repeats across the session;
 * - `promptVoiceBreaks(text)`: an instruction text the agents read, whose
 *   quoted examples must not model what the voice bans, and which must not
 *   ask for a banned form.
 */

/** The kinds of turn the voice budgets (### How long each kind of turn is). */
export type TurnKind = "teach" | "right" | "wrong" | "hint" | "direct" | "close";

export type VoiceRule =
	| "praise"
	| "preview"
	| "narration"
	| "plan"
	| "offer"
	| "comprehension"
	| "exclamation"
	| "dash"
	| "feedback"
	| "length"
	| "displays"
	| "questions"
	| "headings"
	| "repeat"
	| "asks-banned";

export interface VoiceBreak {
	rule: VoiceRule;
	/** The words that break it, as written. */
	excerpt: string;
}

/** Sentences of prose each kind may carry, displays aside. */
const SENTENCES: Readonly<Record<TurnKind, number>> = { teach: 4, right: 4, wrong: 5, hint: 1, direct: 6, close: 2 };
/** Displays each kind may carry. */
const DISPLAYS: Readonly<Record<TurnKind, number>> = { teach: 1, right: 1, wrong: 1, hint: 0, direct: Infinity, close: 0 };

/** Phrase rules: what the voice bans in any words he reads. */
const PHRASES: ReadonlyArray<{ rule: VoiceRule; re: RegExp }> = [
	{ rule: "praise", re: /(?:^|[.!?]\s+|\n)(?:that(?:'s| is) )?(?:exactly|great|nice|perfect|excellent|spot on|well done|good (?:question|instinct|timing|catch|thinking|work|job))\b/i },
	{ rule: "praise", re: /\b(?:nice work|great job|well done|good question|good instinct|good timing|that is exactly it)\b/i },
	{ rule: "preview", re: /\b(?:next (?:is|up|comes|you'?ll|we'?ll)|next,? (?:we|you)(?:'ll| will)|the next (?:question|step|problem) (?:tests|is|will)|here(?:'s| is) a fresh|now (?:we|you)(?:'ll| will)|coming up next)\b/i },
	{ rule: "narration", re: /\b(?:I(?:'ll| will| am going to|'m going to) (?:save|record|ask|check|build|verify|now|start|move|give|stop|wait)|I(?:'ve| have) (?:saved|recorded|noted|told you)|let me (?:verify|check|build|save|record|ask|start)|I'?m (?:having|waiting|saving|recording|building)|I'?ll stop)\b/i },
	{ rule: "plan", re: /\b(?:we'?ll start with|let'?s start with|so first|first,? a (?:check|question) on|before (?:we|you) (?:compute|start|go on|move on|begin)|needs? one clean answer|planned to start|is planned for|comes back for review today, so|the lesson (?:starts|will start|begins|opens) with)\b/i },
	{ rule: "offer", re: /\b(?:want (?:a|me to|to)|would you like|shall (?:we|I))\b[^.?!\n]*\?/i },
	{ rule: "comprehension", re: /\b(?:does (?:that|this) make sense|is that clear|any questions)\b/i },
];

/** Requests in an instruction text for a form the voice bans: each names
 *  what it asks for, so the fix is to ask within the voice instead. */
const BANNED_ASKS: ReadonlyArray<{ re: RegExp; asks: string }> = [
	{ re: /\bwhat went well\b/i, asks: "praise in a close" },
	{ re: /\b(?:two or three|three or four) (?:short )?(?:lines|sentences)\b/i, asks: "a close over its two-sentence budget" },
	{ re: /\bsay in one line what you picked\b|\bwhat you picked and why\b/i, asks: "narration of what the session chose" },
	{ re: /\bone line,? then the (?:first )?question\b/i, asks: "a line before a question, which becomes a preview" },
	{ re: /\bcorrect answer gets one line\b/i, asks: "a feedback sentence on a right answer" },
	{ re: /\bannounce (?:it|what's coming)\b/i, asks: "narration of a background job" },
	{ re: /\bprogress messages\b|\bintroductions\b/i, asks: "messages about the session instead of the material" },
	{ re: /\bwrap the session in text\b/i, asks: "an unbudgeted wrap-up" },
	{ re: /\bwhere (?:the lesson will start|to start) next time\b/i, asks: "a close that may give away an open question's step" },
	{ re: /\b(?:say|a short) (?:your )?closing sentence\b/i, asks: "a sentence about the session when the probe ends" },
];

const NEGATION = /\b(?:never|no|not|don't|do not|nothing|without|instead of|rather than|ban|bans)\b/i;

/** The text with code, fences and maths set aside: inline maths becomes a
 *  placeholder word so sentences still read, displays are counted. */
function prose(text: string): { text: string; displays: number } {
	let displays = 0;
	const out = text
		.replace(FENCE, " ")
		.replace(/\$\$[\s\S]*?\$\$/g, () => {
			displays++;
			return "\n";
		})
		.replace(/\\\[[\s\S]*?\\\]/g, () => {
			displays++;
			return "\n";
		})
		.replace(/`[^`\n]*`/g, "X")
		.replace(/\$[^$\n]+\$/g, "X")
		.replace(/\\\([\s\S]*?\\\)/g, "X");
	return { text: out, displays };
}

/** A fenced block, from a line that opens with three backticks to the line
 *  that closes it: an inline mention of a fence opens nothing. */
const FENCE = /^\s*```[^\n]*\n[\s\S]*?^\s*```/gm;

const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf)\.$/i;

/** The sentences of a prose text, list markers and callout marks dropped. */
export function sentences(text: string): string[] {
	const lines = text
		.split(/\n+/)
		.map((l) => l.replace(/^\s*(?:[-*+]|\d+\.|>\s*\[![A-Z]+\]|>)\s*/, "").trim())
		.filter((l) => /[A-Za-z]/.test(l));
	const out: string[] = [];
	for (const line of lines) {
		let current = "";
		for (const piece of line.split(/(?<=[.?!])\s+/)) {
			current = current ? `${current} ${piece}` : piece;
			if (!ABBREVIATIONS.test(current)) {
				out.push(current);
				current = "";
			}
		}
		if (current) out.push(current);
	}
	return out;
}

function phraseBreaks(text: string, skip: ReadonlySet<VoiceRule> = new Set()): VoiceBreak[] {
	const out: VoiceBreak[] = [];
	for (const { rule, re } of PHRASES) {
		if (skip.has(rule) || out.some((b) => b.rule === rule)) continue;
		const m = re.exec(text);
		if (m) out.push({ rule, excerpt: m[0].trim() });
	}
	const bang = /[A-Za-z)][!](?!\[)/.exec(text);
	if (bang) out.push({ rule: "exclamation", excerpt: text.slice(Math.max(0, bang.index - 20), bang.index + 2) });
	const dash = /[–—]/.exec(text);
	if (dash) out.push({ rule: "dash", excerpt: text.slice(Math.max(0, dash.index - 20), dash.index + 20) });
	return out;
}

/** Every rule one tutor turn breaks. `kind` adds its budget and, after a
 *  right answer, the feedback rule; without it only the phrase rules apply. */
export function voiceBreaks(text: string, kind?: TurnKind): VoiceBreak[] {
	const { text: plain, displays } = prose(text);
	const out = phraseBreaks(plain, new Set(kind === "direct" ? ["offer"] : []));
	if (/^#{1,6}\s/m.test(plain)) out.push({ rule: "headings", excerpt: /^#{1,6}\s.*$/m.exec(plain)![0] });
	const said = sentences(plain);
	const asked = said.filter((s) => s.trim().endsWith("?"));
	if (asked.length > 1) out.push({ rule: "questions", excerpt: asked.join(" ") });
	if (!kind) return out;
	if (said.length > SENTENCES[kind]) out.push({ rule: "length", excerpt: `${said.length} sentences, budget ${SENTENCES[kind]}` });
	if (displays > DISPLAYS[kind]) out.push({ rule: "displays", excerpt: `${displays} displays, budget ${DISPLAYS[kind]}` });
	if (kind === "right" && said[0] && /\b(?:is|are|was|were) (?:right|correct)\b|^(?:right|correct|yes)\b/i.test(said[0])) {
		out.push({ rule: "feedback", excerpt: said[0] });
	}
	return out;
}

const SHINGLE = 6;

function words(text: string): string[] {
	return prose(text).text.toLowerCase().match(/[a-z']+/g) ?? [];
}

/** Every rule a session's turns break, each turn under its own kind, plus
 *  a run of six words a turn repeats from an earlier one: the same advice
 *  line said twice. */
export function sessionVoiceBreaks(turns: ReadonlyArray<{ text: string; kind?: TurnKind }>): Array<VoiceBreak & { turn: number }> {
	const out: Array<VoiceBreak & { turn: number }> = [];
	const seen = new Set<string>();
	turns.forEach((turn, i) => {
		for (const b of voiceBreaks(turn.text, turn.kind)) out.push({ ...b, turn: i });
		const w = words(turn.text);
		const mine = new Set<string>();
		for (let k = 0; k + SHINGLE <= w.length; k++) mine.add(w.slice(k, k + SHINGLE).join(" "));
		const repeated = [...mine].find((s) => seen.has(s));
		if (repeated) out.push({ rule: "repeat", excerpt: repeated, turn: i });
		for (const s of mine) seen.add(s);
	});
	return out;
}

/** The quoted examples of an instruction text, each with the clause that
 *  introduces it: straight or curly double quotes, outside code. */
function quotedExamples(text: string): Array<{ quote: string; clause: string }> {
	const plain = text.replace(FENCE, " ").replace(/`[^`\n]*`/g, "X");
	const out: Array<{ quote: string; clause: string }> = [];
	const re = /"([^"\n]{3,}?)"|“([^”\n]{3,}?)”/g;
	for (let m = re.exec(plain); m; m = re.exec(plain)) {
		const quote = (m[1] ?? m[2])!;
		if (!/\s/.test(quote.trim())) continue;
		const before = plain.slice(0, m.index);
		const start = Math.max(before.lastIndexOf("\n"), before.search(/[.;:][^.;:]*$/));
		out.push({ quote, clause: before.slice(start + 1) });
	}
	return out;
}

/** Every way an instruction text works against the voice: a quoted example
 *  of a banned form offered as a model (its clause carries no "never",
 *  "no" or "not"), or a request for a form the voice bans. The offer a
 *  direct answer may end on is the voice's own, so offers pass here. */
export function promptVoiceBreaks(text: string): VoiceBreak[] {
	const out: VoiceBreak[] = [];
	for (const { quote, clause } of quotedExamples(text)) {
		if (NEGATION.test(clause)) continue;
		for (const b of phraseBreaks(quote, new Set(["offer"]))) out.push({ rule: b.rule, excerpt: quote });
	}
	for (const { re, asks } of BANNED_ASKS) {
		const m = re.exec(text);
		if (m) out.push({ rule: "asks-banned", excerpt: `${m[0]} (asks for ${asks})` });
	}
	return out;
}
