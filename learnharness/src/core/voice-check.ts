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
	| "review-lesson"
	| "confidence"
	| "letter"
	| "reprint"
	| "operand"
	| "asks-banned"
	| "guess"
	| "predict"
	| "card"
	| "contrast"
	| "hint-question"
	| "hint-back"
	| "credit"
	| "demo-unused"
	| "unsaved"
	| "maths-words"
	| "reason-twice"
	| "card-words"
	| "unbuilt"
	| "day-part"
	| "below"
	| "pointer"
	| "arrival"
	| "own-words"
	| "mark-case"
	| "not-yet"
	| "due-reviews"
	| "undisputed"
	| "verdict-words"
	| "begun"
	| "vector"
	| "nothing-above"
	| "half-answer"
	| "title-comma"
	| "vague-moves"
	| "split-display";

export interface VoiceBreak {
	rule: VoiceRule;
	/** The words that break it, as written. */
	excerpt: string;
}

/** Sentences of prose each kind may carry, displays aside. */
export const SENTENCE_BUDGETS: Readonly<Record<TurnKind, number>> = { teach: 4, right: 4, wrong: 5, hint: 1, direct: 6, close: 2 };
/** Displays each kind may carry. */
const DISPLAYS: Readonly<Record<TurnKind, number>> = { teach: 1, right: 1, wrong: 1, hint: 0, direct: Infinity, close: 0 };

/** Phrase rules: what the voice bans in any words he reads. */
const PHRASES: ReadonlyArray<{ rule: VoiceRule; re: RegExp }> = [
	{ rule: "praise", re: /(?:^|[.!?]\s+|\n)(?:that(?:'s| is) )?(?:exactly|great|nice|perfect|excellent|spot on|well done|good (?:question|instinct|timing|catch|thinking|work|job))\b/i },
	{ rule: "praise", re: /\b(?:nice work|great job|well done|good question|good instinct|good timing|that is exactly it)\b/i },
	{ rule: "praise", re: /\b(?:is|was) (?:the|a) (?:right|good|great|nice) (?:instinct|idea|start|move|approach|thought)\b/i },
	{ rule: "preview", re: /\b(?:next (?:is|up|comes|you'?ll|we'?ll)|next,? (?:we|you)(?:'ll| will)|the next (?:question|step|problem) (?:tests|is|will)|here(?:'s| is) a fresh|now (?:we|you)(?:'ll| will)|coming up next)\b/i },
	{ rule: "narration", re: /\b(?:I(?:'ll| will| am going to|'m going to) (?:save|record|ask|check|build|verify|now|start|move|give|stop|wait)|I(?:'ve| have) (?:saved|recorded|noted|told you)|let me (?:verify|check|build|save|record|ask|start)|I'?m (?:having|waiting|saving|recording|building)|I'?ll stop)\b/i },
	// A handoff between teaching and practice needs no words of its own
	// (round 12, 3 D4: "Switching to an explanation of when three vectors
	// form a basis of ℝ³.").
	// A step announced instead of taught (round 16, m10: "Let's re-teach
	// the counting step." opening a review's first teaching step).
	{ rule: "narration", re: /(?:^|[.!?]\s+|\n)(?:let'?s|let us|we(?:'ll| will)|I(?:'ll| will))(?: now| first)? (?:re-?teach|teach|go (?:back )?over|revisit|recap|review|redo|work through|cover|fix|repair)\b/i },
	{ rule: "narration", re: /(?:^|[.!?]\s+|\n)(?:(?:let'?s|now,?|ok(?:ay)?,?) (?:switch|move|turn|go|head)|(?:now,? )?(?:switching|moving|turning|going|heading)|back)(?: (?:back|over|on|now))?(?: (?:to|into))? (?:(?:an?|the|some|your|more) )?(?:explanation|explaining|teaching|practice|practising|practicing|problems?|exercises?|lesson|review)\b/i },
	// A confident miss's contrast as a formula, closing every such reply
	// after the break was said (round 14, m15: "You held that extra freedom
	// in x widens what Ax reaches, whereas it sends more inputs onto the
	// same outputs.", "You held that the nullity is rows minus rank, but…").
	{ rule: "contrast", re: /(?:^|[.!?]\s+|\n)you held that\b|\byou (?:held|believed|assumed|thought) that\b[^.?!\n]*?\b(?:whereas|when in fact|but in fact|while in fact)\b/i },
	// What happens to a problem is on its card, never in his words (round
	// 14, m14: "This problem is closed with no mark, and the explanation
	// comes next." after Explain instead).
	{ rule: "narration", re: /\b(?:this|the|that) (?:problem|question) is (?:now )?(?:closed|concluded|set aside|over|ended)\b|\b(?:the |an )?explanation (?:comes|is coming|follows) next\b|\b(?:closed|ended|concluded) with no mark\b/i },
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
	// Round 18, m14: "your answer goes in its thinking field", the prompts'
	// own name for his box.
	{ rule: "machinery", re: /\b(?:answer|input|text|message|thinking) (?:fields?|box(?:es)?)\b|\bthe dock\b/i },
	// The open question stays above, unchanged, and the app shows no copy of
	// it (round 11, 4 minor 6: "Here is the question again." and nothing).
	// Every answer in the record stays saved, an earlier day's included, and
	// the app says when the record can't be read (round 12, 4 minor 2: "so
	// it stays unsaved", of an answer saved on 4 Nov).
	{ rule: "unsaved", re: /\bunsaved\b|\b(?:is|are|was|were|stays?|remains?)(?: still)? not (?:yet )?(?:saved|recorded|kept)\b|\b(?:isn't|aren't|wasn't|weren't)(?: yet)? (?:saved|recorded|kept)\b|\b(?:can't|cannot|couldn't|could not) be (?:saved|recorded|kept)\b/i },
	// The open question is above him, never below (round 13, 4 minor 1:
	// "the question is still open below", over "Your turn, on the question
	// above").
	{ rule: "reprint", re: /\b(?:still|stays|remains) (?:open )?below\b|\bopen below\b/i },
	{ rule: "reprint", re: /\bhere it is again\b|\bhere(?:'s| is) (?:the |that |your |this )?(?:question|it|check) (?:again|once more)\b|\b(?:I'?ll|I will|let me) (?:repeat|re-?ask|ask) (?:it|the question|that question|the check)(?: again| below)?\b|\b(?:repeating|asking) (?:it|the question) again\b/i },
	// His answer's card shows it came and how it was marked, so a line
	// saying it arrived tells him nothing (round 15, m17: "Your answer on
	// D arrived.").
	{ rule: "arrival", re: /\b(?:your|his|the) (?:answer|message|work|reply|photo)(?: (?:on|to|for|about) [^.?!\n]{1,40}?)? (?:has |have )?(?:arrived|came (?:through|in)|went through|got through|reached me|was received)\b|\bI (?:got|received|have received|'ve received|'ve got) your (?:answer|message|work|reply|photo)\b/i },
	// Its own earlier words are nothing he acts on: what is true is said
	// as itself (round 15, m17: "My earlier line saying the set was done
	// was wrong, since one problem is not a set.").
	// Round 17, m18: "A correction to what I said earlier: …", pointing at
	// a turn end he never saw.
	// Round 18, m13: "marking them as solved 'with the hint' was my error",
	// a slip of its own he never saw, told instead of the next problem.
	{ rule: "own-words", re: /\bmy (?:error|mistake|slip|fault|oversight)s?\b|\bI (?:made|have made) (?:an error|a mistake|a slip|two mistakes)\b|\b(?:mistakes|errors|slips) of mine\b|\bmy (?:earlier|last|previous|first|own) (?:line|message|words?|wording|reply|sentence|note|remark)\b|\bI (?:was wrong to (?:say|write|call)|wrongly (?:said|wrote|called)|misspoke|should(?: not|n't) have (?:said|written|called))\b|\b(?:a )?correction to what I (?:said|wrote|told you)\b|\b(?:correcting|to correct) what I (?:said|wrote)\b|\bwhat I (?:said|wrote|told you) (?:earlier|before|above)\b/i },
	// What he has not done yet is no step for him: it reads as a reproach
	// (round 16, m13: "You still haven't started Linear maps and their
	// matrices." closing a lesson under his half answer).
	{ rule: "not-yet", re: /\byou still (?:haven't|have not)\b|\byou (?:haven't|have not)(?: yet)? (?:started|begun)\b|\byou have yet to (?:start|begin)\b/i },
	// His card's words, inside a sentence, are plain lowercase words
	// (round 15, m18: "The mark stands as With help").
	{ rule: "mark-case", re: /(?<=[a-z0-9,;)]\s+)(?:With help|On your own|Partly right|Not right|Gave up|Not yet confirmed|Prediction, not counted|Guessing|Confident)\b/ },
];

const MATHS_SPANS = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\$([^$\n]+)\$/g;
const ONE_COLUMN = /\\begin\{([pbvBV]?matrix)\}([^&]*?)\\end\{\1\}/;

/** A short vector set as a column matrix in a sentence, or as a display
 *  of its own: each stacks its entries on lines of their own, so "sends
 *  (1,1) to (2,0) and (1,−1) to (0,4)" spans six lines, with "to" and
 *  "and" alone between them (round 17, m20). Written inline as a tuple,
 *  $(1,1)$, it reads as one line; display maths is for matrices and
 *  equations. The vector's maths, or null. */
export function columnVector(text: string): string | null {
	for (const m of text.matchAll(MATHS_SPANS)) {
		const inline = m[3];
		const display = m[1] ?? m[2];
		const tex = (inline ?? display ?? "").trim();
		const column = ONE_COLUMN.exec(tex);
		if (!column) continue;
		const entries = column[2]!.split(/\\\\/).filter((e) => e.trim()).length;
		if (entries > 4) continue;
		// A display is a vector alone when nothing but the column (and a
		// closing mark) is in it.
		if (inline !== undefined || tex.replace(column[0], "").replace(/[.,;\s]/g, "") === "") return tex;
	}
	return null;
}

/** Two displays joined by a lone word, which then stands alone on a line
 *  between them (round 18, m18: a practice problem set h(1,1) = (1,0,2)
 *  and h(1,−1) = (3,2,0) as two displays with "and" alone between). The
 *  word, or null. */
export function splitDisplays(text: string): string | null {
	const m = /\$\$[^$]*\$\$[ \t]*\n\s*(and|or|so|then|with|where)[ \t]*\n\s*\$\$/i.exec(text);
	return m ? m[1]! : null;
}

/** A display holding only one short equation of tuples, a map's value at
 *  a point ("h(1,1) = (1,0,2)"): a line of the sentence set apart, as a
 *  short vector alone is (round 18, m18). Its maths, or null. */
export function tupleDisplay(text: string): string | null {
	for (const m of text.matchAll(/\$\$([^$]*)\$\$|\\\[([\s\S]*?)\\\]/g)) {
		const tex = (m[1] ?? m[2] ?? "").trim();
		if (/^[A-Za-z][\w']*\s*\([^()]*\)\s*=\s*\([^()]*\)\s*[.,;]?$/.test(tex)) return tex;
	}
	return null;
}

/** A sentence that puts a question or his answer to it below the message
 *  ("…the question about P is ready for your answer below."). Right only
 *  for a question posed under it, never for one already posed, which is
 *  above him (round 14, 4 minor 1): the guard reads which. */
export function questionBelow(text: string): string | null {
	return sentences(text).map((s) => s.trim()).find((s) => /\bbelow\b/i.test(s) && /\b(?:question|answer|check|prediction)s?\b/i.test(s)) ?? null;
}

/** A hint that hands his own idea back to him to check, instead of a move
 *  or a fact he lacks (round 16, m12: "Your suspicion about row 3 is
 *  something you can check yourself, entry by entry, across all five
 *  columns." under the nudge that had asked him to check it). The
 *  sentence, or null. */
export function pointsBack(text: string): string | null {
	return sentences(prose(text).text).map((s) => s.trim()).find((s) => POINTS_BACK.test(s)) ?? null;
}

const POINTS_BACK =
	/\byour (?:own )?(?:suspicion|idea|hunch|instinct|guess|thought|intuition|claim|reasoning|draft|start|work(?:ing)?|answer)\b[^.?!]*\b(?:(?:is )?(?:something )?you can (?:check|test|verify|confirm)|can be (?:checked|tested|verified|confirmed)|is worth (?:checking|testing)|is (?:right|correct|on (?:the right )?track|a good start))\b|\b(?:check|test|verify|confirm) (?:it|this|that) (?:for )?yourself\b|\byou can (?:check|test|verify|confirm) (?:it|this|that)\b/i;

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
	return said.reduce((sum, s) => sum + costOf(s), 0);
}

/** A clause joined by a colon or a semicolon inside one sentence. */
const JOIN = /[:;]\s+(?=\S)/g;

const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length;

/** What one sentence costs against a budget: one, plus one per joined
 *  clause, plus one per `SENTENCE_WORDS` words past the first. */
function costOf(sentence: string): number {
	const joins = (sentence.match(JOIN) ?? []).length;
	return 1 + joins + Math.max(0, Math.ceil(wordCount(sentence) / SENTENCE_WORDS) - 1);
}

/** The sentences of a turn that cost more than one, each with its words
 *  and joined clauses: what a length refusal names, so the rewrite knows
 *  which sentence to split or cut (round 10: 15 of 21 refused drafts were
 *  within their budget by full stops, and the rewrite cut the wrong one). */
export function heavySentences(text: string): Array<{ sentence: string; words: number; joins: number }> {
	return sentences(prose(text).text)
		.filter((s) => costOf(s) > 1)
		.map((s) => ({ sentence: s, words: wordCount(s), joins: (s.match(JOIN) ?? []).length }));
}

/** A turn's prose words, its clauses (each sentence split where a colon or
 *  a semicolon joins one) and the words of its shortest clause: what a
 *  rewrite that drops clauses must at least cut, or it joined them. */
export function clausesOf(text: string): { words: number; clauses: number; shortest: number } {
	const plain = prose(text).text;
	const clauses = sentences(plain).flatMap((s) => s.split(JOIN)).filter((c) => /[A-Za-z]/.test(c));
	return { words: wordCount(plain), clauses: clauses.length, shortest: Math.min(...clauses.map(wordCount)) };
}

/** Every rule one tutor turn breaks. `kind` adds its budget and, after a
 *  right answer, the feedback rule; without it only the phrase rules apply. */
/** Inline maths that is an operator alone, acting on nothing (round 11,
 *  2 n9: "the dimension of im," from a lone `$\operatorname{im}$`). */
const LONE_OPERATOR = /(?<!\$)\$\s*\\(?:ker|det|dim|operatorname\{[A-Za-z]+\}|mathrm\{(?:im|rank|span|tr)\})\s*\$(?!\$)/;

/** Words set in maths type: a `\\text{…}` holding a phrase of three words
 *  or more, which reads as a sentence in KaTeX's serif (round 12, 3 D5:
 *  "A \\text{ is invertible exactly when } \\det A \\neq 0"). A label of
 *  one or two words in a formula stays ("Bin", "Bayes risk", "for"). */
const TEXT_IN_MATHS = /\\(?:text|textrm|textit|mbox)\{([^{}]*)\}/g;
export function mathsWords(text: string): string | null {
	for (const m of text.matchAll(TEXT_IN_MATHS)) {
		if ((m[1]!.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).length >= 3) return m[0];
	}
	return null;
}

export function voiceBreaks(text: string, kind?: TurnKind): VoiceBreak[] {
	const { text: plain, displays } = prose(text);
	const out = phraseBreaks(plain, new Set(kind === "direct" ? ["offer"] : []));
	if (/^#{1,6}\s/m.test(plain)) out.push({ rule: "headings", excerpt: /^#{1,6}\s.*$/m.exec(plain)![0] });
	const said = sentences(plain);
	const asked = said.filter((s) => s.trim().endsWith("?"));
	if (asked.length > 1) out.push({ rule: "questions", excerpt: asked.join(" ") });
	const lone = LONE_OPERATOR.exec(text);
	if (lone) out.push({ rule: "operand", excerpt: lone[0] });
	const words = mathsWords(text);
	if (words) out.push({ rule: "maths-words", excerpt: words });
	const vector = columnVector(text) ?? tupleDisplay(text);
	if (vector) out.push({ rule: "vector", excerpt: vector });
	const split = splitDisplays(text);
	if (split) out.push({ rule: "split-display", excerpt: split });
	if (!kind) return out;
	const load = sentenceLoad(said);
	if (load > SENTENCE_BUDGETS[kind]) out.push({ rule: "length", excerpt: `${load} sentences, budget ${SENTENCE_BUDGETS[kind]}` });
	// A formula alone is a display written inline, not a sentence.
	const symbol = said.find((s) => /^X\b/.test(s.trim()) && /[A-Za-z]{2,}/.test(s.trim().slice(1)));
	if (symbol) out.push({ rule: "symbol", excerpt: symbol });
	if (displays > DISPLAYS[kind]) out.push({ rule: "displays", excerpt: `${displays} displays, budget ${DISPLAYS[kind]}` });
	const chain = chainedDisplay(text);
	if (chain) out.push({ rule: "chain", excerpt: chain });
	if (kind === "right" && said[0] && /\b(?:is|are|was|were) (?:right|correct)\b|^(?:right|correct|yes)\b/i.test(said[0])) {
		out.push({ rule: "feedback", excerpt: said[0] });
	}
	const formula = kind === "wrong" || kind === "close" ? said.find((s) => CONTRAST_FORMULA.test(s.trim())) : undefined;
	if (formula && !out.some((b) => b.rule === "contrast")) out.push({ rule: "contrast", excerpt: formula.trim() });
	return out;
}

/** A reply to his answer that sets what he did against what is true in
 *  one "You …, whereas …" sentence: the formula round 14 removed for "You
 *  held that", back with any verb after the break was already said (round
 *  16, m10: "You counted one arrangement for one head, whereas the binomial
 *  coefficient counts all six."). Teaching may contrast two cases freely. */
const CONTRAST_FORMULA = /^you\b[^.?!]*\b(?:whereas|when in fact|but in fact|while in fact)\b/i;

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
	const unfenced = text.replace(FENCE, " ");
	const bodies = [...unfenced.matchAll(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g)].map((m) => (m[1] ?? m[2] ?? "").trim());
	for (const body of bodies) {
		// An arrow from one matrix to the next is a row operation, a step
		// of the work, not a limit.
		const steps = body.replace(/\\begin\{([pbvBV]?matrix)\}[\s\S]*?\\end\{\1\}/g, "@M@").replace(/@M@\s*(?:\\xrightarrow\{[^}]*\}|\\(?:to|rightarrow|longrightarrow)(?![A-Za-z])|→|⟶|\\sim(?![A-Za-z]))\s*(?=@M@)/g, "@M@ ");
		for (const line of steps.split(/\\\\/)) {
			const kinds = lineRelations(line);
			if (new Set(kinds).size > 1) return body;
			// Two steps joined by words in one line, "… = 1, so c = e^{-3}"
			// (round 10, 3 m5): each is its own display.
			if (kinds.length > 1 && STEP_WORDS.test(line)) return body;
		}
	}
	// Inline maths in a line of prose states one relation of one kind
	// (round 10, 3 m5: "3n ln(1 + 2/n) ≈ 3n · 2/n = 6" inside feedback).
	const inline = [...unfenced.replace(/\$\$[\s\S]*?\$\$/g, " ").matchAll(/(?<![\\$])\$([^$\n]+)\$(?!\$)/g)].map((m) => m[1]!.trim());
	return inline.find((body) => new Set(lineRelations(body)).size > 1) ?? null;
}

/** Words inside a display that join a second step to the first. */
const STEP_WORDS = /\\text\{[^}]*\b(?:so|hence|thus|therefore|giving|which gives)\b[^}]*\}|\\(?:therefore|implies|Rightarrow|Longrightarrow)(?![A-Za-z])/;

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
/** "and why", "why or why not", "and how do you know?", "and what makes
 *  you think so?": a reason asked for with the answer, part of the one ask. */
const BARE_WHY = /^(?:why(?:\s+or\s+why\s+not|\s+not)?|how (?:do|can|would) you (?:know|tell)(?: that)?|what makes you (?:think|say) so)\s*[?.]?$/i;
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

/** The asks of a question that are all his own words: each one's content
 *  words are in the message he sent, as when he typed a sheet's part and
 *  the tutor poses it (round 12, 2 n5: "and check it against rank-nullity"
 *  dropped, since two asks were refused). */
export function asksAreHis(text: string, words: string | null): boolean {
	if (!words) return false;
	const his = stems(prose(words).text);
	const asks = questionAsks(text);
	// An ask whose words are all maths has none of his to match ("What is
	// $\dim \ker A$?" beside his "rank 2"), so it is never his.
	return asks.length > 0 && asks.every((ask) => {
		const own = contentStems(ask);
		return own.length > 0 && own.every((w) => his.has(w));
	});
}

/** A mark said with the record's confidence word, not the card's: "on
 *  your own, sure" where the card says "Confident" (round 12, 2 n5). */
export function recordConfidenceWord(text: string): string | null {
	return /\b(?:on your own|with help|partly right|not right|right|gave up)\s*,\s*(?:(?:not )?sure|unsure|a guess|guess|guessed)\b/i.exec(text)?.[0] ?? null;
}

/** A mark said in the record's words, not his card's: the confidence word
 *  (`recordConfidenceWord`), or a result the record names, "marked
 *  incorrect and sure", "correct with help" (round 16, m14: a save reply
 *  read "The first … is marked incorrect and sure. The second … is marked
 *  correct with help." over cards reading "Not right · Confident" and
 *  "Right · With help"). */
export function recordMarkWords(text: string): string | null {
	return recordConfidenceWord(text) ?? RECORD_MARK.exec(prose(text).text)?.[0] ?? null;
}

const RECORD_MARK =
	/\b(?:marked|saved|recorded|graded|counted)(?: as)? (?:correct|incorrect|partial(?:ly correct)?)\b(?:,? (?:and )?(?:sure|unsure|not sure|a guess|guess(?:ing)?|with help|on (?:your|his) own)\b)?|\b(?:correct|incorrect|partial)\b,? (?:and )?(?:sure|unsure|not sure|a guess|guessing|with help|on (?:your|his) own)\b/i;

/** A "Show that…" or "Prove…" that also ends ", and why?": it already asks
 *  for his reason (round 12, 2 n5: "Show that dim ker A = 2, and why?"). */
export function reasonAskedTwice(text: string): string | null {
	const last = sentences(prose(text).text).filter((s) => s.trim()).at(-1)?.trim() ?? "";
	return /^(?:show|prove|explain|justify|derive|verify|deduce)\b[^?]*,\s*and why\?$/i.test(last) ? last : null;
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
/** A sentence that asks him for his next move: a question, or an
 *  instruction to type, send, find or show something. */
const NEXT_MOVE = /\?$|^(?:type|send|paste|write|give|find|compute|show|prove|try|answer|name|tell)\b/i;

export function repeatedPoint(text: string, earlier: readonly string[]): { said: string; before: string } | null {
	const before = earlier.flatMap((t) => sentences(prose(t).text)).map((s) => {
		const run = contentStems(s);
		return { s, set: new Set(run), facts: factsOf(s), runs: new Set(run.slice(0, Math.max(0, run.length - SHARED_RUN + 1)).map((_, i) => run.slice(i, i + SHARED_RUN).join(" "))) };
	});
	for (const said of sentences(prose(text).text)) {
		// An ask for his next move asks for something new each time (round
		// 12, 2 n5: "Type what part (e) asks." refused as "Type what part (d)
		// asks." again, and the turn ended asking nothing).
		if (NEXT_MOVE.test(said.trim())) continue;
		const run = contentStems(said);
		const mine = new Set(run);
		const facts = factsOf(said);
		const runs = run.slice(0, Math.max(0, run.length - SHARED_RUN + 1)).map((_, i) => run.slice(i, i + SHARED_RUN).join(" "));
		const match = before.find((b) => {
			// A day or a number the earlier sentence lacks is news, however
			// alike the words (round 10: a review's new day was refused as
			// the old day said again).
			if ([...facts].some((f) => !b.facts.has(f))) return false;
			const shared = [...mine].filter((w) => b.set.has(w)).length;
			return (shared >= SHARED_RUN && shared * 2 > mine.size) || runs.some((r) => b.runs.has(r));
		});
		if (match) return { said, before: match.s };
	}
	return null;
}

/** A callout ("> …") that makes again a point the same message's prose
 *  made above it (round 10, 3 m9: "A square matrix A is invertible exactly
 *  when det A ≠ 0." boxed under the paragraph that said so): the callout's
 *  sentence and the one it restates, or null. */
export function restatingCallout(text: string): { said: string; before: string } | null {
	const lines = text.split("\n");
	const callout = lines.filter((l) => /^\s*>/.test(l)).map((l) => l.replace(/^\s*>\s?/, "")).join(" ").trim();
	const rest = lines.filter((l) => !/^\s*>/.test(l)).join("\n").trim();
	return callout && rest ? repeatedPoint(callout, [rest]) : null;
}

/** The days and numbers a sentence states, each as written in lower case. */
function factsOf(sentence: string): Set<string> {
	return new Set((sentence.toLowerCase().match(/\b(?:\d+(?:[.,]\d+)?|today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/g) ?? []));
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

/** Each matrix a text names with a capital letter, "A = \begin{pmatrix}…",
 *  as the letter and its entries without spacing. */
function namedMatrices(text: string): { letter: string; entries: string; written: string }[] {
	return [...text.matchAll(/(?<![\\A-Za-z])([A-Z])\s*=\s*\\begin\{([pbBvV]?matrix)\}([\s\S]*?)\\end\{\2\}/g)].map((m) => ({ letter: m[1]!, entries: m[3]!.replace(/\s+/g, ""), written: m[0] }));
}

/** A letter the text gives a matrix that the session already gave another
 *  (round 10, 3 m7: seven matrices named A in one lesson, and B both a
 *  rank-2 matrix and the undoing matrix), so he cannot tell which A a later
 *  step means. The first such naming, or null. */
export function reusedLetter(text: string, earlier: readonly string[]): { letter: string; written: string } | null {
	const before = new Map<string, string>();
	for (const e of earlier) for (const m of namedMatrices(e)) before.set(m.letter, m.entries);
	const reused = namedMatrices(text).find((m) => before.has(m.letter) && before.get(m.letter) !== m.entries);
	return reused ? { letter: reused.letter, written: reused.written } : null;
}

/** A sentence that credits him with work on a matrix he never worked on:
 *  "the two roots you found for $A$" when he found $C$'s (round 14, m18).
 *  `his` is what he worked on: his own words and the question his answer
 *  replies to. A matrix is a capital letter in maths; `I` is left alone,
 *  since it is also the identity. The letter, or null. */
export function creditedLetter(text: string, his: readonly string[]): { letter: string; said: string } | null {
	const re = /\byou(?:'ve| have)? (?:found|computed|got|worked out|derived|calculated|wrote|solved|gave)\b[^.?!\n]{0,60}?\b(?:for|of|from|on) \$\s*([A-HJ-Z])\s*\$/g;
	for (const m of text.matchAll(re)) {
		const letter = m[1]!;
		const named = new RegExp(`(?:^|[^A-Za-z\\\\])${letter}(?![A-Za-z])`);
		if (!his.some((words) => named.test(words))) return { letter, said: m[0] };
	}
	return null;
}

/** A sentence that tells him how sure he was ("You were sure the kernel
 *  came from the number of rows."): his card shows his confidence, so it
 *  only narrates (round 10, 3 m3: practice's closing words). */
export function narratedConfidence(text: string): string | null {
	return sentences(prose(text).text).find((s) => /^\s*you (?:were|felt|seemed|sounded) (?:so |very |quite )?(?:sure|confident|certain)\b/i.test(s))?.trim() ?? null;
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

/** A day the close names with part of what it holds: the close lists one
 *  of the day's items that is not the lesson's own (`own`, titles) and
 *  leaves out another, so he would plan that day on half of it (round 14,
 *  m4: Wed 11's close named the Matrix multiplication review and Linear
 *  maps, and left out the Determinants review). `days` is the close
 *  result's `day_items`, each day with the lesson's own topics' titles. The excerpt names the day and what it left out. */
export function partialDay(text: string, days: Readonly<Record<string, { day_words: string; items: readonly string[]; lesson: readonly string[] }>>): string | null {
	const said = text.toLowerCase();
	for (const { day_words: words, items, lesson } of Object.values(days)) {
		const mine = lesson.map((t) => t.toLowerCase());
		const long = (words.split(", ").find((w) => /\d/.test(w)) ?? words).toLowerCase();
		const named = said.includes(long) || (words.startsWith("tomorrow") && /\btomorrow\b/.test(said));
		if (!named) continue;
		const titles = items.map((item) => item.replace(/ (?:review|starts|lesson continues)$/, ""));
		const listed = titles.filter((t) => said.includes(t.toLowerCase()));
		const missing = items.filter((_, i) => !said.includes(titles[i]!.toLowerCase()));
		if (missing.length > 0 && listed.some((t) => !mine.includes(t.toLowerCase()))) return `${words}: ${missing.join(", ")}`;
	}
	return null;
}
