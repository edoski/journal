/**
 * The material survey: while a new course or self-study is set up by
 * conversation, one fresh reader per file he pointed at reads just enough
 * of it to say what it is (slides, a book, exercises, a past exam, a
 * syllabus) and what it says about the exam. The setup agent reads the
 * sorted list and asks him only what the material does not say. The deep
 * read is the course map builder's, once the course exists.
 *
 * The readers run while he waits on the conversation, so they take no
 * permit of the background pool (an arc pass of another course could hold
 * it for many minutes); they run as wide as that pool, the same
 * provider-facing stance (bg-llm-semaphore.ts). The run shows in the
 * activity dock as a run of the background registry (phase "reading").
 */

import path from "node:path";
import { Type } from "typebox";
import type { SdkEngine } from "../models.ts";
import { createMaterialTools, measureMaterial, type MaterialFile } from "../tools/material.ts";
import { BG_LLM_PERMITS } from "./bg-llm-semaphore.ts";
import { finishRun, setRunPhase } from "./background-runs.ts";
import { runSubmitAgent } from "./submit-agent.ts";
import { SURVEY_KINDS, type SurveyedFile, type MaterialSurvey, type SurveyKind } from "../../core/setup.ts";

const SUBMIT_TOOL = "submit_file";
/** Rounds a reader may spend: a few reads of the file's opening pages and
 *  contents, then the submit and the submit seam's own retries. */
const READER_TURNS = 8;

const examSchema = Type.Object({
	date: Type.Optional(Type.String({ description: "The exam's day, YYYY-MM-DD, only when the file states it for this year's exam." })),
	sessions: Type.Optional(Type.Array(Type.String(), { description: "Every exam session (sitting) the file lists, YYYY-MM-DD." })),
	format: Type.Optional(Type.String({ description: "The exam's format, as the file states it." })),
	coverage: Type.Optional(Type.String({ description: "What the exam covers, as the file states it." })),
});

const fileSchema = Type.Object({
	kind: Type.Union(SURVEY_KINDS.map((k) => Type.Literal(k)), { description: "What the file is." }),
	title: Type.String({ description: "The file's own title, as its first page or heading gives it." }),
	covers: Type.String({ description: "One line: what it covers, in the material's own words (chapters, weeks, units)." }),
	course: Type.Optional(Type.String({ description: "The course or subject it belongs to, when the file names it." })),
	exam: Type.Optional(examSchema),
});

export const SURVEY_INSTRUCTIONS = `You look at one file of a student's study material and say what it is. Read only what that takes: its first pages, its table of contents, its headings. Never read the whole file.

- kind: slides (lecture slides or a lecture's handout), book (a textbook or a chapter of one), notes (lecture notes or a student's notes), exercises (exercise sheets, problem sets, labs, with or without solutions), past-exam (an exam paper or a mock exam), syllabus (a course description, a schedule, exam rules), other (anything else).
- title and covers: in the file's own words.
- exam: only what the file states about the course's exam (a syllabus or a past paper often does). Leave out what it does not state; never guess a date.

Answer with one ${SUBMIT_TOOL} call.`;

export interface MaterialSurveyDeps {
	/** The app's one model, resolved fresh per survey; undefined when the
	 *  account cannot run it. Tests pass a scripted engine. */
	engineFor: () => SdkEngine | undefined;
}

export interface SurveyOptions {
	/** The registry key's owner: the setup session. */
	chatId: string;
	/** What the dock row names (the folder or the course). */
	label: string;
	signal?: AbortSignal;
}

async function readOne(engine: SdkEngine, file: MaterialFile, signal: AbortSignal | undefined): Promise<SurveyedFile | { path: string; reason: string }> {
	if (file.kind === "unreadable" || file.kind === "folder") return { path: file.absolute, reason: file.problem ?? "it is a folder" };
	try {
		const answer = await runSubmitAgent<{ kind: SurveyKind; title: string; covers: string; course?: string; exam?: SurveyedFile["exam"] }>({
			role: "teacher",
			toolName: SUBMIT_TOOL,
			toolDescription: "Submit what the file is.",
			parameters: fileSchema,
			fill: (input) => input,
			systemPrompt: SURVEY_INSTRUCTIONS,
			prompt: `The file: ${path.basename(file.absolute)} (source handle "${file.handle}"${file.pages ? `, ${file.pages} pages` : ""}).`,
			engine,
			signal,
			extraTools: createMaterialTools([file], engine.model),
			maxTurns: READER_TURNS,
			onStep: (usage, model, n, finish, tools) => console.info(`[survey] ${path.basename(file.absolute)} step ${n} ${model}: ${usage.input} in, ${usage.output} out, ${finish}, ${tools}`),
			neverSubmitted: "The reader never said what the file is.",
		});
		return { path: file.absolute, kind: answer.kind, title: answer.title.trim(), covers: answer.covers.trim(), ...(answer.course?.trim() ? { course: answer.course.trim() } : {}), ...(answer.exam && Object.keys(answer.exam).length > 0 ? { exam: answer.exam } : {}) };
	} catch (err) {
		if (signal?.aborted) throw err;
		return { path: file.absolute, reason: err instanceof Error ? err.message : String(err) };
	}
}

/** Read each file with its own reader, as many at once as the background
 *  pool allows, and sort them. Never throws for one file: a file no reader
 *  could read comes back under `unread` with why. Throws AbortError when
 *  aborted. */
export async function surveyMaterial(deps: MaterialSurveyDeps, paths: readonly string[], options: SurveyOptions): Promise<MaterialSurvey | { error: string }> {
	const engine = deps.engineFor();
	if (!engine) return { error: "no model can run on the Claude account in Settings" };
	const key = `${options.chatId}#survey`;
	const run = setRunPhase(key, "reading", "survey", options.label);
	const signal = options.signal ? AbortSignal.any([options.signal, run.controller.signal]) : run.controller.signal;
	try {
		const files = await measureMaterial("/", paths.map((p, i) => ({ handle: `file-${i + 1}`, path: p })));
		// As many readers at once as the pool's width, each taking the next file
		// as it ends, so one long book never holds the others back.
		const results: Array<SurveyedFile | { path: string; reason: string }> = [];
		let next = 0;
		const worker = async () => {
			while (next < files.length) {
				if (signal.aborted) throw Object.assign(new Error("survey aborted"), { name: "AbortError" });
				results.push(await readOne(engine, files[next++]!, signal));
			}
		};
		await Promise.all(Array.from({ length: Math.min(BG_LLM_PERMITS, files.length) }, worker));
		return {
			files: results.filter((r): r is SurveyedFile => "kind" in r),
			unread: results.filter((r): r is { path: string; reason: string } => "reason" in r),
		};
	} finally {
		finishRun(key);
	}
}
