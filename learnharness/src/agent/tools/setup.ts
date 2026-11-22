/**
 * THE SETUP TOOLS: what the setup agent sets something new up with. The
 * server does the work (src/server/setup.ts) and injects it, so the agent
 * layer never reaches the store or the engine directly.
 *
 * - `survey_material` starts the material survey in the background (one
 *   reader per file) and returns at once; the sorting arrives as a setup
 *   note that wakes the session, so the conversation carries on meanwhile.
 * - `create_learning` makes the course or the self-study, links its
 *   material and starts its map build. Once it succeeds the session is the
 *   new course's, and the course tools take over its corrections.
 * - `teach` hands the session to its first lesson, only once it is made.
 */

import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { invalidInputResult, toToolResult } from "../tool-execute.ts";
import { LEARNING_KINDS, type LearningCreated, type NewLearning } from "../../core/setup.ts";
import type { CourseLink } from "../../core/contracts/course.ts";
import type { SteerMessage } from "../../core/contracts/jobs.ts";
import type { LhMessage } from "../../core/native-messages.ts";
import { teachHandoffTool } from "./handoff.ts";

export interface SetupToolContext {
	chatId: string;
	chatStore: { getChat(id: string): { messages: LhMessage[]; course?: CourseLink } | null };
	/** Queue a handoff's wake. */
	deliver: (steer: SteerMessage) => void;
	/** Start the survey of these files; its sorting arrives as a setup note. */
	survey: (paths: string[]) => { started: true } | { error: string };
	/** Make the course or the self-study and link this session to it. */
	create: (input: NewLearning) => Promise<LearningCreated>;
}

const surveyInput = Type.Object({
	paths: Type.Array(Type.String({ minLength: 1 }), {
		minItems: 1,
		description: "Absolute paths of the files to read, every file of the material you found (list a folder's files with Glob first).",
	}),
});

const examInput = Type.Object({
	date: Type.Optional(Type.String({ description: "The exam day he aims at, YYYY-MM-DD." })),
	sessions: Type.Optional(Type.Array(Type.String(), { description: "Every session (sitting) of the exam, YYYY-MM-DD, earliest first, when there are several." })),
	format: Type.Optional(Type.String({ description: "The exam's format, as the material or he states it." })),
	coverage: Type.Optional(Type.String({ description: "What it covers, as the material or he states it." })),
});

const createInput = Type.Object({
	kind: Type.Union(LEARNING_KINDS.map((k) => Type.Literal(k)), { description: "course: a university course or class. self-study: something he learns on his own, with no course behind it." }),
	title: Type.String({ minLength: 1, description: "Its name, as he or the material calls it: \"Machine Learning and Data Mining\", \"Git rebase\"." }),
	goal: Type.Optional(Type.String({ description: "One sentence: what he wants to be able to do. Required for a self-study." })),
	folder: Type.Optional(Type.String({ description: "The folder that holds the course's material, which becomes the course itself (as his other courses are kept). Absolute." })),
	where: Type.Optional(Type.String({ description: "Without folder: the study folder a new folder for it goes in, one of those listed in your prompt." })),
	files: Type.Optional(Type.Array(Type.String(), { description: "More material files from elsewhere (Downloads, a dropped file), absolute: copied into it." })),
	folders: Type.Optional(Type.Array(Type.String(), { description: "More folders of material from elsewhere, absolute: linked, and new files in them are read as they arrive." })),
	websites: Type.Optional(Type.Array(Type.Object({ address: Type.String(), title: Type.Optional(Type.String()) }), { description: "Open websites to read: the course page, an openly licensed text." })),
	exam: Type.Optional(examInput),
	asked: Type.String({ minLength: 1, description: "His own words that asked for it, quoted from his message." }),
});

/** A session already linked to the course it set up. */
const madeIn = (ctx: SetupToolContext): CourseLink | undefined => ctx.chatStore.getChat(ctx.chatId)?.course;

export function setupTools(ctx: SetupToolContext): Record<string, AgentTool<any>> {
	const survey: AgentTool<typeof surveyInput> = {
		name: "survey_material",
		label: "survey_material",
		description:
			"Start reading his material in the background: one reader per file says what it is (slides, a book, exercises, a past exam, a syllabus) and what it states about the exam. " +
			"Returns at once; the sorting arrives later as a new message, and the conversation carries on meanwhile. Call it once with every file you found.",
		parameters: surveyInput,
		executionMode: "sequential",
		execute: async (_toolCallId, input) => {
			const started = ctx.survey(input.paths);
			if ("error" in started) return invalidInputResult("survey_material", [started.error]);
			return toToolResult({ started: true, note: "Reading now. The sorting arrives as a new message; meanwhile ask him what the material cannot tell you, or end your turn." });
		},
	};
	const create: AgentTool<typeof createInput> = {
		name: "create_learning",
		label: "create_learning",
		description:
			"Make the course or the self-study: its record, its material linked, its exam, and its topic map started in the background. " +
			"Once it succeeds this conversation belongs to it, and you correct anything with course_save.",
		parameters: createInput,
		executionMode: "sequential",
		execute: async (_toolCallId, input) => {
			const made = madeIn(ctx);
			if (made) return invalidInputResult("create_learning", [`${made.title} is set up already in this conversation: change it with course_save`]);
			if (input.kind === "self-study" && input.exam) return invalidInputResult("create_learning", ["a self-study has no exam: leave exam out, or make it a course"]);
			if (input.kind === "self-study" && !input.goal?.trim()) return invalidInputResult("create_learning", ["a self-study needs its goal: one sentence on what he wants to be able to do"]);
			// No tool timeout: making a course is a run of engine calls, each
			// with its own limit, and one cut short would be retried into a twin.
			const created = await ctx.create(input);
			if (!created.ok) return invalidInputResult("create_learning", [created.error]);
			return toToolResult({ ...created, note: "Set up. Its topic map is being built from the material; a new message says when it is ready." });
		},
	};
	const teach = teachHandoffTool(ctx, { problemActive: false }).teach!;
	const firstLesson: AgentTool<any> = {
		...teach,
		description: "Hand the session to its first lesson: the tutor takes over and teaches. Only once it is set up and he wants to start. After it succeeds, end your turn.",
		execute: async (...args: Parameters<AgentTool<any>["execute"]>) => {
			if (!madeIn(ctx)) return invalidInputResult("teach", ["nothing is set up yet: create it first"]);
			return teach.execute(...args);
		},
	};
	return { survey_material: survey, create_learning: create, teach: firstLesson };
}
