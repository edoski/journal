/** Deterministic Pi adapter checks. Run with `node --test tests/learning/test_pi.mjs`. */
import assert from "node:assert/strict";
import childProcess, { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repository = resolve(import.meta.dirname, "../..");
const piBinary = realpathSync(execFileSync("which", ["pi"], { encoding: "utf8" }).trim());
const piPackage = resolve(dirname(piBinary), "../..");
const { loadExtensions } = await import(pathToFileURL(join(piPackage, "dist/core/extensions/loader.js")));
const { SessionManager } = await import(pathToFileURL(join(piPackage, "dist/core/session-manager.js")));
const { validateToolArguments } = await import(pathToFileURL(join(piPackage, "node_modules/@earendil-works/pi-ai/dist/utils/validation.js")));

async function fixture(t, { open = false, throwOnOpen = false, beforePublish, readingMode = "terminal", privateLaunch = false } = {}) {
  const workspace = realpathSync(await mkdtemp(join(tmpdir(), "learning-pi-unit-")));
  execFileSync(join(repository, ".venv/bin/python"), ["-m", "learning", "--workspace", workspace, "init"], { cwd: repository });
  const root = join(workspace, ".study");
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const previous = { ...process.env };
  Object.assign(process.env, {
    STUDY_WORKSPACE: workspace,
    LEARNING_PACKAGE: repository,
    LEARNING_PYTHON: join(repository, ".venv/bin/python"),
    LEARNING_OPEN: open ? "1" : "0",
    LEARNING_READING_MODE: readingMode,
    LEARNING_PRIVATE: privateLaunch ? "1" : "0",
    LEARNING_NO_SAVE: "0",

  });
  t.after(() => {
    for (const key of ["STUDY_WORKSPACE", "LEARNING_PACKAGE", "LEARNING_PYTHON", "LEARNING_OPEN", "LEARNING_READING_MODE", "LEARNING_PRIVATE", "LEARNING_NO_SAVE"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const openings = [];
  if (open) {
    const realSpawn = childProcess.spawn;
    const mock = t.mock.method(childProcess, "spawn", (command, ...args) => {
      if (command !== "/usr/bin/open") {
        if (args[0].includes("publish-lesson")) beforePublish?.(openings);
        return realSpawn(command, ...args);
      }
      if (throwOnOpen) throw new Error("Opener unavailable");
      const child = new EventEmitter();
      child.unref = () => child;
      openings.push(child);
      return child;
    });
    syncBuiltinESMExports();
    t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
  }
  const loaded = await loadExtensions([join(repository, "learning/pi.ts")], repository);
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions[0];
  const id = randomUUID();
  const branch = [];
  loaded.runtime.appendEntry = (customType, data) => branch.push({ type: "custom", id: randomUUID(), customType, data });
  const errors = [];
  let activeTools = ["read", "quiz"];
  loaded.runtime.getActiveTools = () => activeTools;
  loaded.runtime.setActiveTools = (names) => { activeTools = names; };
  const ctx = {
    mode: "tui", hasUI: true,
    sessionManager: {
      getSessionId: () => id,
      getSessionName: () => "Singular systems",
      getBranch: () => branch,
    },
    ui: { notify: (message) => errors.push(message) },
  };
  const emit = async (name, event = {}) => {
    for (const handler of extension.handlers.get(name) ?? []) await handler(event, ctx);
  };
  const append = (message) => branch.push({ type: "message", id: randomUUID(), message });
  const complete = async (message) => { await emit("message_end", { message }); append(message); };
  const path = join(root, "lessons", `${id}.md`);
  return { ctx, branch, errors, openings, emit, append, complete, path, extension, runtime: loaded.runtime, activeTools: () => activeTools };
}

const assistant = (text) => ({ role: "assistant", content: [{ type: "text", text }] });
const params = {
  question: "How many solutions does this consistent singular system have?",
  context: "$Ax=b$, with two identical equations.",
  choices: [{ id: "none", label: "None" }, { id: "many", label: "Infinitely many" }],
  labels: { write: "Write an answer", unknown: "I don't know", skip: "Skip this question", placeholder: "Your answer", cancelled: "Question cancelled", unavailable: "Use ordinary chat for this question" },
  answer_id: "many", explanation: "SECRET: a line of solutions.", assistance: "Consistency was explained.",
};
const questionMessage = () => ({ role: "assistant", content: [{ type: "toolCall", name: "quiz", id: randomUUID(), arguments: params }] });

test("assistant projection preserves event identity and branch reconstruction without redundant publication", async (t) => {
  const f = await fixture(t);
  await f.emit("session_start", { reason: "new" });
  const teaching = assistant("A zero determinant does not imply inconsistency.\n\n$$\\det A=0$$\n\n```mermaid\ngraph LR\nA-->B\n```");
  await f.complete({ role: "user", content: "USER PROMPT" });
  await f.complete(teaching);
  const original = await readFile(f.path, "utf8");
  assert.doesNotMatch(original, /# Singular systems|# Study session/);
  assert.ok(original.includes(teaching.content[0].text));
  assert.match(original, /\n\n---\n<!-- learning-generated:end -->/);
  assert.doesNotMatch(original, /USER PROMPT|## You\n|## Tutor\n/);
  const python = process.env.LEARNING_PYTHON;
  process.env.LEARNING_PYTHON = "/unavailable-python";
  await f.emit("message_end", { message: teaching });
  await f.complete({ role: "user", content: "Another prompt" });
  await f.emit("agent_settled");
  await f.emit("session_tree");
  assert.deepEqual(f.errors, []);
  process.env.LEARNING_PYTHON = python;
  await f.complete(assistant(teaching.content[0].text));
  const repeated = await readFile(f.path, "utf8");
  assert.equal(repeated.split("A zero determinant").length - 1, 2);
  assert.ok(repeated.includes("\n\n---\n\nA zero determinant"));
  f.branch.pop();
  await f.emit("session_tree");
  assert.equal(await readFile(f.path, "utf8"), original);
});

async function memoryTool(f, name, args, signal) {
  const tool = f.extension.tools.get(name).definition;
  const params = validateToolArguments(tool, { type: "toolCall", id: "memory", name, arguments: args });
  const result = await tool.execute("memory", params, signal, undefined, f.ctx);
  return JSON.parse(result.content[0].text);
}

test("memory tools preserve patches and share CLI retrieval, preferences and revision-bound pages", async (t) => {
  const f = await fixture(t);
  const context = (args) => memoryTool(f, "learning_context", args);
  assert.deepEqual((await context({})).scopes, []);
  const empty = await context({ scope: "course" });
  assert.equal(empty.revision, 0);
  assert.equal(empty.vault, process.env.STUDY_WORKSPACE);
  const evidence = "-it's $literal `text`\n日本語 and \\LaTeX";
  const saved = await memoryTool(f, "learning_save", {
    scope: "course", expected_revision: empty.revision,
    changes: {
      title: "Course",
      topics: { systems: { domains: ["mathematics"] } },
      focus: ["systems"],
      observations: [
        { topics: ["systems"], text: evidence, assistance: "One hint." },
        { topics: ["systems"], text: "Explained the dependency." },
      ],
      tasks: { exercise: { task: "Exercise", topics: ["systems"], question: "Why unique?" } },
      current_task: "exercise",
    },
  });
  assert.deepEqual(saved.assigned_observations, ["o1", "o2"]);
  const cli = (args, input) => JSON.parse(execFileSync(process.env.LEARNING_PYTHON,
    ["-m", "learning", ...args], { cwd: repository, encoding: "utf8", input }));
  cli(["preferences", "--expect", "0"], JSON.stringify({ rules: [{
    when: { domain: "mathematics", activity: "proof" },
    values: { pace: { instruction: "Justify each step.", origin: "explicit" } },
  }] }));
  const resumed = await context({ scope: "course", task: "exercise", activity: "proof" });
  assert.deepEqual(resumed, cli(["context", "course", "--task=exercise", "--activity=proof"]));
  assert.equal(resumed.observations.o1.text, evidence);
  assert.equal(resumed.task.question, "Why unique?");
  assert.equal(resumed.preferences.rules[0].values.pace.instruction, "Justify each step.");
  assert.deepEqual((await context({ scope: "course", topics: [] })).observations, {});
  assert.deepEqual(Object.keys((await context({ scope: "course", query: evidence })).observations), ["o1"]);
  assert.deepEqual(Object.keys((await context({ scope: "course", observations: ["o2"] })).observations), ["o2"]);
  const page = await context({ scope: "course", topics: ["systems"], limit: 1 });
  assert.equal(page.complete, false);
  const next = await context({ scope: "course", topics: ["systems"], limit: 1,
    offset: page.next_offset, expected_revision: page.revision });
  assert.equal(next.complete, true);
  assert.deepEqual(Object.keys(next.observations), ["o2"]);
  assert.deepEqual(await context({ scope: "course", all: true }), cli(["context", "course", "--all"]));
});

test("memory tools reject invalid writes and stale revisions without changing evidence", async (t) => {
  const f = await fixture(t);
  const save = (expected_revision, changes, signal) => memoryTool(f, "learning_save",
    { scope: "course", expected_revision, changes }, signal);
  await save(0, { topics: { systems: {} }, observations: [{ topics: ["systems"], text: "Original evidence." }] });
  const path = join(join(process.env.STUDY_WORKSPACE, ".study"), "state/course.json");
  const original = await readFile(path, "utf8");
  await assert.rejects(save(0, { title: "Stale" }), /revision conflict/);
  await assert.rejects(save(1, { observations: [{ topics: ["missing"], text: "Invalid reference." }] }), /unknown.*missing/);
  await assert.rejects(save(1, []), /Validation failed/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(save(1, { title: "Cancelled" }, controller.signal), /abort/i);
  assert.equal(await readFile(path, "utf8"), original);
  await assert.rejects(memoryTool(f, "learning_context", { scope: "course", all: true, query: "x" }), /cannot be combined/);
  await assert.rejects(memoryTool(f, "learning_context", { scope: "course", expected_revision: 0 }), /revision conflict/);
});

test("knowledge tools share focused CLI reads, source metadata and explicit byte-budget errors", async (t) => {
  const f = await fixture(t);
  const context = (args) => memoryTool(f, "learning_context", { scope: "course", ...args });
  const literal = "-it's $literal `text`\n日本語 and \\LaTeX";
  await memoryTool(f, "learning_save", {
    scope: "course", expected_revision: 0,
    changes: {
      sources: { sheet: { path: "notes/lecture.md", version: "edition-1" } },
      knowledge: {
        notation: { text: literal, refs: [{ source: "sheet", locator: "Notation" }] },
        lengthy: { text: "日本語".repeat(1200) },
      },
    },
  });
  const cli = (args) => JSON.parse(execFileSync(process.env.LEARNING_PYTHON,
    ["-m", "learning", "context", "course", ...args], { cwd: repository, encoding: "utf8" }));
  const focused = await context({ knowledge: ["notation"], expected_revision: 1 });
  assert.deepEqual(focused, cli(["--knowledge=notation", "--expect=1"]));
  assert.equal(focused.knowledge.notation.text, literal);
  assert.equal(focused.knowledge.notation.refs[0].source_version, "edition-1");
  assert.equal(focused.sources.sheet.path, "notes/lecture.md");
  assert.equal(focused.observations, undefined);
  const index = await context({ knowledge: [], limit: 1 });
  assert.deepEqual(await context({ knowledge: [], limit: 1, evidence_budget: 2 }), index);
  assert.deepEqual(await context({ knowledge: ["notation"], expected_revision: 1, evidence_budget: 2 }), focused);
  assert.deepEqual(index, cli(["--knowledge=", "--limit=1"]));
  assert.equal(index.selection.mode, "knowledge_index");
  assert.equal(index.selection.next_offset, 1);
  const next = await context({ knowledge: [], limit: 1, offset: 1, expected_revision: 1 });
  assert.deepEqual(next, cli(["--knowledge=", "--limit=1", "--offset=1", "--expect=1"]));
  assert.equal(next.selection.complete, true);
  await assert.rejects(context({ knowledge: ["lengthy"] }),
    /^Error: knowledge read requires \d+ bytes \(budget \d+\); entries: lengthy=\d+; fetch fewer entries or set --knowledge-budget \d+$/);
  const enlarged = await context({ knowledge: ["lengthy"], knowledge_budget: 20000 });
  assert.deepEqual(enlarged, cli(["--knowledge=lengthy", "--knowledge-budget=20000"]));
  assert.equal(enlarged.knowledge.lengthy.text, "日本語".repeat(1200));
  const bounded = await context({ knowledge_budget: 1024 });
  assert.deepEqual(bounded, cli(["--knowledge-budget=1024"]));
  assert.deepEqual(Object.keys(bounded.knowledge), ["notation"]);
  assert.equal(bounded.knowledge_selection.omitted, 1);
  assert.equal((await context({ knowledge_budget: 20000 })).knowledge.lengthy.text,
    "日本語".repeat(1200));
  await assert.rejects(context({ knowledge: ["notation"], query: "literal" }), /knowledge selection cannot combine/);
  await assert.rejects(context({ knowledge: [], knowledge_budget: 20000 }), /knowledge.*budget|knowledge-budget/);
});

test("knowledge discovery preserves independent revision-bound candidate paging", async (t) => {
  const f = await fixture(t);
  await memoryTool(f, "learning_save", {
    scope: "course", expected_revision: 0,
    changes: { knowledge: Object.fromEntries(Array.from({ length: 9 }, (_, index) =>
      [`note-${index}`, { text: `Remembered marker ${index}.` }])) },
  });
  const context = (args) => memoryTool(f, "learning_context", { scope: "course", query: "Remembered marker", ...args });
  const first = await context({});
  assert.equal(first.candidates.items.length, 8);
  assert.equal(first.candidates.complete, false);
  assert.equal(first.candidates.next_offset, 8);
  await assert.rejects(context({ candidate_offset: 8 }), /revision|expect/);
  const next = await context({ candidate_offset: 8, expected_revision: first.revision });
  const cli = JSON.parse(execFileSync(process.env.LEARNING_PYTHON,
    ["-m", "learning", "context", "course", "--query=Remembered marker", "--candidate-offset=8", "--expect=1"],
    { cwd: repository, encoding: "utf8" }));
  assert.deepEqual(next, cli);
  assert.deepEqual(next.candidates.items.map((item) => [item.kind, item.key, item.discovery_only]),
    [["knowledge", "note-8", true]]);
  assert.equal(next.candidates.complete, true);
});

test("memory bookkeeping stays out of the lesson and terminal while errors remain visible", async (t) => {
  const f = await fixture(t);
  for (const name of ["learning_context", "learning_save", "learning_manage", "correct_lesson"]) {
    const tool = f.extension.tools.get(name).definition;
    assert.deepEqual(tool.renderCall().render(80), []);
    const result = { content: [{ type: "text", text: "Internal result" }], details: {} };
    assert.deepEqual(tool.renderResult(result, { expanded: false }, undefined, { isError: false }).render(80), []);
    assert.match(tool.renderResult(result, { expanded: true }, undefined, { isError: false }).render(80).join("\n"), /Internal result/);
    assert.match(tool.renderResult(result, { expanded: false }, undefined, { isError: true }).render(80).join("\n"), /Internal result/);
    await f.complete({ role: "assistant", content: [{ type: "toolCall", name, arguments: {} }] });
    await f.complete({ role: "toolResult", content: [{ type: "text", text: "Internal result" }] });
  }
  await assert.rejects(readFile(f.path), { code: "ENOENT" });
  await f.complete(assistant("## A useful explanation\n\nOnly study content."));
  assert.doesNotMatch(await readFile(f.path, "utf8"), /Internal result|learning_context|learning_save/);
});

test("quiz publishes public content before input and records stable answers without exposing its key", async (t) => {
  const f = await fixture(t);
  const quiz = f.extension.tools.get("quiz").definition;
  assert.equal(quiz.executionMode, "sequential");
  f.append(questionMessage());
  let selected = "2. Infinitely many";
  f.ctx.ui.select = async (_title, options, { signal }) => {
    const lesson = await readFile(f.path, "utf8");
    assert.match(lesson, /1\. None\n2\. Infinitely many/);
    assert.doesNotMatch(lesson, /SECRET|answer_id|Consistency was explained/);
    assert.deepEqual(options.slice(0, 2), ["1. None", "2. Infinitely many"]);
    assert.equal(signal, undefined);
    return selected;
  };
  const run = () => quiz.execute("call", params, undefined, undefined, f.ctx);
  const answered = (await run()).details;
  assert.deepEqual(answered.answer, { text: "Infinitely many", choice_id: "many", position: 2 });
  assert.equal(answered.correct, true);
  assert.equal(answered.assistance, params.assistance);
  for (const [label, outcome] of [["I don't know", "dont_know"], ["Skip this question", "skipped"], [undefined, "cancelled"]]) {
    selected = label;
    const result = (await run()).details;
    assert.equal(result.outcome, outcome);
    assert.equal(result.correct, undefined);
    assert.equal(result.answer, undefined);
  }
  selected = "Write an answer";
  f.ctx.ui.input = async () => "A line";
  const free = (await run()).details;
  assert.deepEqual(free.answer, { text: "A line" });
  assert.equal(free.correct, undefined);
  const controller = new AbortController();
  f.ctx.ui.select = async (_title, _options, opts) => {
    assert.equal(opts.signal, controller.signal);
    controller.abort();
    return "2. Infinitely many";
  };
  assert.equal((await quiz.execute("call", params, controller.signal, undefined, f.ctx)).details.outcome, "cancelled");
  const rendered = quiz.renderCall(params).render(100).join("\n");
  assert.doesNotMatch(rendered, /SECRET|answer_id/);
});

test("failed publication never opens quiz input; non-TUI disables the tool", async (t) => {
  const f = await fixture(t);
  await f.emit("session_start", { reason: "new" });
  await mkdir(dirname(f.path), { recursive: true });
  await writeFile(f.path, "# A user-owned note\n");
  f.append(questionMessage());
  const quiz = f.extension.tools.get("quiz").definition;
  let opened = false;
  f.ctx.ui.select = async () => { opened = true; return undefined; };
  await assert.rejects(quiz.execute("call", params, undefined, undefined, f.ctx), /publication failed/);
  assert.equal(opened, false);
  assert.equal(await readFile(f.path, "utf8"), "# A user-owned note\n");
  f.ctx.mode = "rpc";
  await f.emit("session_start", { reason: "reload" });
  assert.deepEqual(f.activeTools(), ["read"]);
  assert.equal((await quiz.execute("call", params, undefined, undefined, f.ctx)).details.outcome, "unavailable");
  assert.equal(opened, false);
});

test("sessions preserve authored headings without adding a session header", async (t) => {
  const f = await fixture(t);
  f.ctx.sessionManager.getSessionName = () => undefined;
  await f.emit("session_start", { reason: "new" });
  await f.complete({ role: "user", content: "Please explain singular systems." });
  await f.complete(assistant("## Singular systems ##\n\nA singular system can still be consistent."));
  const lesson = await readFile(f.path, "utf8");
  assert.ok(lesson.includes("## Singular systems ##\n\nA singular system"));
  assert.doesNotMatch(lesson, /Please explain|Study session/);
  const python = process.env.LEARNING_PYTHON;
  process.env.LEARNING_PYTHON = "/unavailable-python";
  await f.emit("agent_settled");
  assert.deepEqual(f.errors, []);
  process.env.LEARNING_PYTHON = python;
});

test("Pi publishes Obsidian math from TeX-delimited teaching, including replay", async (t) => {
  const f = await fixture(t);
  await f.complete(assistant(String.raw`\(P\) swaps the first and third coordinates:

\[
P(7,-1,4)=(4,-1,7).
\]`));
  const lesson = await readFile(f.path, "utf8");
  assert.ok(lesson.includes("$P$ swaps"));
  assert.ok(lesson.includes("$$\nP(7,-1,4)=(4,-1,7).\n$$"));
  assert.doesNotMatch(lesson, /^# /m);
  await f.emit("session_start", { reason: "reload" });
  assert.equal(await readFile(f.path, "utf8"), lesson);
});


test("empty starts stay out of the vault and first teaching uses the current session identity", async (t) => {
  const f = await fixture(t);
  await f.emit("session_start", { reason: "new" });
  await assert.rejects(readFile(f.path), { code: "ENOENT" });
  const root = join(process.env.STUDY_WORKSPACE, ".study");
  await assert.rejects(readFile(join(root, "index.md")), { code: "ENOENT" });
  const actualId = randomUUID();
  f.ctx.sessionManager.getSessionId = () => actualId;
  await f.complete({ role: "user", content: "Continue SMM" });
  await f.complete({ role: "assistant", content: [{ type: "toolCall", name: "read" }] });
  await assert.rejects(readFile(join(root, "lessons", `${actualId}.md`)), { code: "ENOENT" });
  await f.complete(assistant("Here is the next explanation."));
  assert.match(await readFile(join(root, "lessons", `${actualId}.md`), "utf8"), /next explanation/);
  await assert.rejects(readFile(f.path), { code: "ENOENT" });
});

test("empty branches clear previous teaching, recover publication failures and protect unowned notes", async (t) => {
  const f = await fixture(t);
  await f.complete(assistant("Prior branch teaching."));
  const original = await readFile(f.path, "utf8");
  f.branch.length = 0;
  const python = process.env.LEARNING_PYTHON;
  process.env.LEARNING_PYTHON = "/unavailable-python";
  await f.emit("session_tree");
  assert.equal(await readFile(f.path, "utf8"), original);
  assert.ok(f.errors.some((message) => message.startsWith("Lesson sync failed:")));
  process.env.LEARNING_PYTHON = python;
  await f.emit("agent_settled");
  const empty = await readFile(f.path, "utf8");
  assert.doesNotMatch(empty, /Prior branch teaching/);
  assert.match(empty, /learning-session:/);
  await writeFile(f.path, "# User-owned note\n");
  await f.emit("session_start", { reason: "reload" });
  assert.equal(await readFile(f.path, "utf8"), "# User-owned note\n");
  assert.ok(f.errors.some((message) => message.includes("unowned lesson")));
});

test("persisted Pi compaction and restart reconstruct corrected teaching and selected branches", async (t) => {
  const f = await fixture(t);
  const root = join(process.env.STUDY_WORKSPACE, ".study");
  const sessions = join(root, "pi-sessions");
  let manager = SessionManager.create(root, sessions);
  f.ctx.sessionManager = manager;
  f.runtime.appendEntry = (type, data) => manager.appendCustomEntry(type, data);
  const beginning = manager.appendMessage({ role: "user", content: "Explain the inverse." });
  manager.appendMessage(assistant("The inverse equals P squared."));
  await f.emit("session_start", { reason: "new" });
  await f.extension.tools.get("correct_lesson").definition.execute("correction", {
    original: "The inverse equals P squared.", replacement: "The inverse equals P.",
    reason: "P squared is the identity.",
  }, undefined, undefined, f.ctx);
  const retained = manager.appendMessage({ role: "user", content: "Continue." });
  manager.appendCompaction("We corrected the inverse and will continue.", retained, 1000);
  manager.appendMessage(assistant("Now apply the inverse."));
  await f.emit("session_tree");
  const path = join(root, "lessons", `${manager.getSessionId()}.md`);
  const projected = await readFile(path, "utf8");
  assert.match(projected, /The inverse equals P\./);
  assert.match(projected, /\*\*Correction:\*\*/);
  assert.match(projected, /Now apply the inverse\./);
  assert.doesNotMatch(projected, /The inverse equals P squared\./);
  manager = SessionManager.open(manager.getSessionFile(), sessions);
  f.ctx.sessionManager = manager;
  assert.ok(manager.getBranch().some((entry) => entry.type === "compaction"));
  assert.doesNotMatch(JSON.stringify(manager.buildSessionContext().messages), /The inverse equals P squared\./);
  await rm(path);
  await f.emit("session_start", { reason: "reload" });
  assert.equal(await readFile(path, "utf8"), projected);
  const leaf = manager.getLeafId();
  manager.branch(beginning);
  await f.emit("session_tree");
  assert.doesNotMatch(await readFile(path, "utf8"), /The inverse|Now apply/);
  manager.branch(leaf);
  await f.emit("session_tree");
  assert.equal(await readFile(path, "utf8"), projected);
  assert.deepEqual(f.errors, []);
});


test("lesson corrections survive reconstruction and stay with their message and branch", async (t) => {
  const f = await fixture(t);
  await f.complete(assistant("The inverse equals P squared."));
  const correction = f.extension.tools.get("correct_lesson").definition;
  await correction.execute("fix", {
    original: "The inverse equals P squared.", replacement: "The inverse equals P.",
    reason: "P squared is the identity, so P is its own inverse.",
  }, undefined, undefined, f.ctx);
  const corrected = await readFile(f.path, "utf8");
  assert.match(corrected, /The inverse equals P\./);
  assert.match(corrected, /\*\*Correction:\*\*/);
  assert.doesNotMatch(corrected, /The inverse equals P squared/);
  await f.emit("session_start", { reason: "reload" });
  assert.equal(await readFile(f.path, "utf8"), corrected);
  await f.complete(assistant("Next explanation."));
  assert.match(await readFile(f.path, "utf8"), /The inverse equals P\./);
  const patchIndex = f.branch.findIndex((entry) => entry.type === "custom");
  const patch = f.branch.splice(patchIndex, 1)[0];
  await f.emit("session_tree");
  assert.match(await readFile(f.path, "utf8"), /The inverse equals P squared/);
  f.branch.splice(patchIndex, 0, patch);
  await f.emit("session_tree");
  assert.doesNotMatch(await readFile(f.path, "utf8"), /The inverse equals P squared/);
  await f.complete(assistant("Next explanation."));
  const size = f.branch.length;
  await assert.rejects(correction.execute("ambiguous", {
    original: "Next explanation.", replacement: "A replacement.", reason: "Clarify.",
  }, undefined, undefined, f.ctx), /must match once/);
  assert.equal(f.branch.length, size);
});


test("explicit Obsidian reading mode hides duplicate teaching and falls back after publication failure", async (t) => {
  const f = await fixture(t, { readingMode: "obsidian" });
  const transform = f.extension.markdownTransformer;
  assert.equal(transform("Teaching", { messageType: "assistant", isStreaming: true }), "");
  assert.equal(transform("Question", { messageType: "user", isStreaming: false }), "Question");
  const originalPython = process.env.LEARNING_PYTHON;
  process.env.LEARNING_PYTHON = "/unavailable-python";
  await f.complete(assistant("Teaching remains accessible."));
  assert.ok(f.errors.some((message) => message === "Teaching remains accessible."));
  assert.equal(transform("Teaching", { messageType: "assistant", isStreaming: false }), "Teaching");
  process.env.LEARNING_PYTHON = originalPython;
  await f.emit("agent_settled");
  assert.match(await readFile(f.path, "utf8"), /Teaching remains accessible/);
  assert.equal(transform("Teaching", { messageType: "assistant", isStreaming: false }), "");
});

for (const failure of ["spawn error", "nonzero exit", "signal", "synchronous spawn error"]) {
  test(`known opener ${failure} preserves saved teaching and enables terminal fallback once`, async (t) => {
    const f = await fixture(t, { open: true, readingMode: "obsidian", throwOnOpen: failure === "synchronous spawn error" });
    await f.emit("session_start", { reason: "new" });
    await f.complete(assistant("This saved explanation must remain readable."));
    if (failure === "spawn error") {
      f.openings[0].emit("error", new Error("Opener unavailable"));
      f.openings[0].emit("exit", -2, null);
    } else if (failure === "nonzero exit") f.openings[0].emit("exit", 1, null);
    else if (failure === "signal") f.openings[0].emit("exit", null, "SIGTERM");
    assert.equal(f.errors.filter((message) => message.startsWith("Lesson saved;")).length, 1);
    assert.equal(f.errors.filter((message) => message.includes("This saved explanation")).length, 1);
    assert.equal(f.extension.markdownTransformer("Next teaching", { messageType: "assistant" }), "Next teaching");
    await f.complete(assistant("Next teaching"));
    await f.emit("agent_settled");
    assert.equal(f.extension.markdownTransformer("Still readable", { messageType: "assistant" }), "Still readable");
    assert.equal(f.openings.length, failure === "synchronous spawn error" ? 0 : 1);
    assert.match(await readFile(f.path, "utf8"), /This saved explanation[\s\S]*Next teaching/);
    assert.ok(!f.errors.some((message) => message.startsWith("Lesson sync failed:")));
  });
}

test("delayed open failure exposes the latest corrected teaching without replaying corrections", async (t) => {
  const f = await fixture(t, { open: true, readingMode: "obsidian" });
  await f.complete(assistant("The inverse equals P squared."));
  await f.complete(assistant("Now apply the inverse."));
  const receipt = await f.extension.tools.get("correct_lesson").definition.execute("fix", {
    original: "The inverse equals P squared.", replacement: "The inverse equals P.",
    reason: "P squared is the identity.",
  }, undefined, undefined, f.ctx);
  assert.equal(receipt.content[0].text, "Correction saved to the lesson.");
  const beforeFailure = await readFile(f.path, "utf8");
  f.openings[0].emit("exit", 1, null);
  assert.match(f.errors[1], /The inverse equals P\.[\s\S]*Now apply the inverse\./);
  assert.doesNotMatch(f.errors[1], /The inverse equals P squared/);
  await f.complete(assistant("Continue from this corrected result."));
  assert.equal(f.branch.filter((entry) => entry.customType === "learning-correction").length, 1);
  assert.equal(f.openings.length, 1);
  assert.equal(f.errors.length, 2);
  assert.match(await readFile(f.path, "utf8"), /The inverse equals P\.[\s\S]*Now apply the inverse\.[\s\S]*Continue from this corrected result/);
});

test("open failure during the next publication reveals its already-hidden pending teaching", async (t) => {
  let publications = 0;
  const f = await fixture(t, { open: true, readingMode: "obsidian", beforePublish: (openings) => {
    if (++publications === 2) openings[0].emit("exit", 1, null);
  } });
  await f.complete(assistant("First teaching."));
  await f.complete(assistant("Teaching awaiting publication."));
  assert.match(f.errors[1], /First teaching[\s\S]*Teaching awaiting publication/);
  assert.equal(f.extension.markdownTransformer("Readable", { messageType: "assistant" }), "Readable");
  assert.match(await readFile(f.path, "utf8"), /Teaching awaiting publication/);
});

for (const transition of ["session", "branch"]) {
  test(`stale opener callbacks cannot replay teaching across a ${transition} change`, async (t) => {
    const f = await fixture(t, { open: true, readingMode: "obsidian" });
    await f.complete(assistant("Old teaching."));
    const stale = f.openings[0];
    f.branch.length = 0;
    if (transition === "session") {
      const id = randomUUID();
      f.ctx.sessionManager.getSessionId = () => id;
      await f.emit("session_start", { reason: "new" });
    } else await f.emit("session_tree");
    await f.complete(assistant("Current teaching."));
    assert.equal(f.openings.length, 2);
    stale.emit("error", new Error("Late failure"));
    stale.emit("exit", 1, null);
    assert.deepEqual(f.errors, []);
    assert.equal(f.extension.markdownTransformer("Hidden", { messageType: "assistant" }), "");
    f.openings[1].emit("exit", null, "SIGTERM");
    assert.match(f.errors[1], /Current teaching/);
    assert.doesNotMatch(f.errors[1], /Old teaching/);
    assert.equal(f.extension.markdownTransformer("Readable", { messageType: "assistant" }), "Readable");
    f.branch.length = 0;
    const nextId = randomUUID();
    f.ctx.sessionManager.getSessionId = () => nextId;
    await f.emit("session_start", { reason: "new" });
    await f.complete(assistant("New session teaching."));
    f.openings[2].emit("exit", 0, null);
    assert.equal(f.extension.markdownTransformer("Hidden again", { messageType: "assistant" }), "");
    await f.complete(assistant("More teaching."));
    assert.equal(f.openings.length, 3);
  });
}

test("explicit reload retries the reading surface and restores fallback if it still fails", async (t) => {
  const f = await fixture(t, { open: true, readingMode: "obsidian" });
  const transform = (text) => f.extension.markdownTransformer(text, { messageType: "assistant" });
  await f.complete(assistant("Teaching before reload."));
  f.openings[0].emit("error", new Error("Obsidian unavailable"));
  assert.equal(transform("Readable"), "Readable");
  await f.emit("session_start", { reason: "reload" });
  assert.equal(f.openings.length, 2);
  f.openings[0].emit("exit", 1, null);
  assert.equal(f.errors.length, 2);
  f.openings[1].emit("exit", null, "SIGTERM");
  assert.equal(transform("Still readable"), "Still readable");
  assert.equal(f.errors.filter((message) => message.includes("Teaching before reload")).length, 2);
  await f.complete(assistant("Continue in the terminal."));
  assert.equal(f.openings.length, 2);
  await f.emit("session_start", { reason: "reload" });
  f.openings[2].emit("exit", 0, null);
  assert.equal(transform("Normal reading surface"), "");
  await f.complete(assistant("Continue in Obsidian."));
  assert.equal(f.openings.length, 3);
});

test("teaching streams in the terminal by default and only complete messages are mirrored", async (t) => {
  const f = await fixture(t);
  const transform = f.extension.markdownTransformer;
  assert.equal(transform("An unfinished explanation", { messageType: "assistant", isStreaming: true }), "An unfinished explanation");
  await assert.rejects(readFile(f.path), { code: "ENOENT" });
  await f.complete(assistant("A complete explanation."));
  assert.match(await readFile(f.path, "utf8"), /A complete explanation/);
  assert.equal(transform("A complete explanation.", { messageType: "assistant", isStreaming: false }), "A complete explanation.");
  process.env.LEARNING_PYTHON = "/unavailable-python";
  await f.complete(assistant("The next explanation stays readable."));
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /Lesson sync failed/);
  assert.equal(transform("Still readable", { messageType: "assistant", isStreaming: true }), "Still readable");
});

test("localized free-text quiz enters an answer directly without a menu", async (t) => {
  const f = await fixture(t);
  const quiz = f.extension.tools.get("quiz").definition;
  const localized = {
    question: "Perché il sistema non ha soluzione unica?",
    labels: { write: "Rispondi", unknown: "Non so", skip: "Salta", placeholder: "La tua risposta", cancelled: "Domanda annullata", unavailable: "Rispondi nella conversazione" },
  };
  f.ctx.ui.select = async () => { assert.fail("Free text must not open a menu"); };
  f.ctx.ui.input = async (title, placeholder) => {
    assert.equal(title, localized.question);
    assert.equal(placeholder, localized.labels.placeholder);
    return "Le equazioni sono dipendenti.";
  };
  const args = validateToolArguments(quiz, { type: "toolCall", id: "quiz", name: "quiz", arguments: localized });
  const result = await quiz.execute("quiz", args, undefined, undefined, f.ctx);
  assert.equal(result.details.answer.text, "Le equazioni sono dipendenti.");
  assert.equal(result.details.assistance, undefined);
  f.ctx.ui.input = async () => undefined;
  const cancelled = await quiz.execute("quiz", args, undefined, undefined, f.ctx);
  assert.match(quiz.renderResult(cancelled).render(100).join("\n"), /Domanda annullata/);
});

test("quiet management shares preferences, source snapshots, memory previews and exact array labels", async (t) => {
  const f = await fixture(t);
  const manage = (args) => memoryTool(f, "learning_manage", args);
  const initial = await manage({ action: "preferences" });
  await manage({ action: "preferences", expected_revision: initial.revision, expected_digest: initial.digest,
    changes: { rules: [{ when: { domain: "algebra, geometry" }, values: { pace: { instruction: "Explain geometrically.", origin: "explicit" } } }] } });
  const policyContext = await memoryTool(f, "learning_context", { domains: ["algebra, geometry"] });
  assert.equal(policyContext.preferences.rules[0].values.pace.instruction, "Explain geometrically.");
  const vault = process.env.STUDY_WORKSPACE;
  await mkdir(vault, { recursive: true });
  await writeFile(join(vault, "sheet.md"), "Course notation and assumptions.\n");
  const saved = await memoryTool(f, "learning_save", { scope: "course", expected_revision: 0, changes: {
    sources: { sheet: { path: "sheet.md" } },
    knowledge: { convention: { text: "Use lambda for the multiplier.", aliases: ["Lagrange multiplier"] } },
  } });
  const inspectedSource = await manage({ action: "sources", scope: "course", sources: ["sheet"] });
  assert.equal(inspectedSource.sources.sheet.status, "unverified");
  const capture = await manage({ action: "sources", scope: "course", sources: ["sheet"], expected_revision: saved.revision, expected_digest: saved.digest });
  assert.deepEqual(capture.captured, ["sheet"]);
  const inspection = await manage({ action: "inspect", scope: "course" });
  assert.equal(inspection.records[0].record.knowledge.convention.text, "Use lambda for the multiplier.");
  const discovery = await manage({ action: "discover", query: "Lagrange multiplier" });
  assert.match(JSON.stringify(discovery), /convention/);
  const plan = await manage({ action: "plan", scope: "course", days: 1, horizon: 1, knowledge_budget: 1024, evidence_budget: 2048 });
  assert.equal(plan.scopes[0].scope, "course");
  const preview = await manage({ action: "forget", scope: "course", selection: { knowledge: ["convention"] } });
  assert.equal(preview.applied, false);
  await manage({ action: "forget", scope: "course", selection: { knowledge: ["convention"] }, apply: true, expected_revision: preview.revision, expected_digest: preview.digest });
  const final = await memoryTool(f, "learning_context", { scope: "course", knowledge: [] });
  assert.doesNotMatch(JSON.stringify(final), /convention/);
});

test("definitive validation/conflict failures differ from interrupted write delivery", async (t) => {
  const f = await fixture(t);
  const saved = await memoryTool(f, "learning_save", { scope: "course", expected_revision: 0, changes: { title: "Course" } });
  await assert.rejects(memoryTool(f, "learning_save", { scope: "course", expected_revision: 0, changes: { title: "Stale" } }), (error) => {
    assert.equal(error.kind, "conflict");
    assert.doesNotMatch(error.message, /may have completed|interrupted/);
    return true;
  });
  await assert.rejects(memoryTool(f, "learning_save", { scope: "course", expected_revision: saved.revision, changes: { focus: ["missing"] } }), (error) => {
    assert.equal(error.kind, "validation");
    assert.doesNotMatch(error.message, /may have completed|interrupted/);
    return true;
  });
  process.env.LEARNING_PYTHON = "/unavailable-python";
  await assert.rejects(memoryTool(f, "learning_save", { scope: "course", expected_revision: saved.revision, changes: { title: "Not started" } }), (error) => {
    assert.equal(error.kind, "io");
    assert.doesNotMatch(error.message, /may have completed|interrupted/);
    return true;
  });
  const delayed = join(join(process.env.STUDY_WORKSPACE, ".study"), "delayed-command");
  await writeFile(delayed, "#!/bin/sh\nexec /bin/sleep 5\n");
  await chmod(delayed, 0o700);
  process.env.LEARNING_PYTHON = delayed;
  const controller = new AbortController();
  const pending = memoryTool(f, "learning_save", { scope: "course", expected_revision: saved.revision, changes: { title: "Uncertain" } }, controller.signal);
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(pending, /retrieve context.*may have completed/);
});

for (const privateLaunch of [false, true]) {
  test(`${privateLaunch ? "private launch" : "natural no-save request"} suppresses portable writes and publication`, async (t) => {
    const f = await fixture(t, { privateLaunch });
    await f.emit("session_start");
    if (!privateLaunch) {
      const receipt = await memoryTool(f, "learning_manage", { action: "no_save" });
      assert.equal(receipt.portable_saving, false);
      assert.match(receipt.native_history, /unchanged/);
      await f.emit("session_start", { reason: "reload" });
    }
    assert.deepEqual((await memoryTool(f, "learning_context", {})).scopes, []);
    await f.complete(assistant("Study continues naturally."));
    await assert.rejects(readFile(f.path), { code: "ENOENT" });
    assert.equal(f.extension.markdownTransformer("Study continues naturally.", { messageType: "assistant", isStreaming: true }), "Study continues naturally.");
    await assert.rejects(memoryTool(f, "learning_save", { scope: "course", expected_revision: 0, changes: { title: "No write" } }), /does not save/);
    await assert.rejects(memoryTool(f, "learning_manage", { action: "preferences", expected_revision: 0, changes: { rules: [] } }), /does not save/);
    await assert.rejects(readFile(join(join(process.env.STUDY_WORKSPACE, ".study"), "state/course.json")), { code: "ENOENT" });
  });
}

test("learner notes survive correction, branch reconstruction and restart", async (t) => {
  const f = await fixture(t);
  await f.complete(assistant("The inverse is P squared."));
  await writeFile(f.path, (await readFile(f.path, "utf8")) + "\nMy question: why can P be its own inverse?\n");
  await f.extension.tools.get("correct_lesson").definition.execute("fix", {
    original: "The inverse is P squared.", replacement: "The inverse is P.", reason: "P squared is the identity.",
  }, undefined, undefined, f.ctx);
  await f.complete(assistant("Try a different permutation."));
  await f.emit("session_tree");
  await f.emit("session_start", { reason: "reload" });
  const lesson = await readFile(f.path, "utf8");
  assert.match(lesson, /My question: why can P be its own inverse/);
  assert.match(lesson, /The inverse is P\./);
  assert.doesNotMatch(lesson, /The inverse is P squared/);
});


test("save schema allows canonical explicit clearing of optional knowledge and course context", async (t) => {
  const f = await fixture(t);
  const first = await memoryTool(f, "learning_save", { scope: "course", expected_revision: 0, changes: {
    topics: { systems: { title: "Linear systems" } },
    sources: { sheet: { path: "sheet.md" } },
    course_context: { assessment: "Oral examination" },
    knowledge: { convention: { text: "A denotes the matrix.", topics: ["systems"], refs: [{ source: "sheet", locator: "Notation" }], attribution: "Course sheet", uncertainty: "Edition unknown", conflicts: ["Earlier notes differ"], aliases: ["Matrix notation"] } },
  } });
  const args = { scope: "course", expected_revision: first.revision, expected_digest: first.digest, changes: {
    course_context: null,
    knowledge: { convention: { topics: null, refs: null, attribution: null, uncertainty: null, conflicts: null, aliases: null } },
  } };
  const path = join(join(process.env.STUDY_WORKSPACE, ".study"), "state/course.json");
  const before = await readFile(path, "utf8");
  const preview = await memoryTool(f, "learning_save", args);
  assert.equal(preview.status, "needs_confirmation");
  assert.deepEqual(preview.changes[0].fields.uncertainty, { before: "Edition unknown", after: null });
  assert.equal(await readFile(path, "utf8"), before);
  const tool = f.extension.tools.get("learning_save").definition;
  const rendered = tool.renderResult({ content: [{ type: "text", text: JSON.stringify(preview) }] }, { expanded: false }, {}, { isError: false });
  assert.deepEqual(rendered.render(80), []);
  const saved = await memoryTool(f, "learning_save", { ...args, confirm_qualification_changes: ["convention"] });
  assert.equal(saved.status, undefined);
  assert.equal(saved.revision, first.revision + 1);
  const context = await memoryTool(f, "learning_context", { scope: "course", all: true });
  assert.deepEqual(context.knowledge.convention, { text: "A denotes the matrix." });
  assert.equal(context.course_context, undefined);
});


test("workspace binding survives a changed process selection", async (t) => {
  const f = await fixture(t);
  const selected = process.env.STUDY_WORKSPACE;
  process.env.STUDY_WORKSPACE = join(selected, "uninitialized-other-course");
  const result = await f.extension.tools.get("learning_context").definition.execute("bound", {}, undefined, undefined, f.ctx);
  assert.equal(JSON.parse(result.content[0].text).workspace, selected);
});
