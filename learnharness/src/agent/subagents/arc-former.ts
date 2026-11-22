/**
 * The grouping pass: background agents that cut a course with topics and no
 * arcs into arcs (core/arc-pass.ts holds the rules). A judge and one reader
 * per topic settle the prerequisites with the prerequisite test alone, never
 * seeing an arc. Then an agent cuts the settled graph from the material's
 * units with arcs.md's *Forming arcs*, and changes no stored prerequisite. Each answers
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

import path from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
	ARC_PASS_MIN_TOPICS,
	type ArcPassLedger,
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
	sortedAway,
	mergeMisses,
	passDue,
	purposeAnswerProblems,
	purposeProblems,
	withdrawal,
	purposeQuiz,
	sortAnswerProblems,
	sortMisses,
	sortProblems,
	standingMisses,
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
	withReadings,
	mergeReadings,
	readingProblems,
	breakLoops,
	loopRulingProblems,
	withoutImplied,
	type EdgeLoop,
	type LoopRuling,
	type NeedsReading,
	withProposed,
	addCandidates,
	ADD_KINDS,
	kindAdmits,
	kindProblems,
	type AddKind,
	type KindVerdict,
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
const NEEDS_TOOL = "submit_needs";
const LOOPS_TOOL = "submit_loops";
export const KINDS_TOOL = "submit_kinds";
const ARCS_TOOL = "submit_arcs";
const SORT_TOOL = "submit_sort";
const PURPOSE_TOOL = "submit_purpose";
const NEVER_SUBMITTED = "The grouping pass never submitted.";
/** Blind readers per sort: a topic is a miss when two of the five put it
 *  away from its arc (SORT_MISS_SHARE). */
const SORT_READERS = 5;
/** Fresh readers per topic: a use one reader in two
 *  finds is missed only when both miss it, and a drop needs them all. */
const NEEDS_READERS = 2;
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

const needsSchema = Type.Object({
	uses: Type.Array(
		Type.Object({
			need: Type.String({ description: "The handle of another topic of the course." }),
			step: Type.String({ description: "The step of an exercise on your topic that works with it, as the material sets it." }),
		}),
		{ description: "Every other topic an exercise on your topic works with directly; an empty list when none." },
	),
});

export const kindsSchema = Type.Object({
	kinds: Type.Array(
		Type.Object({
			topic: Type.String({ description: "B, the topic that would need." }),
			need: Type.String({ description: "A, the candidate prerequisite." }),
			kind: Type.Union(
				(Object.keys(ADD_KINDS) as AddKind[]).map((k) => Type.Literal(k)),
				{ description: "The kind of step the candidate rests on." },
			),
			reason: Type.String({ description: "What in B's material makes it that kind, in one line." }),
		}),
		{ description: "Every candidate listed, once each." },
	),
});

const loopsSchema = Type.Object({
	breaks: Type.Array(
		Type.Object({
			loop: Type.Integer({ minimum: 1, description: "The loop's number: 1 for L1." }),
			topic: Type.String({ description: "B, the topic of the edge to break." }),
			need: Type.String({ description: "A, its need." }),
			reason: Type.String({ description: "Why an exercise on B can be worked without A, while every other edge of the loop holds." }),
		}),
		{ description: "Every loop listed, once each." },
	),
});

const sortSchema = Type.Object({
	sort: Type.Array(
		Type.Object({
			topic: Type.String({ description: "The topic's id: t1, t2, …" }),
			arc: Type.String({ description: "The one arc name it fits best, exactly as listed." }),
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
	names: Type.Optional(
		Type.Array(Type.Object({ arc: Type.String({ description: "The arc's name, exactly as listed." }), why: Type.String({ description: "What fails: the ideas it lists, the idea it promises that no topic teaches, or the idea it hides." }) }), {
			description: "Each arc name that fails to name the one idea its topics serve; leave out or send an empty list when none does.",
		}),
	),
	splits: Type.Optional(
		Type.Array(
			Type.Object({
				arc: Type.String({ description: "The arc's name, exactly as listed." }),
				question: Type.String({ description: "The focus question most of its topics serve." }),
				apart: Type.Array(Type.String({ description: "A topic's id: t1, t2, …" }), { description: "The topics that serve the other question instead." }),
				other: Type.String({ description: "The question the topics apart serve." }),
			}),
			{ description: "Each arc whose topics answer no one focus question; leave out or send an empty list when every arc's do." },
		),
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
	leavesOut: Type.Optional(Type.Array(Type.String(), { description: "Topics the stated exam leaves out, each in an arc after examArcs." })),
	doubts: Type.Optional(
		Type.Array(Type.Object({ topic: Type.String(), need: Type.String(), reason: Type.String() }), { description: "Stored prerequisites you think false: kept, and recorded with your reason." }),
	),
	withdraw: Type.Optional(
		Type.Array(Type.Object({ topic: Type.String(), need: Type.String(), reason: Type.String({ description: "Why an exercise on the topic can be worked without it." }) }), {
			description: "Added, proposed or implied needs that fail the prerequisite test: dropped, so the cut need not hold them.",
		}),
	),
	none: Type.Optional(Type.String({ description: "Only when the course should get no arcs: why, by the size rules." })),
	basis: Type.String({ description: "The material's units the cut follows, then each place the cut departs from them, with its reason: a topic homed outside its unit, a unit merged or re-cut, an order other than the material's, a count outside four to eight arcs." }),
});

export const ARC_EDGES_INSTRUCTIONS = `You settle a course's prerequisites before anything is built on them, following the test below. You answer with one ${EDGES_TOOL} call; the app saves it.

- Judge every edge listed under "Edges to judge": "B needs A" is kept only when an exercise on B cannot be worked without A. A result used only to prove B's theorem, never in working B's exercises, is no prerequisite. Give each verdict its reason in one line: the step of an exercise on B that uses A, or why none does.
- Judge each edge from the topics' meaning and the material, never from the order the material teaches them in. A topic taught earlier is not a prerequisite for that alone.
- Keep every direct prerequisite. An edge is only implied, and dropped, when B uses A solely through another of B's prerequisites. When an exercise on B itself works with A (continuity is defined by a limit; an improper integral is a limit of integrals), the edge is direct: keep it, even when another path also leads to A.
- Drop an edge only after reading A's material for what A teaches, which can be more than its title names (a topic titled for adjacency lists may be where the course defines a graph), and B's own material for it (search_material with those terms): when B's material runs, names or works with anything A teaches, the edge stays. A topic listed with no refs has no material to read, so its edges stay.
- When the test leaves you unsure, keep the edge, and give as its reason the exercise step you think uses A; "unsure" is no reason. A false drop hides what the learner must recall before B; a kept edge only orders the path.
- Look for missing prerequisites as hard as for false ones. For each topic, read what its material works with that another topic of the course teaches (a definition, a result, a method, a tool or service it runs on: a deploy runbook that ships through a hosting platform needs the topic that teaches that platform; a distribution whose section computes its mean needs expectation; a formula written with an operation another topic defines, such as a transpose or a norm, needs that topic; an overview of how parts connect needs the topics on those parts, unless it is the opening sketch the parts build on), and test each. Under add, list every such prerequisite the graph misses, direct and passing the same test as a kept edge, each with its reason; send an empty list when there are none.
- The material is registered: read it with read_material, search_material and render_pages where a test needs it. You need not read every source whole.
- Each handle is its own topic. Two topics whose names share words are still two topics: never treat one as the other.

`;

export const ARC_NEEDS_INSTRUCTIONS = `You read one topic's material and name every other topic of the course that an exercise on it works with, following the test below. Another reader does the same for each other topic, and a judge checks the stored edges; you answer for your topic alone, with one ${NEEDS_TOOL} call.

- Read your topic's material first: each unit its refs name (a slide range: those pages; a section, an exercise or a function: find it with search_material and read it whole). Then read every exercise it sets or points to ("Exercises 18 and 19", "see sheet 3"): find each with search_material leaving out the source, which searches every source, and read it whole wherever it is. A topic with no refs: find its material the same way, on its title's terms, and read what you find. The app takes your answer only once you have read from each source its refs cite.
- Picture the exercises that practise your topic itself, as its material sets them (or would set them), and work each step by step. For each step, list what it carries out that another topic of the course teaches: a definition it applies, a result it uses, a method it runs, an operation its formula computes (∇f(g(x)) = J_gᵀ∇f computes a transpose), or a tool or service it runs on. Each such topic is one use, with the step as its reason.
- Leave out a topic the exercise only writes in its notation without computing with it (a system written as Ax = b and solved by row reduction never multiplies matrices), one it only checks its answer with (differentiating an antiderivative to confirm it), one whose object is only the thing your topic is applied to (the mean of a Binomial practises expectation, not the Binomial), and one that only an exercise joining your topic to another uses while your topic's other exercises are worked without it. Leave out too a topic used only to prove your topic's theorem, one the material merely teaches earlier, and one reached only through another topic you list.
- A topic teaches what its material holds, not only what its title names: a topic titled for one part of its section ("Graph representations: adjacency lists vs adjacency matrix") may be where the course defines the whole idea ("A graph G = (V, E)"). When a step applies a definition, a notation or a result, find the topic whose material introduces it (search_material for its words, then the refs of the topics it lands in) and name that topic.
- Use the handles as listed. Each handle is its own topic: two topics whose names share words are still two topics.
- Send an empty list when your topic's exercises use no other topic.

`;

const kindLines = (adds: boolean) => (Object.entries(ADD_KINDS) as [AddKind, (typeof ADD_KINDS)[AddKind]][]).filter(([, k]) => k.adds === adds).map(([name, k]) => `  - ${name}: ${k.words}`);

export const ARC_KINDS_INSTRUCTIONS = `You sort the prerequisites a course's readers found, before any is added, following the test below. Each candidate "B needs A" comes with the step a reader gave for it: the step of an exercise on B that works with A. You answer with one ${KINDS_TOOL} call.

- For each candidate, read B's material (its refs) for B's definition and the method its exercises use, and say which one kind the step is. Kinds that make A a prerequisite of B:
${kindLines(true).join("\n")}
  Kinds that do not:
${kindLines(false).join("\n")}
- Judge the step as B's material sets it: read A's material for what A teaches, and search B's for where A's terms appear. When B's material shows only its headings, judge from what an exercise on B under that heading carries out.
- A teaches what its material holds, not only what its title names: a topic titled for one part of its section may be where the course teaches the idea the step uses.
- Judge each candidate from the topics' meaning and the material, never from the order the material teaches them in, and never from the other candidates.
- Give each its reason in one line. Each handle is its own topic: two topics whose names share words are still two topics.

`;

export const ARC_LOOPS_INSTRUCTIONS = `You settle the loops in a course's prerequisites, following the test below. Readers of each topic's material each named the topics its exercises use; together their uses close the loops listed under "Loops", and a course's prerequisites cannot loop. You answer with one ${LOOPS_TOOL} call.

- For each loop, apply the prerequisite test to each of its edges: "B needs A" holds when an exercise on B cannot be worked without A. Read both topics' material with read_material and search_material where the steps given leave you unsure.
- Break each loop at the one edge that fails the test, or holds most weakly: a step that only checks an answer, only mentions a part another topic teaches, or belongs to a later exercise that combines the two. The other edges of the loop stay, so the topic learned first is the one the other cannot be worked without.
- Judge from the topics' meaning and the material, never from the order the material teaches them in.
- Give each break its reason in one line. Each handle is its own topic.

`;

export const ARC_CUT_INSTRUCTIONS = `You group a course's topics into arcs, following *Forming arcs* below. You answer with one ${ARCS_TOOL} call; the app saves it.

How this differs from the text below:
- The stored prerequisites are settled and you cannot change them. A stored edge you think false goes under doubts with its reason; it is recorded and kept.
- A topic's added and proposed needs are ones the edge step found just now, each from a reader's step on one exercise or example. Test each added or proposed need of the topics you place with the prerequisite test: could the learner work the exercises the material sets for the topic without it? When only a one-off brings it in (one example, a checkpoint, an odd exercise or two) while the topic's method and its standard exercises are worked without it, list it under withdraw with that reason; it is dropped and the cut need not hold it. A topic's implied needs are ones its readers found that were set aside because another of its needs leads to them: one comes back as a need of its own when you withdraw the only need that led to it, and the cut then holds it, unless it fails the same test: then list it under withdraw too. Judge it by the test alone, never by the order it would force; never withdraw a stored need.
- A topic's proposed needs are prerequisites the edge step found, waiting for the learner's yes. Cut as if they were stored: no topic sits in an arc before the arc holding one of its needs, stored or proposed, so the arcs hold whichever proposals the learner accepts.
- Read the material's units before you cut: the sources' tables of contents with read_material, headings with search_material, and the unit each topic's reference locator names. A source the course cannot open is listed as such; then the locators are the material you have.
- List the arcs in study order, and each arc's topics in study order. Every topic listed below, left-out ones too, goes in exactly one arc's topics.
- A topic keeps its title; give a title only to a topic listed with none, under titles. A leading label two or more of an arc's topics share ("GTM: Pricing") is dropped by the app, since the arc now names it: name such an arc for the label's group.
- Each handle is its own topic. Two topics whose names share words are still two topics, and both keep their handles.
- An arc of one topic carries single, saying why it stands alone. Two arcs citing the same unit of the material each carry shares, saying why.
- Every arc cites in refs the unit of the material it follows, when the course has registered material.
- Before you submit, run the name sort that rule 8 describes, and check each focus question is one question, not two joined by "and".
- A stated exam's scope draws a boundary whether its date is ahead or past (rule 4's second signal): no arc holds both topics it examines and topics outside its scope ("outside the scope of the exam" below), and those sit in arcs after every arc of topics it examines, each joining the later arc whose question it extends; they form an arc of their own only when no later arc's question fits. examArcs and leavesOut only for the next exam still ahead, when the material states its scope. A topic that exam leaves out goes in an arc after the exam's arcs, never in one with topics it examines: list it in leavesOut.
- When the course should get no arcs, send none with the reason and an empty arcs list.

`;

export const SORT_INSTRUCTIONS = `You read a course's arc names the way a student does, coming back after days away. Below are the course's title, the names of its arcs (chapter-like groups) in study order, and its topic titles, shuffled. Put each topic under the arc whose name it fits best, from the names alone: nothing else about the course is given, and nothing else counts. Every topic goes to exactly one arc; when two fit, pick the better one. Answer with one ${SORT_TOOL} call.`;

export const PURPOSE_INSTRUCTIONS = `You read a course's arcs the way a student does. Each arc below has a purpose line, one sentence on what the arc lets the student do, and its topics. For each arc:
- Read the purpose line against each of its topics in turn: is it true of that topic, so that studying the topic is part of what the line promises? Under false, list each topic a line is false of, with what the line claims that the topic does not give.
- Read the line as a sentence. Under lines, list it when it uses a term that none of its arc's topic titles use and a student would not know, when it promises something none of its topics teaches, or when it names no thing the student will be able to do (it restates the arc's name, or only lists its topics).
- Read the arc's name, the way a student coming back after days away would. Under names, list it only when:
  - it enumerates three or more of its topics or ideas instead of naming the one idea they serve: "Heapsort, quicksort and counting sort" rather than "Sorting"; or
  - it promises an idea none of its topics teaches, as a chapter title can when the course keeps only part of the chapter; or
  - read cold, it hides the idea the arc is built on: a student would not expect the topics most of the others build on, while the heading of the unit it cites names them ("Shortest paths" for an arc whose unit is "Graph search" and whose first topics are breadth-first and depth-first search).
  A name taken from a unit's heading, one that shares a word with a topic's title, and two phrases joined by "and" that the material treats together are fine.
- Then read the arc's topics alone, as if its name and line were covered, and write the focus question a chapter on just them would answer: the one question every topic helps answer. Under splits, list the arc only when no one such question holds them all: some of its topics answer a question unrelated to the others', so that a question covering both must join the two with "and", or be so broad that it would hold the topics of the course's other arcs too. A tool and the topics that use it, or a method and its cases, answer one question.
A line that is broad but true, plain and concrete is fine. Answer with one ${PURPOSE_TOOL} call.`;

function purposePrompt(quiz: PurposeQuiz): string {
	return quiz.arcs.flatMap((a) => [`## ${a.title}`, `Purpose: ${a.purpose}`, ...(a.units.length > 0 ? [`Cites: ${a.units.join("; ")}`] : []), ...a.topics.map((t) => `- ${t.id}: ${t.title}`), ""]).join("\n");
}

function sortPrompt(title: string, quiz: SortQuiz): string {
	return [`# Course: ${title}`, "", "## Arc names, in study order", ...quiz.arcs.map((a) => `- ${a}`), "", "## Topics", ...quiz.topics.map((t) => `- ${t.id}: ${t.title}`)].join("\n");
}

/**
 * The course's material as the pass reads it. Every registered file; a
 * registered folder as a heading over its files; and, when the engine's scan
 * lists the course's whole folder, each file it finds that is not registered
 * on its own (a folder's lecture slides, the exercise sheet beside a
 * registered transcript), under the handle the scan suggests. A scan the
 * engine cut short lists only part of a linked tree, so then only the
 * registered files are read.
 */
export interface PassMaterial {
	files: MaterialFile[];
	/** Registered folders, by handle: their path as registered. */
	folders: Map<string, string>;
	/** Unregistered files, by handle: the registered folder holding each, or null. */
	unregistered: Map<string, string | null>;
	/** The scan listed only part of the course's folder. */
	partial: boolean;
}

interface ScanFile {
	path: string;
	handle?: string;
	suggested_handle?: string;
}

export async function passMaterial(directory: string, record: unknown, scan: unknown, fetchPage?: (url: string) => Promise<string>): Promise<PassMaterial> {
	const sources = sourcesOf(record);
	const measured = await measureMaterial(directory, sources, fetchPage);
	const folders = new Map(measured.filter((f) => f.kind === "folder").map((f) => [f.handle, f.registered]));
	const partial = obj(scan).truncated === true;
	const listed = (Array.isArray(obj(scan).files) ? (obj(scan).files as ScanFile[]) : []).filter((f) => !f.handle && f.suggested_handle && f.path);
	const inFolder = (rel: string) => {
		const abs = path.resolve(directory, rel);
		for (const [handle, registered] of folders) if (abs.startsWith(`${path.resolve(directory, registered)}${path.sep}`)) return handle;
		return null;
	};
	const extra = partial ? [] : (await measureMaterial(directory, listed.map((f) => ({ handle: f.suggested_handle!, path: f.path })), fetchPage)).filter((f) => f.kind === "pdf" || f.kind === "text");
	return {
		files: [...measured.filter((f) => f.kind !== "folder"), ...extra],
		folders,
		unregistered: new Map(extra.map((f) => [f.handle, inFolder(f.registered)])),
		partial,
	};
}

/** A source the agent reads, in one line. */
function fileLine(f: MaterialFile, material: PassMaterial, indent = ""): string {
	const facts =
		f.kind === "pdf"
			? [`PDF, ${f.pages} pages`, f.scanned && f.scanned.length > 0 ? `${f.scanned.length === f.pages ? "every page" : `${f.scanned.length} pages`} without a text layer` : ""]
			: f.kind === "text"
				? [`text, ${f.chars} characters`]
				: [`cannot be opened: ${f.problem}`];
	const folder = material.unregistered.get(f.handle);
	if (folder) facts.push(`in the folder ${folder}: refs cite ${folder}`);
	else if (material.unregistered.has(f.handle)) facts.push("not registered: read it, never cite it in refs");
	return `${indent}- ${f.handle}: ${f.title ? `${f.title}, ` : ""}${f.registered} (${facts.filter(Boolean).join("; ")})`;
}

/** The material section: registered files, each folder over its files,
 *  then the unregistered files outside any folder. */
function materialLines(material: PassMaterial): string[] {
	const { files, folders, unregistered } = material;
	const lines = files.filter((f) => !unregistered.has(f.handle)).map((f) => fileLine(f, material));
	for (const [handle, registered] of folders) {
		lines.push(`- ${handle}: ${registered} (a registered folder, read through its files below)`);
		lines.push(...files.filter((f) => unregistered.get(f.handle) === handle).map((f) => fileLine(f, material, "  ")));
	}
	lines.push(...files.filter((f) => unregistered.has(f.handle) && unregistered.get(f.handle) === null).map((f) => fileLine(f, material)));
	if (material.partial) lines.push("(The course's folder holds more files than the engine lists; only its registered files are listed here.)");
	return lines.length > 0 ? lines : ["(no registered material)"];
}

const refWords = (refs: MapCourseView["topics"][string]["refs"]) => refs.map((r) => `${r.source}${r.locator ? ` ${r.locator}` : ""}`).join("; ");

function courseHead(title: string, record: unknown, material: PassMaterial): string[] {
	const r = obj(record);
	const lines = [`# Course: ${title}`];
	if (typeof r.goal === "string" && r.goal.trim()) lines.push(`About the course, in the learner's words: ${r.goal.trim()}`);
	lines.push("", "## Material", ...materialLines(material));
	return lines;
}

/** The topics in path order, each with what the step reads of it. */
function topicLines(view: MapCourseView & Pick<ArcPassView, "proposed" | "added" | "implied"> & Partial<Pick<ArcPassView, "leftOut" | "examDate">>, withNeeds: boolean): string[] {
	const listed = [...view.order.filter((k) => k in view.topics), ...Object.keys(view.topics).filter((k) => !view.order.includes(k))];
	return listed.map((handle) => {
		const t = view.topics[handle]!;
		const proposed = view.proposed?.[handle] ?? [];
		const added = view.added?.[handle] ?? [];
		const stored = t.needs.filter((n) => !proposed.includes(n) && !added.includes(n));
		const implied = (view.implied ?? []).filter((i) => i.topic === handle).map((i) => i.need);
		const facts = [
			withNeeds && stored.length > 0 ? `needs ${stored.join(", ")}` : "",
			withNeeds && added.length > 0 ? `added needs ${added.join(", ")}` : "",
			withNeeds && proposed.length > 0 ? `proposed needs ${proposed.join(", ")}` : "",
			withNeeds && implied.length > 0 ? `implied needs ${implied.join(", ")}` : "",
			t.contrasts.length > 0 ? `contrasts ${t.contrasts.join(", ")}` : "",
			t.refs.length > 0 ? `refs ${refWords(t.refs)}` : "",
			t.aliases.length > 0 ? `also called ${t.aliases.join(", ")}` : "",
			t.excluded ? `left out of the exam: ${t.excluded}` : "",
			view.leftOut?.includes(handle) ? `outside the scope of the exam${view.examDate ? ` on ${view.examDate}` : ""}` : "",
		].filter(Boolean);
		return `- ${handle}: ${t.title ?? "(no title)"}${facts.length > 0 ? ` (${facts.join("; ")})` : ""}`;
	});
}

function edgesPrompt(title: string, view: MapCourseView, record: unknown, material: PassMaterial): string {
	const edges = storedEdges(view);
	const name = (k: string) => view.topics[k]?.title ?? k;
	return [
		...courseHead(title, record, material),
		"",
		"## Topics",
		...topicLines(view, false),
		"",
		"## Edges to judge",
		...(edges.length > 0 ? edges.map(([b, a]) => `- "${b}" (${name(b)}) needs "${a}" (${name(a)})`) : ["(none stored)"]),
	].join("\n");
}

function loopsPrompt(title: string, view: MapCourseView, record: unknown, material: PassMaterial, loops: readonly EdgeLoop[]): string {
	const name = (k: string) => view.topics[k]?.title ?? k;
	const edge = (e: { topic: string; need: string; reason: string }, kind: string) => `  - "${e.topic}" (${name(e.topic)}) needs "${e.need}" (${name(e.need)}), ${kind}: ${e.reason}`;
	return [
		...courseHead(title, record, material),
		"",
		"## Topics",
		...topicLines(view, false),
		"",
		"## Loops",
		...loops.flatMap((l, i) => [`- L${i + 1}:`, edge(l.use, "a reader's use"), ...l.path.map((e) => edge(e, e.fixed ? "stored and found by its topic's readers, so it cannot be broken" : e.stored ? "stored" : "a reader's use"))]),
	].join("\n");
}

export function kindsPrompt(title: string, view: MapCourseView, record: unknown, material: PassMaterial, candidates: readonly EdgeAdd[]): string {
	const name = (k: string) => view.topics[k]?.title ?? k;
	return [
		...courseHead(title, record, material),
		"",
		"## Topics",
		...topicLines(view, false),
		"",
		"## Candidates",
		...candidates.map((c) => `- "${c.topic}" (${name(c.topic)}) needs "${c.need}" (${name(c.need)}): ${c.reason}`),
	].join("\n");
}

function needsPrompt(title: string, view: MapCourseView, record: unknown, material: PassMaterial, topic: string): string {
	const t = view.topics[topic]!;
	const facts = [t.refs.length > 0 ? `refs ${refWords(t.refs)}` : "no refs", t.aliases.length > 0 ? `also called ${t.aliases.join(", ")}` : ""].filter(Boolean);
	return [...courseHead(title, record, material), "", "## Topics", ...topicLines(view, false), "", "## Your topic", `- ${topic}: ${t.title ?? "(no title)"} (${facts.join("; ")})`].join("\n");
}

/** The sources a topic's reader must read from before its answer counts:
 *  each readable source its refs cite (a registered folder, through any of
 *  its files), or, for a topic with no refs, any readable source. Pure. */
export function unreadRefs(topic: MapCourseView["topics"][string], read: ReadonlySet<string>, material: PassMaterial): string[] {
	const readable = new Set(material.files.filter((f) => f.kind === "pdf" || f.kind === "text").map((f) => f.handle));
	if (topic.refs.length === 0) return readable.size > 0 && ![...read].some((h) => readable.has(h)) ? ["any source that holds its material"] : [];
	const cited = [...new Set(topic.refs.map((r) => r.source))];
	return cited.filter((source) => {
		if (material.folders.has(source)) {
			const inside = [...material.unregistered].filter(([, folder]) => folder === source).map(([h]) => h);
			return inside.length > 0 && !inside.some((h) => read.has(h));
		}
		return readable.has(source) && !read.has(source);
	});
}

function cutPrompt(title: string, view: ArcPassView, record: unknown, material: PassMaterial): string {
	const exam = obj(obj(record).exam);
	const lines = courseHead(title, record, material);
	const facts = [
		view.examDate ? `Exam: ${view.examDate}${view.examPast ? ", already past" : ", still ahead"}` : "No exam date.",
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
	/** Each topic's readers, by topic: null for one that did not finish. */
	readings: Record<string, (NeedsReading | null)[]>;
	/** The loops the readers' uses closed, and the loop check's ruling on each. */
	loops: Array<EdgeLoop & { ruling: LoopRuling | null }>;
	/** Uses and adds the loop check set aside. */
	aside: EdgeAdd[];
	/** Adds the rest of the settled graph already implies: set aside. */
	implied: EdgeAdd[];
	/** The kind check's ruling on every candidate add; null when it did not
	 *  finish, and every candidate came in. */
	kinds: KindVerdict[] | null;
	/** Candidates sorted into a kind that makes no prerequisite: left out. */
	refused: EdgeAdd[];
	/** Adds the cut withdrew as failing the prerequisite test, with its
	 *  reason: dropped with the arcs, or no longer proposed. */
	withdrawn: EdgeDiff[];
	/** Implied needs the withdrawals brought back, saved or proposed with the arcs. */
	restored: EdgeAdd[];
}

export type ArcPassResult =
	| { status: "formed"; summary: string; edges: EdgeRun; answer: ArcSubmit; formation: Formation; revision: number | null; report: unknown; sort: SortMiss[] | null }
	| { status: "none"; reason: string; edges?: EdgeRun; answer?: ArcSubmit }
	| { status: "failed"; reason: string; edges?: EdgeRun; answer?: ArcSubmit; patch?: Json };

/** One entry of a run's transcript: a model message, an answer the app or
 *  the engine refused, or a save. */
export type TranscriptEntry =
	| { at: string; step: "edges" | "needs" | "kinds" | "loops" | "cut" | "sort" | "purpose"; kind: "message"; message: AssistantMessage; topic?: string }
	| { at: string; step: "sort"; kind: "sorted"; misses: SortMiss[] }
	| { at: string; step: "edges" | "needs" | "kinds" | "loops" | "cut"; kind: "refused"; problems: string; topic?: string }
	| { at: string; step: "needs"; kind: "skipped"; topic: string; reason: string }
	| { at: string; step: "edges" | "cut" | "note"; kind: "saved" | "save refused"; changes: unknown; message?: string };

export interface ArcPassOptions {
	edges: EdgeMode;
	/** In propose mode, the edges the cut must hold: every proposal
	 *  (default), so any he accepts keeps the cut valid; or only the stored
	 *  ones, so a proposal he has not accepted cannot reorder the material
	 *  (a copy run of his course; an add the cut contradicts is then not
	 *  accepted at --apply). */
	cutOn?: "proposed" | "stored";
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

/** What a live run's ledger write keeps of the one before: his setup words
 *  (`asked`) and the growth step's place (`grown`). */
const kept = (ledger: ArcPassLedger | undefined) => ({ ...(ledger?.asked ? { asked: ledger.asked } : {}), ...(ledger?.grown !== undefined ? { grown: ledger.grown } : {}) });

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
		const material = await passMaterial(directory, first, scanned.json, deps.fetchPage);
		const files = material.files;
		const title = typeof obj(first).title === "string" ? (obj(first).title as string) : workspace;
		const stop = new AbortController();
		const signal = options.signal ? AbortSignal.any([options.signal, stop.signal]) : stop.signal;
		const agent = <T>(
			step: "edges" | "needs" | "kinds" | "loops" | "cut",
			tool: string,
			parameters: typeof edgeSchema | typeof needsSchema | typeof kindsSchema | typeof loopsSchema | typeof arcSchema,
			doctrine: string,
			instructions: string,
			prompt: string,
			validate: (answer: T) => Promise<string | null>,
			topic?: string,
			onMessage?: (message: AssistantMessage) => void,
		) =>
			withBgLlmSlot(signal, () =>
				runSubmitAgent<T>({
					role: "teacher",
					toolName: tool,
					toolDescription: { edges: "Submit the verdict on every prerequisite.", needs: "Submit the topics your topic's exercises use.", kinds: "Submit the kind of every candidate prerequisite.", loops: "Submit where each loop breaks.", cut: "Submit the course's arcs." }[step],
					parameters,
					fill: (input: Json) =>
						({ edges: () => ({ verdicts: input.verdicts ?? [], add: input.add ?? [] }), needs: () => ({ uses: input.uses ?? [] }), kinds: () => ({ kinds: input.kinds ?? [] }), loops: () => ({ breaks: input.breaks ?? [] }), cut: () => ({ ...input, arcs: input.arcs ?? [] }) })[step]() as T,
					validate: async (answer) => {
						const problems = await validate(answer);
						if (problems) {
							log({ step, kind: "refused", problems, ...(topic ? { topic } : {}) });
							console.info(`[arc-pass ${workspace}] ${step}${topic ? ` ${topic}` : ""} answer refused: ${problems.replace(/\n/g, " | ")}`);
						}
						return problems;
					},
					systemPrompt: instructions + doctrine,
					prompt,
					engine,
					signal,
					extraTools: createMaterialTools(files, engine.model),
					maxTurns: readingRounds(files) + SUBMIT_ROUNDS,
					onMessage: (message) => {
						onMessage?.(message);
						log({ step, kind: "message", message, ...(topic ? { topic } : {}) });
					},
					onStep: (usage, model, n, finish, tools) => console.info(`[arc-pass ${workspace}] ${step}${topic ? ` ${topic}` : ""} step ${n} ${model}: ${usage.input} in, ${usage.output} out, ${finish}, ${tools}`),
					neverSubmitted: NEVER_SUBMITTED,
				}),
			);
		const save = async (step: "edges" | "cut" | "note", changes: Json) => {
			const saved = await courseRecords.run(workspace, { verb: "save", changes });
			log({ step, kind: saved.ok ? "saved" : "save refused", changes, ...(saved.ok ? {} : { message: saved.message }) });
			return saved;
		};

		const before = await viewNow(workspace);
		/** One topic's reader: its answer counts only once it has read from
		 *  each source the topic's refs cite. One that never submits keeps
		 *  every need of its topic. */
		const reader = async (topic: string): Promise<[string, NeedsReading | null]> => {
			const read = new Set<string>();
			const track = (message: AssistantMessage) => {
				for (const c of message.content) if (c.type === "toolCall" && (c.name === "read_material" || c.name === "search_material") && typeof c.arguments.source === "string") read.add(c.arguments.source);
			};
			try {
				const reading = await agent<NeedsReading>(
					"needs",
					NEEDS_TOOL,
					needsSchema,
					composeDoctrine(ARC_EDGES_DOCTRINE),
					ARC_NEEDS_INSTRUCTIONS,
					needsPrompt(title, before.view, before.record, material, topic),
					async (a) => {
						const unread = unreadRefs(before.view.topics[topic]!, read, material);
						if (unread.length > 0) return `Read your topic's material before you answer: nothing read yet from ${unread.join(", ")}.`;
						return readingProblems(a, topic, before.view);
					},
					topic,
					track,
				);
				return [topic, reading];
			} catch (err) {
				if (signal?.aborted) throw aborted();
				const reason = err instanceof Error ? err.message : String(err);
				log({ step: "needs", kind: "skipped", topic, reason });
				console.info(`[arc-pass ${workspace}] needs ${topic} skipped: ${reason}`);
				return [topic, null];
			}
		};
		const topics = Object.keys(before.view.topics);
		const [judged, ...read] = await Promise.all([
			agent<EdgeSubmit>("edges", EDGES_TOOL, edgeSchema, composeDoctrine(ARC_EDGES_DOCTRINE), ARC_EDGES_INSTRUCTIONS, edgesPrompt(title, before.view, before.record, material), async (a) => edgeProblems(a, before.view)).catch((err: unknown) => {
				stop.abort();
				throw err;
			}),
			...Array.from({ length: NEEDS_READERS }, () => topics.map(reader)).flat(),
		]);
		if (signal?.aborted) throw aborted();
		const readings = topics.map((t) => [t, read.filter(([topic]) => topic === t).map(([, r]) => r)] as const);
		const merged = new Map(readings.map(([t, rs]) => [t, mergeReadings(rs)]));
		const candidates = addCandidates(judged, new Map(readings), before.view);
		const kinds =
			candidates.length === 0
				? []
				: await agent<{ kinds: KindVerdict[] }>(
						"kinds",
						KINDS_TOOL,
						kindsSchema,
						composeDoctrine(ARC_EDGES_DOCTRINE),
						ARC_KINDS_INSTRUCTIONS,
						kindsPrompt(title, before.view, before.record, material, candidates),
						async (a) => kindProblems(a.kinds, candidates),
					)
						.then((a) => a.kinds)
						.catch((err: unknown) => {
							if (signal?.aborted) throw aborted();
							console.info(`[arc-pass ${workspace}] the kind check skipped, every candidate comes in: ${err instanceof Error ? err.message : String(err)}`);
							return null;
						});
		if (signal?.aborted) throw aborted();
		const heard = withReadings(judged, merged, before.view, kindAdmits(kinds));
		let rulings: LoopRuling[] = [];
		if (heard.loops.length > 0) {
			rulings = await agent<{ breaks: LoopRuling[] }>(
				"loops",
				LOOPS_TOOL,
				loopsSchema,
				composeDoctrine(ARC_EDGES_DOCTRINE),
				ARC_LOOPS_INSTRUCTIONS,
				loopsPrompt(title, before.view, before.record, material, heard.loops),
				async (a) => loopRulingProblems(a.breaks, heard.loops),
			)
				.then((a) => a.breaks)
				.catch((err: unknown) => {
					if (signal?.aborted) throw aborted();
					console.info(`[arc-pass ${workspace}] the loop check skipped, every loop's use stays aside: ${err instanceof Error ? err.message : String(err)}`);
					return [];
				});
			if (signal?.aborted) throw aborted();
		}
		const broken = breakLoops(heard.submit, heard.loops, rulings, before.view);
		const settledAnswer = withoutImplied(broken.submit, before.view);
		const edgeAnswer = settledAnswer.submit;
		const diffs = edgeDiffs(edgeAnswer);
		const edges: EdgeRun = { mode: options.edges, submit: edgeAnswer, diffs, applied: [], skipped: [], readings: Object.fromEntries(readings),
			loops: heard.loops.map((l, i) => ({ ...l, ruling: rulings.find((r) => r.loop === i + 1) ?? null })),
			aside: broken.aside,
			implied: settledAnswer.implied,
			kinds,
			refused: heard.refused,
			withdrawn: [],
			restored: [],
		};
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

		const added: Record<string, string[]> = {};
		for (const d of edges.applied) if (d.change === "add") (added[d.topic] ??= []).push(d.need);
		const settled = async () => {
			const read = await viewNow(workspace);
			// A cut on stored edges withdraws nothing, so it gets no implied needs to bring back.
			const implied = edges.implied.length > 0 && !(options.edges === "propose" && options.cutOn === "stored") ? { implied: edges.implied } : {};
			const view = { ...read.view, ...(edges.applied.length > 0 ? { added } : {}), ...implied };
			return { ...read, view: options.edges === "propose" && options.cutOn !== "stored" ? withProposed(view, diffs) : view };
		};
		const cut = await settled();
		const edgesEntry = edges.applied.length > 0 ? lastEdgesEntry(cut.record) : undefined;
		let sorted: SortMiss[] | null = null;
		/** Every miss this run's readers found, for standingMisses. */
		let seen: SortMiss[] = [];
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
				prompt: sortPrompt(title, quiz),
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
				const now = sortedAway(reads.map((read) => sortMisses(quiz, read, a)));
				sorted = standingMisses(seen, now, a);
				seen = mergeMisses(now, seen);
				log({ step: "sort", kind: "sorted", misses: sorted });
				const misses = sortProblems(sorted, a);
				if (misses) return misses;
			}
			const purposes = purposeQuiz(a, cut.view, formation);
			const purposeRead = await runSubmitAgent<PurposeAnswer>({
				role: "teacher",
				toolName: PURPOSE_TOOL,
				toolDescription: "Submit the topics a purpose line is false of, the names that are lists, and the arcs that answer two questions.",
				parameters: purposeSchema,
				fill: (input: Json) => ({
					false: (input.false as PurposeAnswer["false"] | undefined) ?? [],
					lines: (input.lines as PurposeAnswer["lines"] | undefined) ?? [],
					names: (input.names as PurposeAnswer["names"] | undefined) ?? [],
					splits: (input.splits as PurposeAnswer["splits"] | undefined) ?? [],
				}),
				validate: (answer) => purposeAnswerProblems(answer, purposes),
				systemPrompt: PURPOSE_INSTRUCTIONS,
				prompt: purposePrompt(purposes),
				engine,
				signal,
				extraTools: createMaterialTools(files, engine.model),
				maxTurns: readingRounds(files) + SUBMIT_ROUNDS,
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
		const answer = await agent<ArcSubmit>("cut", ARCS_TOOL, arcSchema, composeDoctrine(ARC_CUT_DOCTRINE), ARC_CUT_INSTRUCTIONS, cutPrompt(title, cut.view, cut.record, material), async (a) => {
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
		const out = new Set((answer.withdraw ?? []).map((w) => `${w.topic}\u0000${w.need}`));
		const withdrawnAs = (d: EdgeAdd): EdgeDiff => ({ ...d, change: "add", reason: answer.withdraw!.find((w) => w.topic === d.topic && w.need === d.need)!.reason.trim() });
		edges.withdrawn = [...edges.diffs.filter((d) => d.change === "add"), ...edges.implied].filter((d) => out.has(`${d.topic}\u0000${d.need}`)).map(withdrawnAs);
		edges.restored = withdrawal(now.view, answer).restored;
		if (options.edges === "propose") edges.diffs = [...edges.diffs.filter((d) => !edges.withdrawn.some((w) => w.topic === d.topic && w.need === d.need)), ...edges.restored.map((r) => ({ ...r, change: "add" as const }))];
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
			// His setup words and the growth step's place outlive every outcome.
			const write = (state: "formed" | "none" | "failed", extra: { reason?: string; revision?: number }) => ledgers.save(workspace, { ...kept(ledger), state, at: new Date().toISOString(), topics, ...extra });
			// A course set up by conversation carries his words asking for it,
			// so its arcs still form once he has begun studying it (G5).
			const asked = ledger?.asked;
			const studied = await studiedOf(workspace, record);
			if (studied.length > 0 && !asked) {
				write("failed", { reason: `he has studied ${studied.length === 1 ? "a topic" : "topics"} of it already, so only his words can ask for arcs` });
				return;
			}
			const title = typeof obj(record).title === "string" ? (obj(record).title as string) : workspace;
			signal = setRunPhase(jobKey, "grouping", "arc-pass", title).controller.signal;
			const result = await run(workspace, { edges: "apply", signal, ...(asked ? { asked } : {}) });
			if (result.status === "failed" && /^no model is set|does not allow background work$/.test(result.reason)) {
				console.info(`[arc-pass ${workspace}] skipped: ${result.reason}`);
				return;
			}
			if (result.status === "formed") write("formed", { reason: result.summary, ...(result.revision !== null ? { revision: result.revision } : {}) });
			else write(result.status, { reason: result.reason });
			console.info(`[arc-pass ${workspace}] ${result.status}: ${result.status === "formed" ? result.summary : result.reason}`);
		} catch (err) {
			const reason = failureWords(err, signal?.aborted === true || (err instanceof Error && err.name === "AbortError"));
			ledgers.save(workspace, { ...kept(ledger), state: "failed", at: new Date().toISOString(), topics, reason });
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
