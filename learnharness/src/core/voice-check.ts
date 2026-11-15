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
 *
 * The turn guard (src/agent/voice-guard.ts) adds the rules a turn needs its
 * context for: advice under a question, advice said earlier in the session,
 * and his answer handed back to him.
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
	| "compound"
	| "verdict"
	| "symbol"
	| "options"
	| "headings"
	| "repeat"
	| "advice"
	| "echo"
	| "duplicate"
	| "colon"
	| "backref"
	| "chain"
	| "moral"
	| "reason"
	| "machinery"
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
	{ rule: "praise", re: /\b(?:is|was) (?:the|a) (?:right|good|great|nice) (?:instinct|idea|start|move|approach|thought)\b/i },
	{ rule: "preview", re: /\b(?:next (?:is|up|comes|you'?ll|we'?ll)|next,? (?:we|you)(?:'ll| will)|the next (?:question|step|problem) (?:tests|is|will)|here(?:'s| is) a fresh|now (?:we|you)(?:'ll| will)|coming up next)\b/i },
	{ rule: "narration", re: /\b(?:I(?:'ll| will| am going to|'m going to) (?:save|record|ask|check|build|verify|now|start|move|give|stop|wait)|I(?:'ve| have) (?:saved|recorded|noted|told you)|let me (?:verify|check|build|save|record|ask|start)|I'?m (?:having|waiting|saving|recording|building)|I'?ll stop)\b/i },
	{ rule: "plan", re: /(?:^|\n)\s*(?:today|this lesson|in this lesson|the goal)\s*:/i },
	{ rule: "plan", re: /\b(?:we'?ll start with|let'?s start with|so first|first,? a (?:check|question) on|before (?:we|you) (?:compute|start|go on|move on|begin)|needs? one clean answer|planned to start|is planned for|comes back for review today, so|the lesson (?:starts|will start|begins|opens) with)\b/i },
	{ rule: "offer", re: /\b(?:want (?:a|me to|to)|would you like|shall (?:we|I))\b[^.?!\n]*\?/i },
	{ rule: "comprehension", re: /\b(?:does (?:that|this) make sense|is that clear|any questions)\b/i },
	// The voice's colon goes only before a display, a list or a definition's
	// body, never after the verdict (round 9: "That's not right: the rank is 2…").
	{ rule: "colon", re: /(?:^|[.!?]\s+|\n)(?:(?:that|this|it)(?:'s| is) )?(?:not (?:quite )?(?:right|correct|complete)|(?:partly|partially|half) right|wrong)\s*:/i },
	// A pointer back instead of the thing itself, which he must check against
	// the screen (round 9: "The base is the same as before" when it was not).
	{ rule: "backref", re: /\b(?:the )?same as (?:before|last time|above|earlier|the last (?:one|question|problem))\b|\bas (?:before|last time)\b/i },
	// The app's own parts are nothing he talks about (round 9: "Your message
	// arrived in the answer field…, so that question is now closed").
	{ rule: "machinery", re: /\b(?:answer|input|text|message) (?:field|box)\b|\bthe dock\b/i },
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

/** The sentences of a prose text, list markers and callout marks dropped,
 *  and table rows left out: a table is read like a display. */
export function sentences(text: string): string[] {
	const lines = text
		.split(/\n+/)
		.filter((l) => !/^\s*\|/.test(l))
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
	// An en dash joining two names or numbers ("rank–nullity", "3–5") is
	// part of the name, not punctuation (round 8: "rank–nullity" refused).
	const dash = /—|(?<![\p{L}\p{N}])–|–(?![\p{L}\p{N}])/u.exec(text);
	if (dash) out.push({ rule: "dash", excerpt: text.slice(Math.max(0, dash.index - 20), dash.index + 20) });
	return out;
}

/** Words a sentence may carry before it counts as two: past this, a
 *  sentence is two ideas glued with commas (round 8: a 7-sentence draft
 *  came back as one long sentence and passed). Twenty-five words is the
 *  plain-language ceiling GOV.UK's style guide sets; the voice states it,
 *  each formula counting as one word. */
export const SENTENCE_WORDS = 25;

/** The sentences a text costs him to read: each sentence, plus each
 *  clause it joins with a colon or semicolon (a colon before a display or
 *  a list ends its line, so it joins nothing), plus one for every
 *  `SENTENCE_WORDS` words past the first (round 8: length rewrites glued
 *  sentences with colons and commas, and a count of full stops passed them). */
export function sentenceLoad(said: readonly string[]): number {
	return said.reduce((sum, s) => {
		const joins = (s.match(/[:;]\s+(?=\S)/g) ?? []).length;
		const words = (s.match(/\S+/g) ?? []).length;
		return sum + 1 + joins + Math.max(0, Math.ceil(words / SENTENCE_WORDS) - 1);
	}, 0);
}

const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length;

/** A turn's prose words, and the words of its shortest sentence: what
 *  cutting one whole sentence takes off it at the least. */
export function lengthOf(text: string): { words: number; shortest: number } {
	const plain = prose(text).text;
	return { words: wordCount(plain), shortest: Math.min(...sentences(plain).map(wordCount)) };
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
	const load = sentenceLoad(said);
	if (load > SENTENCES[kind]) out.push({ rule: "length", excerpt: `${load} sentences, budget ${SENTENCES[kind]}` });
	// A formula alone is a display written inline, not a sentence.
	const symbol = said.find((s) => /^X\b/.test(s.trim()) && /[A-Za-z]{2,}/.test(s.trim().slice(1)));
	if (symbol) out.push({ rule: "symbol", excerpt: symbol });
	if (displays > DISPLAYS[kind]) out.push({ rule: "displays", excerpt: `${displays} displays, budget ${DISPLAYS[kind]}` });
	const chain = chainedDisplay(text);
	if (chain) out.push({ rule: "chain", excerpt: chain });
	if (kind === "right" && said[0] && /\b(?:is|are|was|were) (?:right|correct)\b|^(?:right|correct|yes)\b/i.test(said[0])) {
		out.push({ rule: "feedback", excerpt: said[0] });
	}
	return out;
}

/** Each relation a display line can state, by kind: a chain of one kind
 *  ("a = b = c", "0 < x < 1") states one relation, a mix ("= … → … =")
 *  states several. */
const RELATIONS: ReadonlyArray<{ kind: string; re: RegExp }> = [
	{ kind: "equal", re: /^=/ },
	{ kind: "unequal", re: /^(?:≠|\\neq?(?![A-Za-z]))/ },
	{ kind: "below", re: /^(?:<|≤|\\(?:leq?|lt|leqslant)(?![A-Za-z]))/ },
	{ kind: "above", re: /^(?:>|≥|\\(?:geq?|gt|geqslant)(?![A-Za-z]))/ },
	{ kind: "near", re: /^(?:≈|\\approx(?![A-Za-z]))/ },
	{ kind: "tends", re: /^(?:→|⟶|\\(?:to|rightarrow|longrightarrow)(?![A-Za-z]))/ },
	{ kind: "implies", re: /^(?:⇒|⟹|⇔|⟺|\\(?:Rightarrow|Longrightarrow|implies|iff|Leftrightarrow)(?![A-Za-z]))/ },
	{ kind: "same", re: /^(?:≡|\\equiv(?![A-Za-z]))/ },
];

/** The relation kinds a line of TeX states at its own level: none inside
 *  braces, brackets or parentheses, or in a sub- or superscript ("P(X = k)",
 *  "\\lim_{n \\to \\infty}" state none). */
function lineRelations(line: string): string[] {
	const kinds: string[] = [];
	let depth = 0;
	for (let i = 0; i < line.length; i++) {
		const c = line[i]!;
		if (c === "\\" && /^\\(?:left|right|big|Big|bigg|Bigg)[lr]?(?![A-Za-z])/.test(line.slice(i))) {
			i += /^\\[A-Za-z]+/.exec(line.slice(i))![0].length - 1;
			continue;
		}
		if (c === "{" || c === "(" || c === "[") depth++;
		else if (c === "}" || c === ")" || c === "]") depth = Math.max(0, depth - 1);
		else if ((c === "_" || c === "^") && line[i + 1] !== "{") i++;
		else if (depth === 0) {
			const rel = RELATIONS.find((r) => r.re.test(line.slice(i)));
			if (rel) kinds.push(rel.kind);
		}
	}
	return kinds;
}

/** A display line that states two kinds of relation, as one chain: the
 *  voice sets one relation per display (round 9: "(1−1/n)^{2n} = [(1−1/n)^n]^2
 *  → (e^{−1})^2 = e^{−2}" chained an equality into a limit and back). Its
 *  TeX, or null. A matrix's rows and an aligned derivation's lines are read
 *  one by one. */
export function chainedDisplay(text: string): string | null {
	const bodies = [...text.replace(FENCE, " ").matchAll(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g)].map((m) => (m[1] ?? m[2] ?? "").trim());
	for (const body of bodies) {
		// An arrow from one matrix to the next is a row operation, a step
		// of the work, not a limit.
		const steps = body.replace(/\\begin\{([pbvBV]?matrix)\}[\s\S]*?\\end\{\1\}/g, "@M@").replace(/@M@\s*(?:\\xrightarrow\{[^}]*\}|\\(?:to|rightarrow|longrightarrow)(?![A-Za-z])|→|⟶|\\sim(?![A-Za-z]))\s*(?=@M@)/g, "@M@ ");
		for (const line of steps.split(/\\\\/)) {
			if (new Set(lineRelations(line)).size > 1) return body;
		}
	}
	return null;
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

/** Words that open an ask: a question word, a verb a question starts
 *  with, or a task. */
const ASK_OPENS =
	/^(?:what|which|who|whom|whose|when|where|why|how|whether|is|are|was|were|do|does|did|can|could|would|should|will|has|have|find|compute|give|name|write|show|prove|say|explain|state|list|turn|confirm|check|verify|determine|decide|describe|sketch|draw|derive|calculate|evaluate|solve|identify|predict|construct)\b/i;
/** Words that open an ask after a bare "and" or "then": a question word
 *  or a task, never a verb like "is", which also joins a description
 *  ("lies in ker A and is nonzero", "why does Ax = b then have…"). */
const ASK_AFTER_AND =
	/\s+(?:and\s+then|and|then)\s+(?=(?:what|which|who|whom|whose|when|where|why|how|whether|find|compute|give|name|write|show|prove|say|explain|state|list|turn|confirm|check|verify|determine|decide|describe|sketch|draw|derive|calculate|evaluate|solve|identify|predict|construct)\b)/i;
/** "and why", "why or why not", "and how do you know?": a reason asked
 *  for with the answer, part of the one ask. */
const BARE_WHY = /^(?:why(?:\s+or\s+why\s+not|\s+not)?|how (?:do|can|would) you (?:know|tell)(?: that)?)\s*[?.]?$/i;
/** "When you meet v…", "Where the curve turns…": a clause that sets the
 *  scene, unless a verb asks next ("When does it converge?"). */
const SCENE = /^(?:when|where)\b(?!\s+(?:does|do|did|is|are|was|were|will|would|can|could|should|has|have)\b)/i;

/** The asks of a question: its clauses that ask something of him, joined
 *  by commas, "then", "and" or a new sentence ("What is the rank of A,
 *  what is dim ker A, and is A invertible?" asks three). Alternatives
 *  ("…, or …") and a reason asked for with the answer ("…, and why?") stay
 *  one ask, and a colon opens a clause like a comma ("What do you know
 *  about X: what it counts, and its formula?" asks two). Maths is read as
 *  one word. */
export function questionAsks(text: string): string[] {
	const out: string[] = [];
	// A display is part of its sentence here ("Show that $$N$$ is not invertible").
	const said = sentences(prose(text.replace(/\s*(?:\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])\s*/g, " X ")).text);
	// What sits under the last question is advice, its own rule.
	const last = said.map((s) => s.trim().endsWith("?")).lastIndexOf(true);
	for (const sentence of last < 0 ? said : said.slice(0, last + 1)) {
		if (ADVICE.test(sentence)) continue;
		const clauses = sentence
			.replace(/^(?:then|and|also|now)\b[,\s]*/i, "")
			.split(/\s*[;:]\s*|,\s*(?:and\s+|then\s+)?/i)
			.flatMap((c) => c.split(ASK_AFTER_AND))
			.map((c) => c.trim().replace(/^(?:and|then)\s+/i, ""));
		for (const clause of clauses) if (ASK_OPENS.test(clause) && !BARE_WHY.test(clause) && !SCENE.test(clause)) out.push(clause);
	}
	return out;
}

/** A question's text that asks more than one thing (`questionAsks`), or
 *  null. */
export function compoundAsk(text: string): VoiceBreak | null {
	const asks = questionAsks(text);
	return asks.length > 1 ? { rule: "compound", excerpt: asks.join(" / ") } : null;
}

/** Whether a reply's last sentence leaves him a move: a question, or an
 *  instruction he can act on ("Look at the rows.", "Plug $v$ back in."). */
export function leavesAWayOn(text: string): boolean {
	const last = sentences(prose(text).text).at(-1)?.trim() ?? "";
	return last.endsWith("?") || ASK_OPENS.test(last) || /^(?:look|try|plug|put|substitute|multiply|recheck|redo|recompute|start|go back|use|take|set|write|read|compare)\b/i.test(last);
}

/** A sentence of advice on how he should work: checking, verifying, what
 *  to think of, where to stop, what would have caught a slip. */
const ADVICE =
	/^(?:check|verify|make sure|remember|be careful|note that|don'?t forget|try to|think of|always)\b|^(?:before|when|whenever|if) you\b[^,]*,\s*(?:check|verify|multiply|make sure|always)\b|\b(?:should have caught|would have caught|protects you|you can stop there|stop there)\b/i;

/** An instruction under a problem's question that asks him to defend his
 *  answer rather than asking for the reason in the question ("Justify your
 *  answer."). */
const DEFEND = /^(?:justify|explain|give reasons for|show) (?:your|the|each) (?:answer|reasoning|work(?:ing)?|steps?)\b/i;

/** The advice in a problem's statement: advice sentences, and an
 *  instruction under its last question to defend the answer. A statement's
 *  later parts are its own asks, so only these count. */
export function problemAdvice(text: string): string[] {
	return [...new Set([...adviceSentences(text), ...afterQuestion(text).filter((s) => DEFEND.test(s.trim()))])];
}

/** The sentences of a text that give advice on how to work. */
export function adviceSentences(text: string): string[] {
	return sentences(prose(text).text).filter((s) => ADVICE.test(s));
}

const STOP = new Set(
	"a an the of to it its it's your you you're by on in at and or but is are was were be been that this these those when before after every each one only would should could have has had with for from as so if then there here not no what which who how why where yet can does do did also just than into out more most very same any some they them their his him he".split(" "),
);

/** A word cut to a rough stem, so "rows" and "row", "catches" and "catch",
 *  "multiplying" and "multiply" read as one. */
function stem(w: string): string {
	if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
	if (w.length > 4 && w.endsWith("ied")) return `${w.slice(0, -3)}y`;
	if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
	if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
	if (w.length > 4 && /(?:ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
	if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
	return w;
}

/** The content words of a sentence in their order, each cut to its stem. */
function contentStems(sentence: string): string[] {
	return (sentence.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !STOP.has(w) && w !== "x" && w.length >= 3).map(stem);
}

/** The content words of a sentence, each cut to a rough stem, so "multiply
 *  it out" and "multiplying out" share one. */
function stems(sentence: string): Set<string> {
	return new Set(contentStems(sentence));
}

/** The first advice sentence of `text` that says again what an advice
 *  sentence of `earlier` said: two content words in common, however
 *  reworded. Null when none repeats. */
export function repeatedAdvice(text: string, earlier: readonly string[]): { said: string; before: string } | null {
	const before = earlier.flatMap(adviceSentences).map((s) => ({ s, stems: stems(s) }));
	for (const said of adviceSentences(text)) {
		const mine = stems(said);
		const match = before.find((b) => [...mine].filter((w) => b.stems.has(w)).length >= 2);
		if (match) return { said, before: match.s };
	}
	return null;
}

/** Content words in a row two sentences share, past which the later one
 *  reuses the earlier one's phrase ("a combination of two others"). */
const SHARED_RUN = 3;

/** The first sentence of `text` that makes again a point a sentence of
 *  `earlier` made: at least three content words in common that are most of
 *  its own, or three in a row, however the rest is reworded (round 9: "…a
 *  row can be a combination of two others, which checking pairs never
 *  catches", then "Counting pivots after elimination is what catches a
 *  column hiding as a combination of two others"). Null when none does. */
export function repeatedPoint(text: string, earlier: readonly string[]): { said: string; before: string } | null {
	const before = earlier.flatMap((t) => sentences(prose(t).text)).map((s) => {
		const run = contentStems(s);
		return { s, set: new Set(run), runs: new Set(run.slice(0, Math.max(0, run.length - SHARED_RUN + 1)).map((_, i) => run.slice(i, i + SHARED_RUN).join(" "))) };
	});
	for (const said of sentences(prose(text).text)) {
		const run = contentStems(said);
		const mine = new Set(run);
		const runs = run.slice(0, Math.max(0, run.length - SHARED_RUN + 1)).map((_, i) => run.slice(i, i + SHARED_RUN).join(" "));
		const match = before.find((b) => {
			const shared = [...mine].filter((w) => b.set.has(w)).length;
			return (shared >= SHARED_RUN && shared * 2 > mine.size) || runs.some((r) => b.runs.has(r));
		});
		if (match) return { said, before: match.s };
	}
	return null;
}

/** A direct answer's last sentence that draws a lesson from it instead of
 *  answering: it opens "So …" or ends "…, which is why …", and what it draws
 *  holds no maths or number, so it states no step (round 9: "So checking for independent,
 *  steady arrivals comes before reaching for Poisson at all."). */
export function closingMoral(text: string): string | null {
	const last = sentences(prose(text).text).at(-1)?.trim();
	if (!last || last.endsWith("?")) return null;
	const tail = /^(?:so|that(?:'s| is) why|this is why|which is why)\b.*|,\s*which is why\b.*$/i.exec(last)?.[0];
	return tail && !/\bX\b|\d/.test(tail) ? last : null;
}

/** The prose sentences after a message's last question: what sits under
 *  the question, list items aside (a question's options). */
export function afterQuestion(text: string): string[] {
	const lines = prose(text)
		.text.split(/\n+/)
		.filter((l) => !/^\s*(?:[-*+]|\d+\.)\s/.test(l))
		.join("\n");
	const said = sentences(lines);
	const last = said.map((s) => s.trim().endsWith("?")).lastIndexOf(true);
	return last < 0 ? [] : said.slice(last + 1);
}

/** A first sentence that hands his answer back to him or grades a right
 *  one: "You got it right: …", "Yes, …", "That is right, …" always; "That
 *  is X, …" and "The product is X, …" when X is what he answered. */
const GRADES =
	/^(?:you got (?:it|(?:[a-z]+ ){0,3}(?:right|correct))\b|you(?:'re| are) right|you said|your answer (?:is|was)|yes\b|(?:that|this|it)(?:'s| is) (?:right|correct)\b|(?:right|correct)[,.:]|(?:that|this|it|your (?:reasoning|argument|logic|method|idea|approach|step|working|route)|(?:that|this) (?:reasoning|argument|logic|method|idea|approach|step|working|route)) (?:holds|works|is (?:sound|valid|right|correct|complete|fine|good|exactly right))\b)/i;
/** "Your last answer is right", "Both parts are correct": a right answer
 *  called right, where no "but" goes on to where it broke. */
const CALLED_RIGHT = /^(?:[a-z]+ ){1,4}(?:is|are|was|were) (?:right|correct)\b/i;
const RESTATES = /^(?:(?:that|this|it)(?:'s| is) X\b|the [a-z]+(?: [a-z]+){0,3} (?:is|are) X\s*[,.])/i;

/** Words that give a reason, which a reply to an unsure answer owes him. */
const REASON = /\b(?:because|since|so|as|means|which is why|that is why|comes from|follows|each|every|for all)\b/i;

/** A reply to an answer he was unsure of that opens by stating what he
 *  answered ("The PMF is …, where λ is the average count") and gives no
 *  reason anywhere (round 9: a guessed right answer got its own formula
 *  back). The opening sentence, or null. */
export function restatesWithoutReason(text: string): string | null {
	const said = sentences(prose(text).text);
	const first = said[0]?.trim();
	if (!first || !RESTATES.test(first)) return null;
	return said.some((s) => REASON.test(s)) ? null : first;
}

const bare = (math: string) => math.replace(/\\(?:left|right)|[\s${}]/g, "");

/** The opening sentence of a reply to his answer when it echoes or grades
 *  his answer instead of starting with the content; `answer` is his words. */
export function echoOf(text: string, answer: string | null): string | null {
	const raw = sentences(text.replace(FENCE, " ").replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, "\n"))[0]?.trim();
	const plain = raw ? sentences(prose(raw).text)[0]?.trim() : undefined;
	if (!raw || !plain) return null;
	if (GRADES.test(plain) || (CALLED_RIGHT.test(plain) && !/\bbut\b|\bnot (?:right|correct)\b/i.test(plain))) return raw;
	if (!answer || !RESTATES.test(plain)) return null;
	const said = bare(answer);
	const maths = [...raw.matchAll(/\$([^$\n]+)\$/g)].map((m) => bare(m[1]!)).filter(Boolean);
	return maths.some((m) => said.includes(m)) ? raw : null;
}
