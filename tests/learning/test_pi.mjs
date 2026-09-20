/** Deterministic Pi adapter checks. Run with `node --test tests/learning/test_pi.mjs`. */
import assert from "node:assert/strict";
import childProcess, { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

async function fixture(t, { open = false, throwOnOpen = false, beforePublish } = {}) {
  const root = realpathSync(await mkdtemp(join(tmpdir(), "learning-pi-unit-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = { ...process.env };
  Object.assign(process.env, {
    LEARNING_ROOT: root,
    LEARNING_PACKAGE: repository,
    LEARNING_PYTHON: join(repository, ".venv/bin/python"),
    LEARNING_OPEN: open ? "1" : "0",
    VAULT_DIR: join(root, "vault"),
    LEARNING_ASSETS: join(root, "assets"),
  });
  t.after(() => {
    for (const key of ["LEARNING_ROOT", "LEARNING_PACKAGE", "LEARNING_PYTHON", "LEARNING_OPEN", "VAULT_DIR", "LEARNING_ASSETS"]) {
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
  const path = join(root, "sessions", `${id}.md`);
  return { ctx, branch, errors, openings, emit, append, complete, path, extension, runtime: loaded.runtime, activeTools: () => activeTools };
}

const assistant = (text) => ({ role: "assistant", content: [{ type: "text", text }] });
const params = {
  question: "How many solutions does this consistent singular system have?",
  context: "$Ax=b$, with two identical equations.",
  choices: [{ id: "none", label: "None" }, { id: "many", label: "Infinitely many" }],
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
  assert.ok(original.endsWith("\n\n---\n"));
  assert.doesNotMatch(original, /USER PROMPT|## You|## Tutor/);
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
  assert.equal(empty.vault, process.env.VAULT_DIR);
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
  const path = join(process.env.LEARNING_ROOT, "state/course.json");
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

test("memory bookkeeping stays out of the lesson and terminal while errors remain visible", async (t) => {
  const f = await fixture(t);
  for (const name of ["learning_context", "learning_save"]) {
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
  const root = process.env.LEARNING_ROOT;
  await assert.rejects(readFile(join(root, "index.md")), { code: "ENOENT" });
  const actualId = randomUUID();
  f.ctx.sessionManager.getSessionId = () => actualId;
  await f.complete({ role: "user", content: "Continue SMM" });
  await f.complete({ role: "assistant", content: [{ type: "toolCall", name: "read" }] });
  await assert.rejects(readFile(join(root, "sessions", `${actualId}.md`)), { code: "ENOENT" });
  await f.complete(assistant("Here is the next explanation."));
  assert.match(await readFile(join(root, "sessions", `${actualId}.md`), "utf8"), /next explanation/);
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
  const root = process.env.LEARNING_ROOT;
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
  const path = join(root, "sessions", `${manager.getSessionId()}.md`);
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


test("terminal hides duplicate teaching by default but exposes it if publication fails", async (t) => {
  const f = await fixture(t);
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
    const f = await fixture(t, { open: true, throwOnOpen: failure === "synchronous spawn error" });
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
  const f = await fixture(t, { open: true });
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
  assert.ok((await readFile(f.path, "utf8")).startsWith(beforeFailure.trimEnd()));
});

test("open failure during the next publication reveals its already-hidden pending teaching", async (t) => {
  let publications = 0;
  const f = await fixture(t, { open: true, beforePublish: (openings) => {
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
    const f = await fixture(t, { open: true });
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
  const f = await fixture(t, { open: true });
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
