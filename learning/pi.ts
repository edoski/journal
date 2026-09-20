import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  type ToolDefinition,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";

type Message = {
  role: string;
  content?: string | Array<{
    type: string;
    text?: string;
    name?: string;
    arguments?: unknown;
  }>;
};

type Question = {
  question: string;
  context?: string;
  choices?: Array<{ id: string; label: string }>;
};

const quizParameters = Type.Object({
  question: Type.String({ minLength: 1 }),
  context: Type.Optional(Type.String()),
  choices: Type.Optional(Type.Array(Type.Object({
    id: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
  }), { minItems: 1 })),
  answer_id: Type.Optional(Type.String({ description: "Correct choice ID, when known." })),
  explanation: Type.Optional(Type.String({ description: "Feedback for the tutor after the attempt." })),
  assistance: Type.Optional(Type.String({ description: "Relevant help already given; omit if unknown." })),
});

type QuizParameters = Static<typeof quizParameters>;
type QuizOutcome = "answered" | "dont_know" | "skipped" | "cancelled" | "unavailable";
type QuizDetails = {
  question: Question;
  outcome: QuizOutcome;
  assistance?: string;
  answer?: { text: string; choice_id?: string; position?: number };
  correct?: boolean;
  explanation?: string;
};

function publicQuestion(value: unknown): Question | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const input = value as Record<string, unknown>;
  if (typeof input.question !== "string" || !input.question.trim()) return undefined;
  if (input.context !== undefined && typeof input.context !== "string") return undefined;
  const question: Question = { question: input.question };
  if (typeof input.context === "string") question.context = input.context;
  if (input.choices !== undefined) {
    if (!Array.isArray(input.choices) || input.choices.length === 0) return undefined;
    const choices: NonNullable<Question["choices"]> = [];
    for (const item of input.choices) {
      if (typeof item !== "object" || item === null ||
          typeof item.id !== "string" || !item.id.trim() ||
          typeof item.label !== "string" || !item.label.trim() ||
          choices.some((choice) => choice.id === item.id)) return undefined;
      choices.push({ id: item.id, label: item.label });
    }
    question.choices = choices;
  }
  return question;
}

function questionText(question: Question): string {
  return [
    question.context,
    question.question,
    question.choices?.map((choice, index) => `${index + 1}. ${choice.label}`).join("\n"),
  ].filter(Boolean).join("\n\n");
}

function lessonText(message: Message): string {
  if (message.role !== "assistant") return "";
  if (typeof message.content === "string") return message.content.trim();
  return (message.content ?? []).flatMap((part) => {
    if (part.type === "text") return part.text?.trim() ? [part.text.trim()] : [];
    if (part.type === "toolCall" && part.name === "quiz") {
      const question = publicQuestion(part.arguments);
      return question ? [questionText(question)] : [];
    }
    return [];
  }).join("\n\n");
}

type Correction = { messageId: string; original: string; replacement: string; reason: string };
type LessonEntry = { id: string; type: string; message?: Message; customType?: string; data?: unknown };
const CORRECTION = "learning-correction";
const correctionParameters = Type.Object({
  original: Type.String({ minLength: 1 }),
  replacement: Type.String({ minLength: 1 }),
  reason: Type.String({ minLength: 1 }),
  message_id: Type.Optional(Type.String()),
});

function projectLesson(entries: LessonEntry[]) {
  const turns: Array<{ id: string; text: string; reasons: string[] }> = [];
  for (const entry of entries) {
    if (entry.type === "message" && entry.message) {
      const text = lessonText(entry.message);
      if (text) turns.push({ id: entry.id, text, reasons: [] });
    } else if (entry.type === "custom" && entry.customType === CORRECTION) {
      const patch = entry.data as Correction;
      if (!patch || ![patch.messageId, patch.original, patch.replacement, patch.reason].every((value) => typeof value === "string" && value.trim())) {
        throw new Error("Invalid saved lesson correction.");
      }
      const turn = turns.find((item) => item.id === patch.messageId);
      if (!turn || turn.text.split(patch.original).length !== 2) {
        throw new Error("Saved correction no longer uniquely matches its teaching message.");
      }
      turn.text = turn.text.replace(patch.original, () => patch.replacement);
      turn.reasons.push(patch.reason.replace(/\s+/g, " ").trim());
    }
  }
  return turns;
}

const contextParameters = Type.Object({
  scope: Type.Optional(Type.String({ description: "Course/interest key; omit to discover scopes, without selectors or paging parameters." })),
  task: Type.Optional(Type.String({ description: "Exact stable task_index key returned by context, e.g. exercise-7, not the display title Exercise 7. Reuse a known key directly; omit when unknown to inspect the scope's task_index." })),
  topics: Type.Optional(Type.Array(Type.String(), { description: "Exact stable topic handles returned by context, not display labels. Reuse known handles; [] returns the index without history when discovery is needed." })),
  observations: Type.Optional(Type.Array(Type.String(), { description: "Exact observation handles returned by context or save, e.g. o1. Omit when no handles are known." })),
  query: Type.Optional(Type.String({ description: "Literal search of evidence and contextual understanding. Discovery excerpts are incomplete; read whole knowledge entries before relying on qualifications or editing." })),
  knowledge: Type.Optional(Type.Array(Type.String(), { description: "Exact knowledge keys for a focused whole-entry read; [] returns the paged knowledge index. Cannot combine with task/topic/observation/query, all, or preference selectors. Nonempty reads also exclude offset/limit." })),
  candidate_offset: Type.Optional(Type.Integer({ minimum: 0, description: "Query-only discovery cursor, separate from the observation offset. Continuing requires expected_revision." })),
  knowledge_budget: Type.Optional(Type.Integer({ minimum: 1, description: "UTF-8 byte allowance for ordinary scoped context or a nonempty exact knowledge read; never tokens. Choose deliberately when more or less knowledge is needed. Invalid for query, index, all or scope catalog." })),
  limit: Type.Optional(Type.Integer({ minimum: 1 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  expected_revision: Type.Optional(Type.Integer({ minimum: 0, description: "Required when continuing a page." })),
  concepts: Type.Optional(Type.Array(Type.String())),
  domains: Type.Optional(Type.Array(Type.String())),
  activity: Type.Optional(Type.String()),
  all: Type.Optional(Type.Boolean({ description: "Full scope; cannot combine with evidence filters or paging." })),
});

const saveParameters = Type.Object({
  scope: Type.String(),
  expected_revision: Type.Integer({ minimum: 0 }),
  changes: Type.Object({}, { additionalProperties: true, description: "Changed learning-record fields; see the learn skill's records reference when needed. Python validates the patch." }),
});

const silentMemoryDisplay: Pick<ToolDefinition, "renderShell" | "renderCall" | "renderResult"> = {
  renderShell: "self",
  renderCall: () => new Container(),
  renderResult(result, { expanded }, _theme, context) {
    return context.isError || expanded
      ? new Text(result.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n"), 0, 0)
      : new Container();
  },
};

function runLearning(args: string[], input = "", signal?: AbortSignal): Promise<string> {
  const python = process.env.LEARNING_PYTHON;
  const packageRoot = process.env.LEARNING_PACKAGE;
  if (!python || !packageRoot) throw new Error("Start this extension through the learning launcher.");
  signal?.throwIfAborted();
  return new Promise((accept, reject) => {
    const child = spawn(python, ["-m", "learning", ...args], {
      cwd: packageRoot, stdio: ["pipe", "pipe", "pipe"], timeout: 15_000, signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) accept(stdout.trim());
      else reject(new Error(stderr.trim() || stdout.trim() || `Learning memory exited with ${code}.`));
    });
    child.stdin.on("error", reject);
    child.stdin.end(input);
  });
}

function quizResult(params: QuizParameters, question: Question, outcome: QuizOutcome,
                    answer?: QuizDetails["answer"]) {
  const details: QuizDetails = { question, outcome };
  if (params.assistance !== undefined) details.assistance = params.assistance;
  if (answer) {
    details.answer = answer;
    if (answer.choice_id !== undefined && params.answer_id !== undefined) {
      details.correct = answer.choice_id === params.answer_id;
    }
  }
  if ((outcome === "answered" || outcome === "dont_know") && params.explanation) {
    details.explanation = params.explanation;
  }
  return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details };
}

export default function (pi: ExtensionAPI) {
  const root = process.env.LEARNING_ROOT;
  if (!root) throw new Error("LEARNING_ROOT is required; use the learning launcher.");
  let publicationError = "";
  let displayFallback = false;
  let viewEpoch = 0;
  let openedPath: string | undefined;
  let openAttempt: { path: string; epoch: number; settled: boolean; teaching: string } | undefined;
  pi.registerMarkdownTransformer((markdown, { messageType }) =>
    !publicationError && !displayFallback && messageType === "assistant" ? "" : markdown
  );
  let published: { path: string; text: string } | undefined;

  pi.registerTool({
    name: "learning_context",
    label: "Learning context",
    description: "Retrieve shared learning context, useful understanding and applicable preferences. Omit scope and all selectors/limits for the scope catalog. Known scope/task resumes directly; reuse loaded context until more evidence is needed. Search discovers entries; knowledge reads return them whole. Source files are read with native tools.",
    parameters: contextParameters,
    executionMode: "sequential",
    ...silentMemoryDisplay,
    async execute(_id, params, signal) {
      const { scope, expected_revision, all, ...filters } = params;
      const args = ["context"];
      for (const [key, value] of Object.entries(filters)) {
        const flag = key === "candidate_offset" ? "candidate-offset"
          : key === "knowledge_budget" ? "knowledge-budget" : key;
        if (value !== undefined) args.push(`--${flag}=${Array.isArray(value) ? value.join(",") : value}`);
      }
      if (expected_revision !== undefined) args.push(`--expect=${expected_revision}`);
      if (all) args.push("--all");
      if (scope !== undefined) args.push("--", scope);
      const text = await runLearning(args, "", signal);
      return { content: [{ type: "text", text }], details: {} };
    },
  });

  pi.registerTool({
    name: "learning_save",
    label: "Save learning",
    description: "Save related learning-record changes together at the last read revision (0 for a new scope). Returns the next revision and observation handles. Reconcile conflicts before retrying; a successful receipt needs no reread.",
    parameters: saveParameters,
    executionMode: "sequential",
    ...silentMemoryDisplay,
    async execute(_id, params, signal) {
      signal?.throwIfAborted();
      try {
        const text = await runLearning(["save", `--expect=${params.expected_revision}`, "--", params.scope], JSON.stringify(params.changes), signal);
        return { content: [{ type: "text", text }], details: {} };
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)} If execution was interrupted, retrieve context before resubmitting observations; the save may have completed.`);
      }
    },
  });

  const lessonPath = (ctx: ExtensionContext) => join(resolve(root), "sessions", `${ctx.sessionManager.getSessionId()}.md`);
  const report = (ctx: ExtensionContext, error: unknown) => {
    const message = `Lesson sync failed: ${error instanceof Error ? error.message : String(error)}`;
    if (message !== publicationError) {
      if (ctx.hasUI) ctx.ui.notify(message, "error");
      else process.stderr.write(`${message}\n`);
    }
    publicationError = message;
  };

  function openLesson(ctx: ExtensionContext, path: string, epoch: number, teaching: string) {
    const attempt = { path, epoch, settled: false, teaching };
    openAttempt = attempt;
    openedPath = path;
    const fail = (reason: string) => {
      if (attempt.settled) return;
      attempt.settled = true;
      if (openAttempt !== attempt || viewEpoch !== epoch || lessonPath(ctx) !== path) return;
      displayFallback = true;
      ctx.ui.notify(`Lesson saved; Obsidian could not open it: ${reason}. Teaching is available here.`, "warning");
      // Changing the transformer does not repaint already-hidden transcript entries.
      if (attempt.teaching) ctx.ui.notify(attempt.teaching, "info");
    };
    try {
      const child = spawn("/usr/bin/open", ["-g", `obsidian://open?path=${encodeURIComponent(path)}`], {
        detached: true, stdio: "ignore",
      });
      child.once("error", (error) => fail(error.message));
      child.once("exit", (code, signal) => {
        if (signal !== null || code !== 0) fail(signal ? `signal ${signal}` : `exit ${code}`);
        else attempt.settled = true;
      });
      child.unref();
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  async function sync(ctx: ExtensionContext, pending?: Message): Promise<boolean> {
    const path = lessonPath(ctx);
    const sessionId = ctx.sessionManager.getSessionId();
    const epoch = viewEpoch;
    const current = () => viewEpoch === epoch && lessonPath(ctx) === path;
    try {
      await withFileMutationQueue(path, async () => {
        if (!current()) return;
        const entries: LessonEntry[] = [...ctx.sessionManager.getBranch()];
        // message_end precedes appendMessage; use event identity, never text equality.
        if (pending && !entries.some((entry) => entry.message === pending)) entries.push({ id: "pending", type: "message", message: pending });
        const turns = projectLesson(entries);
        const teaching = turns.map((turn) => turn.text + (turn.reasons.length ? `\n\n> **Correction:** ${turn.reasons.join(" ")}` : ""));
        if (!teaching.length && !existsSync(path)) {
          published = undefined;
          return;
        }
        const text = teaching.map((text) => `${text}\n\n---`).join("\n\n");
        if (openAttempt?.path === path && openAttempt.epoch === epoch && !openAttempt.settled) {
          openAttempt.teaching = text;
        }
        if (published?.path !== path || published.text !== text) {
          await runLearning(["publish-lesson", sessionId], text);
          if (current()) published = { path, text };
        }
      });
      if (!current()) return false;
      publicationError = "";
      if (published?.path === path && published.text && openedPath !== path && !displayFallback && ctx.mode === "tui" && process.env.LEARNING_OPEN !== "0") {
        openLesson(ctx, path, epoch, published.text);
      }
      return true;
    } catch (error) {
      if (!current()) return false;
      report(ctx, error);
      if (ctx.hasUI && pending && lessonText(pending)) {
        ctx.ui.notify(lessonText(pending), "info");
      }
      return false;
    }
  }

  pi.registerTool({
    name: "correct_lesson",
    label: "Correct explanation",
    description: "Correct a previous explanation in the current Obsidian lesson. Supply an exact unique original passage, its replacement and a concise conceptual reason. If ambiguous, use the returned message ID. Corrections survive reloads on this branch. Explain the substantive correction in your next teaching response too; this does not update learner evidence.",
    parameters: correctionParameters,
    executionMode: "sequential",
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (![params.original, params.replacement, params.reason].every((value) => value.trim()) || params.original === params.replacement) {
        throw new Error("Provide a changed passage and a nonempty correction reason.");
      }
      const turns = projectLesson(ctx.sessionManager.getBranch());
      const matches = turns.filter((turn) => (!params.message_id || turn.id === params.message_id) && turn.text.includes(params.original));
      if (matches.length !== 1 || matches[0].text.split(params.original).length !== 2) {
        throw new Error(`Passage must match once; use a longer exact passage or message_id. Matching messages: ${matches.map((turn) => turn.id).join(", ") || "none"}`);
      }
      pi.appendEntry(CORRECTION, { messageId: matches[0].id, original: params.original, replacement: params.replacement, reason: params.reason });
      if (!await sync(ctx)) throw new Error("Correction was saved but lesson publication failed; retry publication rather than adding the correction again.");
      return { content: [{ type: "text", text: "Correction saved to the lesson." }], details: {} };
    },
  });

  pi.registerTool<typeof quizParameters, QuizDetails>({
    name: "quiz",
    label: "Study question",
    description: "Optionally ask one study question in the terminal. Use ordinary chat for extended reasoning. Do not repeat the question in assistant text. Choices keep their supplied order; free text is evaluated by the tutor. Answer keys stay out of the lesson until normal tutor feedback. Missing assistance is unknown, not independent performance.",
    parameters: quizParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const question = publicQuestion(params);
      if (!question) throw new Error("Provide a nonempty question and unique, nonempty choice IDs/labels.");
      if (params.answer_id !== undefined && !question.choices?.some((choice) => choice.id === params.answer_id)) {
        throw new Error("answer_id must identify one of the supplied choices.");
      }
      const result = (outcome: QuizOutcome, answer?: QuizDetails["answer"]) => quizResult(params, question, outcome, answer);
      if (ctx.mode !== "tui") return result("unavailable");
      if (signal?.aborted) return result("cancelled");
      // The calling assistant message is now in the branch; publication is an input barrier.
      if (!await sync(ctx)) throw new Error("Cannot ask the question because lesson publication failed.");
      if (signal?.aborted) return result("cancelled");
      const choices = question.choices ?? [];
      const labels = choices.map((choice, index) => `${index + 1}. ${choice.label}`);
      const freeText = "Write an answer";
      const unknown = "I don't know";
      const skip = "Skip this question";
      const selected = await ctx.ui.select(
        [question.context, question.question].filter(Boolean).join("\n\n"),
        [...labels, freeText, unknown, skip], { signal },
      );
      if (signal?.aborted || selected === undefined) return result("cancelled");
      if (selected === unknown) return result("dont_know");
      if (selected === skip) return result("skipped");
      if (selected === freeText) {
        const text = await ctx.ui.input(question.question, "Your answer", { signal });
        if (signal?.aborted || text === undefined || !text.trim()) return result("cancelled");
        return result("answered", { text: text.trim() });
      }
      const index = labels.indexOf(selected);
      if (index < 0) return result("cancelled");
      return result("answered", { text: choices[index].label, choice_id: choices[index].id, position: index + 1 });
    },
    renderCall(args) {
      const question = publicQuestion(args);
      return new Text(question ? questionText(question) : "Study question", 0, 0);
    },
    renderResult(result) {
      if (!result.details) return new Text("Question could not be completed.", 0, 0);
      const { outcome, answer } = result.details;
      const text = answer?.text ?? {
        answered: "Answer recorded",
        dont_know: "I don't know",
        skipped: "Question skipped",
        cancelled: "Question cancelled",
        unavailable: "Use ordinary chat for this question",
      }[outcome];
      return new Text(text, 0, 0);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") pi.setActiveTools(pi.getActiveTools().filter((name) => name !== "quiz"));
    viewEpoch += 1;
    openAttempt = undefined;
    publicationError = "";
    displayFallback = false;
    published = undefined;
    openedPath = undefined;
    await sync(ctx);
  });
  pi.on("message_end", async (event, ctx) => {
    if (lessonText(event.message)) await sync(ctx, event.message);
  });
  pi.on("session_tree", async (_event, ctx) => {
    viewEpoch += 1;
    if (openAttempt && !openAttempt.settled) openedPath = undefined;
    openAttempt = undefined;
    await sync(ctx);
  });
  pi.on("agent_settled", async (_event, ctx) => {
    if (publicationError) await sync(ctx);
  });
  pi.on("before_agent_start", async (event, ctx) => ({
    systemPrompt: `${event.systemPrompt}\nLesson destination (created with first teaching): ${lessonPath(ctx)}`,
  }));
}
