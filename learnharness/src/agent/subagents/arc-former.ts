/**
 * The grouping pass: two background agents that cut a course with topics
 * and no arcs into arcs (core/arc-pass.ts holds the rules). The first
 * settles the prerequisites with the prerequisite test alone, never seeing
 * an arc. The second cuts the settled graph from the material's units with
 * arcs.md's *Forming arcs*, and cannot change a prerequisite. Each answers
 * with one submit call, which the app checks and the engine dry-runs
 * (`save --check`) before it counts; the saves go to the record as it is
 * when they are made.
 *
 * Live, it runs only for a course the app made (`new` in its ledger), on
 * events: a finished map build that saved, and the app's start for a course
 * whose pass a quit cut short. It shares the map builder's per-course hold
 * (`mapRuns`), so a build and a pass never run on one course at once. It
 * shows in the activity dock as a background run (phase "grouping") and
 * takes a permit of the shared background-LLM pool.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
	ARC_PASS_MIN_TOPICS,
	answeredNeeds,
	arcPassChanges,
	arcPassProblems,
	arcPassView,
	doubtNote,
	edgeChanges,
	edgeDiffs,
	edgeProblems,
	lastEdgesEntry,
	formationWords,
	liveTopics,
	mergeMisses,
	passDue,
	purposeAnswerProblems,
	purposeProblems,
	purposeQuiz,
	sortAnswerProblems,
	sortMisses,
	sortProblems,
	sortQuiz,
	storedEdges,
	type ArcPassView,
	type ArcSubmit,
	type EdgeDiff,
	type EdgeSubmit,
	type Formation,
	type SortAnswer,
	type SortMiss,
	type SortQuiz,
	type PurposeAnswer,
	type PurposeQuiz,
	type EdgeAdd,
	withMissing,
	withProposed,
} from "../../core/arc-pass.ts";
import { courseView, NO_STANDING, openLessonsOf, sourcesOf, type MapCourseView } from "../../core/course-map-build.ts";
import type { ChatSummary } from "../../core/contracts/chat.ts";
import { recordHasArcs } from "../../core/contracts/course.ts";
import type { ArcPassLedgers, CourseRecords } from "../../core/ports.ts";
import type { SdkEngine } from "../models.ts";
import { ARC_CUT_DOCTRINE, ARC_EDGES_DOCTRINE, composeDoctrine } from "../prompt-segments.ts";
import { createMaterialTools, measureMaterial, readingRounds, type MaterialFile } from "../tools/material.ts";
import { finishRun, setRunPhase } from "./background-runs.ts";
import { withBgLlmSlot } from "./bg-llm-semaphore.ts";
import { failureWords, mapRuns } from "./course-map-builder.ts";
import { runSubmitAgent } from "./submit-agent.ts";

const EDGES_TOOL = "submit_edges";
const MISSING_TOOL = "submit_missing";
const ARCS_TOOL = "submit_arcs";
const SORT_TOOL = "submit_sort";
const PURPOSE_TOOL = "submit_purpose";
const NEVER_SUBMITTED = "The grouping pass never submitted.";
/** Blind readers per cut: the rubric scores with two fresh scorers and
 *  takes the lower, so a name passes only when both place every topic. */
const SORT_READERS = 2;
/** Model rounds beyond reading, as the map builder counts them: one to look
 *  at the course, one to submit, and the submit seam's retries. */
const SUBMIT_ROUNDS = 6;

const refSchema = Type.Object({
	source: Type.String({ description: "A registered source's handle." }),
	locator: Type.Optional(Type.String({ description: "The unit: chapter, section, slide range, sheet." })),
});

const edgeSchema = Type.Object({
	verdicts: Type.Array(
		Type.Object({
			topic: Type.String({ description: "B, the topic that needs." }),
			need: Type.String({ description: "A, its stored prerequisite." }),
			keep: Type.Boolean({ description: "True when B cannot be done or understood without A." }),
			reason: Type.String({ description: "The prerequisite test answered, in one line: what an exercise on B uses of A, or why it can be done without A." }),
		}),
		{ description: "Every edge listed under Edges to judge, once each." },
	),
	add: Type.Array(
		Type.Object({
			topic: Type.String(),
			need: Type.String(),
			reason: Type.String({ description: "Why an exercise on the topic cannot be done without it." }),
		}),
		{ description: "True, direct prerequisites the graph misses; an empty list when none." },
	),
});

const addSchema = Type.Object({
	topic: Type.String({ description: "B, the topic that needs." }),
	need: Type.String({ description: "A, the topic it needs." }),
	reason: Type.String({ description: "The step of an exercise on B that uses A." }),
});

const missingSchema = Type.Object({
	add: Type.Array(addSchema, { description: "Direct prerequisites the graph misses; an empty list when none." }),
});

const sortSchema = Type.Object({
	sort: Type.Array(
		Type.Object({
			topic: Type.String({ description: "The topic's id: t1, t2, …" }),
			arcs: Type.Array(Type.String(), { description: "The arc names it reads as part of, exactly as listed, best first; a second only when it fits exactly as well." }),
		}),
		{ description: "Every topic, once." },
	),
});

const purposeSchema = Type.Object({
	false: Type.Array(
		Type.Object({ topic: Type.String({ description: "The topic's id: t1, t2, …" }), why: Type.String({ description: "What the purpose line claims that this topic does not give." }) }),
		{ description: "Each topic its arc's purpose line is false of; an empty list when every line is true of every topic." },
	),
	lines: Type.Optional(
		Type.Array(Type.Object({ arc: Type.String({ description: "The arc's name, exactly as listed." }), why: Type.String({ description: "What fails: the term, the promise, or the missing thing to do." }) }), {
			description: "Each purpose line that fails as a sentence; leave out or send an empty list when none does.",
		}),
	),
});

const arcSchema = Type.Object({
	arcs: Type.Array(
		Type.Object({
			handle: Type.String({ description: "A new lowercase handle, from its idea (limits-continuity)." }),
			title: Type.String({ description: "The arc's name: its idea in the material's words, two to five words." }),
			question: Type.String({ description: "The focus question every topic in it helps answer." }),
			purpose: Type.String({ description: "One sentence on what it lets the learner do." }),
			refs: Type.Optional(Type.Array(refSchema, { description: "The material's unit it follows." })),
			single: Type.Optional(Type.String({ description: "Only for an arc of one topic: why it stands alone." })),
			shares: Type.Optional(Type.String({ description: "Only when another arc cites the same unit of the material: why." })),
			topics: Type.Array(Type.String(), { description: "Its topics' handles." }),
		}),
		{ description: "The arcs in study order; empty when you send none." },
	),
	titles: Type.Optional(Type.Array(Type.Object({ topic: Type.String(), title: Type.String() }), { description: "Only for topics listed with no title." })),
	examArcs: Type.Optional(Type.Array(Type.String(), { description: "Only when the material states the next exam's scope: its arcs." })),
	leavesOut: Type.Optional(Type.Array(Type.String(), { description: "Topics of those arcs the stated exam leaves out." })),
	doubts: Type.Optional(
		Type.Array(Type.Object({ topic: Type.String(), need: Type.String(), reason: Type.String() }), { description: "Stored prerequisites you think false: kept, and recorded with your reason." }),
	),
	none: Type.Optional(Type.String({ description: "Only when the course should get no arcs: why, by the size rules." })),
	basis: Type.String({ description: "The material's units the cut follows, then each place the cut departs from them, with its reason: a topic homed outside its unit, a unit merged or re-cut, an order other than the material's, a count outside four to eight arcs." }),
});

export const ARC_EDGES_INSTRUCTIONS = `You settle a course's prerequisites before anything is built on them, following the test below. You answer with one ${EDGES_TOOL} call; the app saves it.

- Judge every edge listed under "Edges to judge": "B needs A" is kept only when an exercise on B cannot be worked without A. A result used only to prove B's theorem, never in working B's exercises, is no prerequisite. Give each verdict its reason in one line: the step of an exercise on B that uses A, or why none does.
- Judge each edge from the topics' meaning and the material, never from the order the material teaches them in. A topic taught earlier is not a prerequisite for that alone.
- Keep every direct prerequisite. An edge is only implied, and dropped, when B uses A solely through another of B's prerequisites. When an exercise on B itself works with A (continuity is defined by a limit; an improper integral is a limit of integrals), the edge is direct: keep it, even when another path also leads to A.
- Drop an edge only after reading B's own material for A (search_material with A's terms): when that material runs, names or works with A, the edge stays. A topic listed with no refs has no material to read, so its edges stay.
- When the test leaves you unsure, keep the edge, and give as its reason the exercise step you think uses A; "unsure" is no reason. A false drop hides what the learner must recall before B; a kept edge only orders the path.
- Look for missing prerequisites as hard as for false ones. For each topic, read what its material works with that another topic of the course teaches (a definition, a result, a method, a tool or service it runs on: a deploy runbook that ships through a hosting platform needs the topic that teaches that platform; a distribution whose section computes its mean needs expectation; a formula written with an operation another topic defines, such as a transpose or a norm, needs that topic; an overview of how parts connect needs the topics on those parts, unless it is the opening sketch the parts build on), and test each. Under add, list every such prerequisite the graph misses, direct and passing the same test as a kept edge, each with its reason; send an empty list when there are none.
- The material is registered: read it with read_material, search_material and render_pages where a test needs it. You need not read every source whole.
- Each handle is its own topic. Two topics whose names share words are still two topics: never treat one as the other.

`;

export const ARC_MISSING_INSTRUCTIONS = `You check a course's prerequisites for what they miss, following the test below. Another check has judged every stored edge; you look only for true prerequisites the graph does not hold. You answer with one ${MISSING_TOOL} call.

- Go through every topic in turn. Picture a typical exercise on it from its material, and list what each step uses: a definition, a result, a method, a notation, a tool or a service.
- For each thing another topic of the course teaches, the topic needs that topic, unless its listed needs already lead there (through a need of a need). List each such missing prerequisite under add, with the exercise step that uses it as its reason.
- Never list a need the graph holds or implies, one that only a proof of the topic's theorem uses, or one that only the material's order suggests.
- The material is registered: read it with read_material, search_material and render_pages where a topic's exercises are unclear. A topic listed with no refs is judged from its title and the topics around it.
- Each handle is its own topic. Two topics whose names share words are still two topics.
- Send an empty list when the graph misses nothing.

`;

export const ARC_CUT_INSTRUCTIONS = `You group a course's topics into arcs, following *Forming arcs* below. You answer with one ${ARCS_TOOL} call; the app saves it.

How this differs from the text below:
- The prerequisites are settled and you cannot change them: your answer has no field for needs. A stored edge you think false goes under doubts with its reason; it is recorded and kept.
- A topic's proposed needs are prerequisites the edge step found, waiting for the learner's yes. Cut as if they were stored: no topic sits in an arc before the arc holding one of its needs, stored or proposed, so the arcs hold whichever proposals the learner accepts.
- Read the material's units before you cut: the sources' tables of contents with read_material, headings with search_material, and the unit each topic's reference locator names. A source the course cannot open is listed as such; then the locators are the material you have.
- List the arcs in study order, and each arc's topics in study order. Every topic listed below, left-out ones too, goes in exactly one arc's topics.
- A topic keeps its title; give a title only to a topic listed with none, under titles. A leading label two or more of an arc's topics share ("GTM: Pricing") is dropped by the app, since the arc now names it: name such an arc for the label's group.
- Each handle is its own topic. Two topics whose names share words are still two topics, and both keep their handles.
- An arc of one topic carries single, saying why it stands alone. Two arcs citing the same unit of the material each carry shares, saying why.
- Every arc cites in refs the unit of the material it follows, when the course has registered material.
- Before you submit, run the name sort that rule 8 describes, and check each focus question is one question, not two joined by "and".
- examArcs and leavesOut only when the material states the next exam's scope.
- When the course should get no arcs, send none with the reason and an empty arcs list.

`;

export const SORT_INSTRUCTIONS = `You read a course's arc names the way a student does, coming back after days away. Below are the names of its arcs, in no particular order, and its topic titles, shuffled. For each topic, say which arc's name it reads as part of, from the names alone: nothing else about the course is given, and nothing else counts. List a second name only when it fits the topic exactly as well as the first. Answer with one ${SORT_TOOL} call.`;

export const PURPOSE_INSTRUCTIONS = `You read a course's arcs the way a student does. Each arc below has a purpose line, one sentence on what the arc lets the student do, and its topics. For each arc:
- Read the purpose line against each of its topics in turn: is it true of that topic, so that studying the topic is part of what the line promises? Under false, list each topic a line is false of, with what the line claims that the topic does not give.
- Read the line as a sentence. Under lines, list it when it uses a term that none of its arc's topic titles use and a student would not know, when it promises something none of its topics teaches, or when it names no thing the student will be able to do (it restates the arc's name, or only lists its topics).
A line that is broad but true, plain and concrete is fine. Answer with one ${PURPOSE_TOOL} call.`;

function purposePrompt(quiz: PurposeQuiz): string {
	return quiz.arcs.flatMap((a) => [`## ${a.title}`, `Purpose: ${a.purpose}`, ...a.topics.map((t) => `- ${t.id}: ${t.title}`), ""]).join("\n");
}

function sortPrompt(quiz: SortQuiz): string {
	return ["## Arc names", ...[...quiz.arcs].sort().map((a) => `- ${a}`), "", "## Topics", ...quiz.topics.map((t) => `- ${t.id}: ${t.title}`)].join("\n");
}

/** A source the agent reads, in one line. */
function fileLine(f: MaterialFile): string {
	const facts =
		f.kind === "pdf"
			? [`PDF, ${f.pages} pages`, f.scanned && f.scanned.length > 0 ? `${f.scanned.length === f.pages ? "every page" : `${f.scanned.length} pages`} without a text layer` : ""]
			: f.kind === "text"
				? [`text, ${f.chars} characters`]
				: [`cannot be opened: ${f.problem}`];
	return `- ${f.handle}: ${f.title ? `${f.title}, ` : ""}${f.registered} (${facts.filter(Boolean).join("; ")})`;
}

const refWords = (refs: MapCourseView["topics"][string]["refs"]) => refs.map((r) => `${r.source}${r.locator ? ` ${r.locator}` : ""}`).join("; ");

function courseHead(title: string, record: unknown, files: readonly MaterialFile[]): string[] {
	const r = obj(record);
	const lines = [`# Course: ${title}`];
	if (typeof r.goal === "string" && r.goal.trim()) lines.push(`About the course, in the learner's words: ${r.goal.trim()}`);
	lines.push("", "## Material", ...(files.length > 0 ? files.map(fileLine) : ["(no registered material)"]));
	return lines;
}

/** The topics in path order, each with what the step reads of it. */
function topicLines(view: MapCourseView & Pick<ArcPassView, "proposed">, withNeeds: boolean): string[] {
	const listed = [...view.order.filter((k) => k in view.topics), ...Object.keys(view.topics).filter((k) => !view.order.includes(k))];
	return listed.map((handle) => {
		const t = view.topics[handle]!;
		const proposed = view.proposed?.[handle] ?? [];
		const stored = t.needs.filter((n) => !proposed.includes(n));
		const facts = [
			withNeeds && stored.length > 0 ? `needs ${stored.join(", ")}` : "",
			withNeeds && proposed.length > 0 ? `proposed needs ${proposed.join(", ")}` : "",
			t.contrasts.length > 0 ? `contrasts ${t.contrasts.join(", ")}` : "",
			t.refs.length > 0 ? `refs ${refWords(t.refs)}` : "",
			t.aliases.length > 0 ? `also called ${t.aliases.join(", ")}` : "",
			t.excluded ? `left out of the exam: ${t.excluded}` : "",
		].filter(Boolean);
		return `- ${handle}: ${t.title ?? "(no title)"}${facts.length > 0 ? ` (${facts.join("; ")})` : ""}`;
	});
}

function edgesPrompt(title: string, view: MapCourseView, record: unknown, files: readonly MaterialFile[]): string {
	const edges = storedEdges(view);
	const name = (k: string) => view.topics[k]?.title ?? k;
	return [
		...courseHead(title, record, files),
		"",
		"## Topics",
		...topicLines(view, false),
		"",
		"## Edges to judge",
		...(edges.length > 0 ? edges.map(([b, a]) => `- "${b}" (${name(b)}) needs "${a}" (${name(a)})`) : ["(none stored)"]),
	].join("\n");
}

function missingPrompt(title: string, view: MapCourseView, record: unknown, files: readonly MaterialFile[], needs: ReadonlyMap<string, readonly string[]>): string {
	const name = (k: string) => view.topics[k]?.title ?? k;
	return [
		...courseHead(title, record, files),
		"",
		"## Topics",
		...topicLines(view, false),
		"",
		"## The graph as judged: each topic and the topics it needs",
		...[...needs].map(([k, ns]) => `- "${k}" (${name(k)}): ${ns.length > 0 ? ns.map((n) => `"${n}"`).join(", ") : "nothing"}`),
	].join("\n");
}

function cutPrompt(title: string, view: ArcPassView, record: unknown, files: readonly MaterialFile[]): string {
	const exam = obj(obj(record).exam);
	const lines = courseHead(title, record, files);
	const facts = [
		view.examDate ? `Exam: ${view.examDate}` : "No exam date.",
		typeof exam.coverage === "string" ? `Exam coverage: ${exam.coverage}` : "",
		typeof exam.format === "string" ? `Exam format: ${exam.format}` : "",
		view.basis ? `Path basis: ${view.basis}` : "",
	].filter(Boolean);
	lines.push("", "## The exam and the path", ...facts, "", "## Topics, in path order", ...topicLines(view, true));
	return lines.join("\n");
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});

/** How the edge step's verdicts are used: saved, or only proposed. */
export type EdgeMode = "apply" | "propose";

/** What the edge step found and did. */
export interface EdgeRun {
	mode: EdgeMode;
	submit: EdgeSubmit;
	diffs: EdgeDiff[];
	applied: EdgeDiff[];
	skipped: EdgeDiff[];
}

export type ArcPassResult =
	| { status: "formed"; summary: string; edges: EdgeRun; answer: ArcSubmit; formation: Formation; revision: number | null; report: unknown; sort: SortMiss[] | null }
	| { status: "none"; reason: string; edges?: EdgeRun; answer?: ArcSubmit }
	| { status: "failed"; reason: string; edges?: EdgeRun; answer?: ArcSubmit; patch?: Json };

/** One entry of a run's transcript: a model message, an answer the app or
 *  the engine refused, or a save. */
export type TranscriptEntry =
	| { at: string; step: "edges" | "missing" | "cut" | "sort" | "purpose"; kind: "message"; message: AssistantMessage }
	| { at: string; step: "sort"; kind: "sorted"; misses: SortMiss[] }
	| { at: string; step: "edges" | "missing" | "cut"; kind: "refused"; problems: string }
	| { at: string; step: "edges" | "cut" | "note"; kind: "saved" | "save refused"; changes: unknown; message?: string };

export interface ArcPassOptions {
	edges: EdgeMode;
	/** His words, or the copy run's statement, for a course he has studied
	 *  (G5): `arc_change.asked`. */
	asked?: string;
	/** Leads the formation's reason ("approved by Edo on …"). */
	reason?: string;
	signal?: AbortSignal;
	transcript?: (entry: TranscriptEntry) => void;
}

export interface ArcPassDeps {
	courseRecords: CourseRecords;
	ledgers: ArcPassLedgers;
	/** Test seam: a scripted engine, checked first. */
	engine?: SdkEngine;
	/** The app's default model, resolved fresh per run. */
	engineFor?: () => SdkEngine | undefined;
	backgroundAllowed?: (provider: string) => boolean;
	fetchPage?: (url: string) => Promise<string>;
	/** The app's sessions: an open lesson's topics count as studied. */
	sessions?: () => readonly ChatSummary[];
	/** The arcs were saved (Home and the course page refetch). */
	onSaved?: (workspace: string) => void;
	/** A map build asked for while the pass held the course. */
	rebuild?: (workspace: string) => void;
}

export interface ArcPass {
	/** Both steps on one course, whatever its ledger says: the lever's entry. */
	run(workspace: string, options: ArcPassOptions): Promise<ArcPassResult>;
	/** A map build of the course saved: its pass may be due once the build ends. */
	built(workspace: string): void;
	/** The course is free of builds: run its pass when one is wanted and due.
	 *  Resolves when that run, if any, has ended. */
	settle(workspace: string): Promise<void>;
	/** At app start: every `new` course whose pass a quit cut short.
	 *  Resolves when their runs have ended. */
	resumeCut(): Promise<void>;
}

const aborted = () => Object.assign(new Error("grouping pass aborted"), { name: "AbortError" });

export function createArcPass(deps: ArcPassDeps): ArcPass {
	const { courseRecords, ledgers } = deps;
	const wanted = new Set<string>();

	async function readRecord(workspace: string): Promise<unknown> {
		const shown = await courseRecords.run(workspace, { verb: "show", handles: "all" });
		if (!shown.ok) throw new Error(`course record: ${shown.message}`);
		return shown.json;
	}

	async function studiedOf(workspace: string, record: unknown): Promise<string[]> {
		const lessons = openLessonsOf(deps.sessions?.() ?? [], workspace, record);
		const standing = await courseRecords.run(workspace, { verb: "arcs", here: lessons.here, open: lessons.topics });
		if (!standing.ok) throw new Error(`course record: ${standing.message}`);
		const studied = obj(standing.json).studied;
		return Array.isArray(studied) ? studied.filter((s): s is string => typeof s === "string") : [];
	}

	async function viewNow(workspace: string): Promise<{ record: unknown; view: ArcPassView }> {
		const record = await readRecord(workspace);
		return { record, view: arcPassView({ ...courseView(record, NO_STANDING), studied: await studiedOf(workspace, record) }, record) };
	}

	async function run(workspace: string, options: ArcPassOptions): Promise<ArcPassResult> {
		const log = (entry: TranscriptEntry extends infer E ? (E extends unknown ? Omit<E, "at"> : never) : never) => options.transcript?.({ at: new Date().toISOString(), ...entry } as TranscriptEntry);
		const first = await readRecord(workspace);
		if (recordHasArcs(first)) return { status: "failed", reason: "the course has arcs already" };
		const live = liveTopics(first).length;
		if (live < ARC_PASS_MIN_TOPICS) return { status: "none", reason: `${live} live topics: two arcs of at least two topics each need ${ARC_PASS_MIN_TOPICS}` };
		const engine = deps.engine ?? deps.engineFor?.();
		if (!engine) return { status: "failed", reason: "no model is set in Settings" };
		if (deps.backgroundAllowed && !deps.backgroundAllowed(engine.model.provider)) return { status: "failed", reason: `${engine.model.provider} does not allow background work` };
		const scanned = await courseRecords.run(workspace, { verb: "sources", scan: true });
		if (!scanned.ok) throw new Error(`course record: ${scanned.message}`);
		const directory = String(obj(scanned.json).directory ?? workspace);
		const files = (await measureMaterial(directory, sourcesOf(first), deps.fetchPage)).filter((f) => f.kind !== "folder");
		const title = typeof obj(first).title === "string" ? (obj(first).title as string) : workspace;
		const signal = options.signal;
		const agent = <T>(step: "edges" | "missing" | "cut", tool: string, parameters: typeof edgeSchema | typeof missingSchema | typeof arcSchema, doctrine: string, instructions: string, prompt: string, validate: (answer: T) => Promise<string | null>) =>
			withBgLlmSlot(signal, () =>
				runSubmitAgent<T>({
					role: "teacher",
					toolName: tool,
					toolDescription: step === "edges" ? "Submit the verdict on every prerequisite." : step === "missing" ? "Submit the prerequisites the graph misses." : "Submit the course's arcs.",
					parameters,
					fill: (input: Json) => (step === "edges" ? { verdicts: input.verdicts ?? [], add: input.add ?? [] } : step === "missing" ? { add: input.add ?? [] } : { ...input, arcs: input.arcs ?? [] }) as T,
					validate: async (answer) => {
						const problems = await validate(answer);
						if (problems) {
							log({ step, kind: "refused", problems });
							console.info(`[arc-pass ${workspace}] ${step} answer refused: ${problems.replace(/\n/g, " | ")}`);
						}
						return problems;
					},
					systemPrompt: instructions + doctrine,
					prompt,
					engine,
					signal,
					extraTools: createMaterialTools(files, engine.model),
					maxTurns: readingRounds(files) + SUBMIT_ROUNDS,
					onMessage: (message) => log({ step, kind: "message", message }),
					onStep: (usage, model, n, finish, tools) => console.info(`[arc-pass ${workspace}] ${step} step ${n} ${model}: ${usage.input} in, ${usage.output} out, ${finish}, ${tools}`),
					neverSubmitted: NEVER_SUBMITTED,
				}),
			);
		const save = async (step: "edges" | "cut" | "note", changes: Json) => {
			const saved = await courseRecords.run(workspace, { verb: "save", changes });
			log({ step, kind: saved.ok ? "saved" : "save refused", changes, ...(saved.ok ? {} : { message: saved.message }) });
			return saved;
		};

		const before = await viewNow(workspace);
		const judged = await agent<EdgeSubmit>("edges", EDGES_TOOL, edgeSchema, composeDoctrine(ARC_EDGES_DOCTRINE), ARC_EDGES_INSTRUCTIONS, edgesPrompt(title, before.view, before.record, files), async (a) =>
			edgeProblems(a, before.view),
		);
		if (signal?.aborted) throw aborted();
		const missing = await agent<{ add: EdgeAdd[] }>(
			"missing",
			MISSING_TOOL,
			missingSchema,
			composeDoctrine(ARC_EDGES_DOCTRINE),
			ARC_MISSING_INSTRUCTIONS,
			missingPrompt(title, before.view, before.record, files, answeredNeeds(before.view, judged)),
			async (a) => edgeProblems(withMissing(judged, a.add), before.view),
		);
		if (signal?.aborted) throw aborted();
		const edgeAnswer = withMissing(judged, missing.add);
		const diffs = edgeDiffs(edgeAnswer);
		const edges: EdgeRun = { mode: options.edges, submit: edgeAnswer, diffs, applied: [], skipped: [] };
		if (options.edges === "apply" && diffs.length > 0) {
			const merged = edgeChanges(diffs, (await viewNow(workspace)).view);
			if (merged) {
				const saved = await save("edges", merged.changes);
				if (!saved.ok) return { status: "failed", reason: `the course record refused the settled prerequisites: ${saved.message}`, edges };
				edges.applied = merged.applied;
				edges.skipped = merged.skipped;
				deps.onSaved?.(workspace);
			} else edges.skipped = diffs;
		}

		const settled = async () => {
			const read = await viewNow(workspace);
			return options.edges === "propose" ? { ...read, view: withProposed(read.view, diffs) } : read;
		};
		const cut = await settled();
		const edgesEntry = edges.applied.length > 0 ? lastEdgesEntry(cut.record) : undefined;
		let sorted: SortMiss[] | null = null;
		const blindSort = async (a: ArcSubmit, formation: Formation): Promise<string | null> => {
			const quiz = sortQuiz(a, cut.view, formation);
			const reader = () => runSubmitAgent<SortAnswer>({
				role: "teacher",
				toolName: SORT_TOOL,
				toolDescription: "Submit the arc each topic reads as part of.",
				parameters: sortSchema,
				fill: (input: Json) => ({ sort: (input.sort as SortAnswer["sort"] | undefined) ?? [] }),
				validate: (answer) => sortAnswerProblems(answer, quiz),
				systemPrompt: SORT_INSTRUCTIONS,
				prompt: sortPrompt(quiz),
				engine,
				signal,
				onMessage: (message) => log({ step: "sort", kind: "message", message }),
				onStep: (usage, model, n, finish, tools) => console.info(`[arc-pass ${workspace}] sort step ${n} ${model}: ${usage.input} in, ${usage.output} out, ${finish}, ${tools}`),
				neverSubmitted: "The blind sort never submitted.",
			}).catch((err: unknown) => {
				if (signal?.aborted) throw aborted();
				console.info(`[arc-pass ${workspace}] a blind reader skipped: ${err instanceof Error ? err.message : String(err)}`);
				return null;
			});
			const reads = (await Promise.all(Array.from({ length: SORT_READERS }, reader))).filter((r): r is SortAnswer => r !== null);
			if (reads.length > 0) {
				sorted = mergeMisses(...reads.map((read) => sortMisses(quiz, read, a)));
				log({ step: "sort", kind: "sorted", misses: sorted });
				const misses = sortProblems(sorted, a);
				if (misses) return misses;
			}
			const purposes = purposeQuiz(a, cut.view, formation);
			const purposeRead = await runSubmitAgent<PurposeAnswer>({
				role: "teacher",
				toolName: PURPOSE_TOOL,
				toolDescription: "Submit the topics a purpose line is false of.",
				parameters: purposeSchema,
				fill: (input: Json) => ({ false: (input.false as PurposeAnswer["false"] | undefined) ?? [], lines: (input.lines as PurposeAnswer["lines"] | undefined) ?? [] }),
				validate: (answer) => purposeAnswerProblems(answer, purposes),
				systemPrompt: PURPOSE_INSTRUCTIONS,
				prompt: purposePrompt(purposes),
				engine,
				signal,
				onMessage: (message) => log({ step: "purpose", kind: "message", message }),
				onStep: (usage, model, n, finish, tools) => console.info(`[arc-pass ${workspace}] purpose step ${n} ${model}: ${usage.input} in, ${usage.output} out, ${finish}, ${tools}`),
				neverSubmitted: "The purpose check never submitted.",
			}).catch((err: unknown) => {
				if (signal?.aborted) throw aborted();
				console.info(`[arc-pass ${workspace}] the purpose check skipped: ${err instanceof Error ? err.message : String(err)}`);
				return null;
			});
			return purposeRead ? purposeProblems(purposeRead, purposes) : null;
		};
		const answer = await agent<ArcSubmit>("cut", ARCS_TOOL, arcSchema, composeDoctrine(ARC_CUT_DOCTRINE), ARC_CUT_INSTRUCTIONS, cutPrompt(title, cut.view, cut.record, files), async (a) => {
			const problems = arcPassProblems(a, cut.view);
			if (problems) return problems;
			const formation = arcPassChanges(a, cut.view, { edgesEntry, asked: options.asked, reason: options.reason });
			if (!formation) return null;
			const checked = await courseRecords.run(workspace, { verb: "check", changes: formation.changes });
			if (!checked.ok && checked.kind === "validation") return `The engine refused the arcs: ${checked.message}`;
			return blindSort(a, formation);
		});
		if (signal?.aborted) throw aborted();
		if (answer.none?.trim()) return { status: "none", reason: answer.none.trim(), edges, answer };

		const now = await settled();
		if (recordHasArcs(now.record)) return { status: "failed", reason: "the course got arcs while the pass read it", edges, answer };
		const formation = arcPassChanges(answer, now.view, { edgesEntry, asked: options.asked, reason: options.reason });
		if (!formation) return { status: "none", reason: "the answer formed no arcs", edges, answer };
		const saved = await save("cut", formation.changes);
		if (!saved.ok) return { status: "failed", reason: `the course record refused the arcs: ${saved.message}`, edges, answer, patch: formation.changes };
		const note = doubtNote(answer);
		if (note) await save("note", note);
		deps.onSaved?.(workspace);
		const after = await readRecord(workspace);
		const reported = await courseRecords.run(workspace, { verb: "arcs", report: true });
		const revision = typeof obj(after).revision === "number" ? (obj(after).revision as number) : null;
		return { status: "formed", summary: formationWords(answer), edges, answer, formation, revision, report: reported.ok ? obj(reported.json).report : null, sort: sorted };
	}

	/** Release the course, and run a map build asked for meanwhile. */
	function release(workspace: string): void {
		const R = mapRuns();
		R.inFlight.delete(workspace);
		if (R.rerun.delete(workspace)) deps.rebuild?.(workspace);
	}

	async function live(workspace: string): Promise<void> {
		const ledger = ledgers.get(workspace);
		const jobKey = `${workspace}#arc-pass`;
		let signal: AbortSignal | undefined;
		let topics = ledger?.topics ?? 0;
		try {
			const record = await readRecord(workspace);
			if (!passDue(ledger, record)) return;
			topics = liveTopics(record).length;
			const write = (state: "formed" | "none" | "failed", extra: { reason?: string; revision?: number }) => ledgers.save(workspace, { state, at: new Date().toISOString(), topics, ...extra });
			const studied = await studiedOf(workspace, record);
			if (studied.length > 0) {
				write("failed", { reason: `he has studied ${studied.length === 1 ? "a topic" : "topics"} of it already, so only his words can ask for arcs` });
				return;
			}
			const title = typeof obj(record).title === "string" ? (obj(record).title as string) : workspace;
			signal = setRunPhase(jobKey, "grouping", "arc-pass", title).controller.signal;
			const result = await run(workspace, { edges: "apply", signal });
			if (result.status === "failed" && /^no model is set|does not allow background work$/.test(result.reason)) {
				console.info(`[arc-pass ${workspace}] skipped: ${result.reason}`);
				return;
			}
			if (result.status === "formed") write("formed", { reason: result.summary, ...(result.revision !== null ? { revision: result.revision } : {}) });
			else write(result.status, { reason: result.reason });
			console.info(`[arc-pass ${workspace}] ${result.status}: ${result.status === "formed" ? result.summary : result.reason}`);
		} catch (err) {
			const reason = failureWords(err, signal?.aborted === true || (err instanceof Error && err.name === "AbortError"));
			ledgers.save(workspace, { state: "failed", at: new Date().toISOString(), topics, reason });
			console.error(`[arc-pass ${workspace}] failed (${reason}):`, err);
		} finally {
			if (signal) finishRun(jobKey);
			release(workspace);
		}
	}

	async function settle(workspace: string): Promise<void> {
		const R = mapRuns();
		if (!wanted.has(workspace) || R.inFlight.has(workspace) || R.rerun.has(workspace)) return;
		wanted.delete(workspace);
		R.inFlight.add(workspace);
		await live(workspace);
	}

	return {
		run,
		built: (workspace) => {
			if (ledgers.get(workspace)) wanted.add(workspace);
		},
		settle,
		resumeCut: async () => {
			const cut = ledgers.workspaces().filter((workspace) => ledgers.get(workspace)?.state === "new");
			for (const workspace of cut) wanted.add(workspace);
			await Promise.all(cut.map((workspace) => settle(workspace).catch(() => {})));
		},
	};
}
