/**
 * The lesson digest: when a lesson finishes, one background agent reads it
 * and saves to the course record what the tutor's live saves left out
 * (core/lesson-digest.ts holds the rules). It writes the engine only,
 * through the CourseRecords port, so the next session in the app, Claude
 * Code or Claude Desktop starts from it. It never posts into the chat and
 * never wakes the tutor: its only chat write is the record's digest ledger.
 *
 * It shows in the activity dock as a run of the shared background registry
 * (phase "digesting"), takes a permit of the shared background-LLM pool,
 * and runs on the app's default model, Opus 5.5 at high effort.
 */

import { Type, type Static } from "typebox";
import type { ChatRecord, DigestLedger } from "../../core/contracts/chat.ts";
import type { CourseMap } from "../../core/contracts/course-map.ts";
import type { ChatStore, CourseRecords } from "../../core/ports.ts";
import { derivePlanStatusesLh, derivedNodeStatus } from "../../core/contracts/plan.ts";
import { sessionSavesOf, sessionTasksOf, sessionTopicsOf } from "../../core/native-messages.ts";
import { sessionMarkdown } from "../../core/session-markdown.ts";
import {
	digestChanges,
	digestible,
	digestWindow,
	planFinished,
	type DigestCourseView,
	type DigestSubmit,
	type DigestWindow,
} from "../../core/lesson-digest.ts";
import type { PiEngine } from "../models.ts";
import { withBgLlmSlot } from "./bg-llm-semaphore.ts";
import { finishRun, setRunPhase } from "./extraction.ts";
import { runSubmitAgent } from "./submit-agent.ts";

const SUBMIT_TOOL = "submit_digest";

const digestSchema = Type.Object({
	topics: Type.Array(
		Type.Object({
			handle: Type.String({ description: "The course topic's handle; a new lowercase handle only for a topic the course lacks." }),
			title: Type.Optional(Type.String({ description: "Only for a new topic: its name, as the learner reads it." })),
			needs: Type.Optional(Type.Array(Type.String(), { description: "Only for a new topic: the handles of its prerequisites." })),
			introduced: Type.Optional(Type.Boolean({ description: "true when this lesson taught the topic." })),
			gap: Type.Optional(
				Type.Union([Type.String(), Type.Null()], {
					description: "The precise misconception the lesson showed, phrased so a later session can test it; null when the lesson showed the recorded gap resolved.",
				}),
			),
			note: Type.Optional(Type.String({ description: "Any other judgement worth carrying (fluent but slow, relies on a picture)." })),
		}),
	),
	knowledge: Type.Array(
		Type.Object({
			text: Type.String({ description: "One course fact: a notation, a convention, which source is authoritative for what." }),
			topics: Type.Array(Type.String(), { description: "Handles of the topics it belongs to." }),
		}),
	),
	task: Type.Optional(
		Type.Object({
			key: Type.String({ description: "One of the session's open tasks." }),
			step: Type.Optional(Type.String({ description: "The exact next step where the lesson stopped." })),
			help: Type.Optional(Type.String({ description: "The support given so far." })),
			finished: Type.Optional(Type.Boolean({ description: "true only when the lesson met the task's goal." })),
		}),
	),
	current: Type.Optional(Type.String({ description: "The topic the course should continue from next time." })),
});

export const DIGEST_INSTRUCTIONS = `You read a finished lesson and update the learner's course record with what the tutor did not save during it. You answer with one ${SUBMIT_TOOL} call.

What to record:
- topics: for each topic the lesson worked on, a \`gap\` when the learner showed a precise misconception or missing piece (phrase it so a later session can test it), \`null\` when the lesson showed a recorded gap resolved, and a \`note\` for any other judgement worth carrying. Mark \`introduced: true\` for course topics the lesson taught. Create a topic, with \`title\` and \`needs\`, only when the lesson taught an idea the course has no topic for.
- knowledge: course facts the lesson established, each a separate entry: notation, conventions the learner chose, which source is authoritative for what. Never facts about the learner.
- task: the session's open task at the exact step where the lesson stopped, and the help given. \`finished: true\` only when the lesson met the task's goal.
- current: the topic the course should continue from next time.

Rules:
- Graded answers are already recorded. Never restate an attempt; judge from the learner's questions, confusions, explanations and self-corrections.
- Leave out what the saves made during the lesson already hold, and anything the lesson did not show.
- Write to the learner, in plain words they understand days later: "you", never "he" or "the learner"; no dates or ids; math in $…$.
- When nothing is worth recording, submit empty lists.`;

/** The run's inputs, as the agent reads them. */
function digestPrompt(record: ChatRecord, window: DigestWindow, map: CourseMap, view: DigestCourseView): string {
	const lines = [`# Course: ${map.title}`, "", "## Topics, in path order"];
	for (const t of view.topics) {
		const facts = [t.introduced ? "introduced" : "not introduced yet", t.gap ? `gap: ${t.gap}` : "", t.note ? `note: ${t.note}` : ""].filter(Boolean);
		lines.push(`- ${t.handle}: ${t.title} (${facts.join("; ")})`);
	}
	lines.push("", `Path stands on: ${view.current ?? "(none)"}`);
	const tasks = map.tasks.filter((t) => view.tasks.includes(t.key));
	if (tasks.length > 0) {
		lines.push("", "## The session's open tasks");
		for (const t of tasks) lines.push(`- ${t.key}: ${t.title}${t.step ? ` (step: ${t.step})` : ""}`);
	}
	if (record.tree && record.tree.nodes.length > 0) {
		const statuses = derivePlanStatusesLh(record.tree, record.messages);
		lines.push("", "## The lesson's plan");
		for (const node of record.tree.nodes) lines.push(`- ${node.title}: ${derivedNodeStatus(statuses, node.id)}`);
	}
	const saves = sessionSavesOf(record.messages);
	if (saves.length > 0) {
		lines.push("", "## Saved during the lesson");
		for (const changes of saves) lines.push(`- ${JSON.stringify(changes)}`);
	}
	if (window.context.length > 0) {
		lines.push("", "## Earlier in this session (already read; context only)", "", sessionMarkdown(window.context, { anchors: false }));
	}
	lines.push("", "## The lesson", "", sessionMarkdown(window.fresh, { title: record.title, anchors: false }));
	return lines.join("\n");
}

/** One topic's `note`, from `show`'s items. */
function notesOf(json: unknown): Map<string, string> {
	const items = (json as { items?: Record<string, { note?: unknown }> } | null)?.items ?? {};
	return new Map(Object.entries(items).flatMap(([h, item]) => (typeof item?.note === "string" ? [[h, item.note]] : [])));
}

export interface LessonDigestDeps {
	chatStore: ChatStore;
	courseRecords: CourseRecords;
	/** Test seam: a scripted engine, checked first. */
	engine?: PiEngine;
	/** The lesson's engine, resolved fresh per run: the app's default model
	 *  (Opus 5.5 at high effort). Undefined when it cannot run, and the
	 *  digest skips. */
	engineFor?: (record: ChatRecord) => PiEngine | undefined;
	/** The subscription's background consent for the engine's provider. */
	backgroundAllowed?: (provider: string) => boolean;
}

export type DigestOutcome =
	| { status: "saved"; summary: string }
	| { status: "nothing" }
	| { status: "skipped"; reason: string }
	| { status: "busy" };

export interface LessonDigest {
	/** Digest the session's undigested part. Single-flight per chat: a call
	 *  during a run makes it run once more when it ends. */
	digestLesson(chatId: string): Promise<DigestOutcome>;
}

interface LhDigestGlobal {
	__lhDigestRuns?: { inFlight: Set<string>; rerun: Set<string> };
}

function digestRuns(): NonNullable<LhDigestGlobal["__lhDigestRuns"]> {
	const g = globalThis as typeof globalThis & LhDigestGlobal;
	return (g.__lhDigestRuns ??= { inFlight: new Set(), rerun: new Set() });
}

/** The ledger as it stands now, with `next` applied. */
function updateLedger(chatStore: ChatStore, chatId: string, next: (ledger: DigestLedger) => DigestLedger): void {
	const record = chatStore.getChat(chatId);
	if (record) chatStore.saveDigestLedger(chatId, next(record.digest ?? { done: [] }));
}

export function createLessonDigest(deps: LessonDigestDeps): LessonDigest {
	const { chatStore, courseRecords } = deps;

	async function digest(chatId: string, start: () => AbortSignal): Promise<DigestOutcome> {
		const record = chatStore.getChat(chatId);
		if (!record?.course || !digestible(record)) return { status: "skipped", reason: "not a lesson" };
		const window = digestWindow(record.messages, record.digest);
		if (!window) {
			if (record.digest?.pending) updateLedger(chatStore, chatId, ({ done }) => ({ done }));
			return { status: "nothing" };
		}
		const engine = deps.engine ?? deps.engineFor?.(record);
		if (!engine) return { status: "skipped", reason: "the default model cannot run" };
		if (deps.backgroundAllowed && !deps.backgroundAllowed(engine.model.provider)) {
			return { status: "skipped", reason: `${engine.model.provider} does not allow background work` };
		}
		updateLedger(chatStore, chatId, ({ done }) => ({ done, pending: { fingerprint: window.fingerprint, throughMessageId: window.throughMessageId } }));
		const signal = start();
		const { workspace } = record.course;
		const mapped = await courseRecords.map(workspace);
		if (!mapped.ok) throw new Error(`course map: ${mapped.message}`);
		const map = mapped.map;
		const listed = new Set(map.topics.map((t) => t.handle as string));
		const touched = [...new Set([...(record.topics ?? []), ...sessionTopicsOf(record.messages)])].filter((h) => listed.has(h));
		const shown = touched.length > 0 ? await courseRecords.run(workspace, { verb: "show", handles: touched }) : null;
		const notes = shown?.ok ? notesOf(shown.json) : new Map<string, string>();
		const view: DigestCourseView = {
			topics: map.topics.map((t) => ({
				handle: t.handle,
				title: t.title,
				introduced: t.introduced !== null,
				gap: t.signals.gap,
				note: notes.get(t.handle) ?? null,
			})),
			current: map.current,
			tasks: sessionTasksOf(record.messages).filter((key) => map.tasks.some((t) => t.key === key)),
			planFinished: planFinished(record.tree, record.messages),
		};
		const submit = await withBgLlmSlot(signal, () =>
			runSubmitAgent<DigestSubmit>({
				role: "teacher",
				toolName: SUBMIT_TOOL,
				toolDescription: "Submit what the lesson adds to the course record.",
				parameters: digestSchema,
				fill: (input: Static<typeof digestSchema>) => ({ ...input, topics: input.topics ?? [], knowledge: input.knowledge ?? [] }),
				systemPrompt: DIGEST_INSTRUCTIONS,
				prompt: digestPrompt(record, window, map, view),
				engine,
				signal,
				chatId,
				onStep: (usage, model, step) =>
					console.info(`[digest ${chatId}] step ${step} ${model}: ${usage.input} in, ${usage.output} out`),
				neverSubmitted: "The digest agent never submitted.",
			}),
		);
		if (signal.aborted || !chatStore.getChat(chatId)) throw Object.assign(new Error("digest aborted"), { name: "AbortError" });
		const patch = digestChanges(submit, view);
		if (patch) {
			const saved = await courseRecords.run(workspace, { verb: "save", changes: patch.changes });
			if (!saved.ok) throw new Error(`save refused (${saved.kind}): ${saved.message}`);
		}
		const outcome = patch?.summary ?? "nothing new to save";
		updateLedger(chatStore, chatId, ({ done }) => ({
			done: [...done, { throughMessageId: window.throughMessageId, fingerprint: window.fingerprint, at: new Date().toISOString(), outcome }],
		}));
		console.info(`[digest ${chatId}] ${outcome}`);
		return patch ? { status: "saved", summary: patch.summary } : { status: "nothing" };
	}

	async function digestLesson(chatId: string): Promise<DigestOutcome> {
		const R = digestRuns();
		if (R.inFlight.has(chatId)) {
			R.rerun.add(chatId);
			return { status: "busy" };
		}
		R.inFlight.add(chatId);
		const jobKey = `${chatId}#digest`;
		let signal: AbortSignal | undefined;
		try {
			const outcome = await digest(chatId, () => (signal = setRunPhase(jobKey, "digesting", "digest").controller.signal));
			if (outcome.status === "skipped") console.info(`[digest ${chatId}] skipped: ${outcome.reason}`);
			return outcome;
		} catch (err) {
			// The next lesson-finished event tries again; only a quit mid-run
			// leaves `pending` for the next start.
			if (chatStore.getChat(chatId)?.digest?.pending) updateLedger(chatStore, chatId, ({ done }) => ({ done }));
			if (err instanceof Error && err.name === "AbortError") return { status: "skipped", reason: "aborted" };
			console.error(`[digest ${chatId}] failed:`, err);
			throw err;
		} finally {
			R.inFlight.delete(chatId);
			if (signal) finishRun(jobKey);
			if (R.rerun.delete(chatId) && !signal?.aborted) {
				void digestLesson(chatId).catch(() => {});
			}
		}
	}

	return { digestLesson };
}
