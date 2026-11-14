/**
 * The grouping pass's lever: both steps on one course copy, or the approved
 * copy's arcs applied to the real course.
 *
 * A copy run, never on a registered real course and only under a sandbox HOME
 * for the engine:
 *
 *   npx tsx scripts/arc-pass.ts --workspace COPY --out RUN_DIR --engine-home SANDBOX_HOME \
 *     --account LABEL [--edges apply|propose] [--original REAL_WORKSPACE]
 *
 * writes edges.json, answer.json, patch.json, report.json, run.json and
 * transcript.jsonl into RUN_DIR. On a course he has studied the formation
 * needs words in `arc_change.asked`; a copy run's say what it is.
 *
 * Applying an approved copy run to the real course, with his words:
 *
 *   npx tsx scripts/arc-pass.ts --apply RUN_DIR --workspace REAL --approval "<his words>" \
 *     [--accept-edge TOPIC:NEED ...]
 *
 * refuses unless RUN_DIR proposes arcs for this course and its ledger has
 * none formed, backs up course.json as the migration does, re-derives the
 * formation on the real record (topics added since the copy are placed by
 * the engine), adds only the edge proposals he accepted, dry-runs and saves,
 * checks every topic both records hold sits in the copy's arc, and writes
 * the ledger `approved`.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { LEARNING_ENGINE } from "../config.ts";
import { againstCut, arcPassChanges, arcPassView, edgeChanges, edgeWords, type ArcSubmit, type EdgeDiff } from "../src/core/arc-pass.ts";
import { courseView, NO_STANDING } from "../src/core/course-map-build.ts";
import { createArcPass, type EdgeMode, type TranscriptEntry } from "../src/agent/subagents/arc-former.ts";
import { loadClaudeAccounts } from "../src/agent/claude-accounts.ts";
import { claudeEngine } from "../src/agent/models.ts";
import { arcPassLedgers, arcPassLedgersAt } from "../src/store/arc-pass-ledgers.ts";
import { createCourseRecords } from "../src/store/course-records.ts";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});

/** The words a copy run's formation carries in `asked`: no learner's words
 *  exist for a copy, so it says what it is instead. */
const COPY_ASKED = "copy run in a sandbox for review, not the learner's record: the real course gets these arcs only through --apply with his approval";

const { values } = parseArgs({
	options: {
		workspace: { type: "string" },
		out: { type: "string" },
		edges: { type: "string", default: "propose" },
		"engine-home": { type: "string" },
		"engine-vault": { type: "string" },
		account: { type: "string" },
		original: { type: "string" },
		apply: { type: "string" },
		approval: { type: "string" },
		"accept-edge": { type: "string", multiple: true, default: [] },
	},
});

const fail = (message: string): never => {
	console.error(`arc-pass: ${message}`);
	process.exit(1);
};
const write = (dir: string, name: string, value: unknown) => fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, "\t")}\n`);

/** The real registry's courses, read only, so a copy run can refuse them. */
function realCourses(): string[] {
	try {
		const registry = JSON.parse(fs.readFileSync(path.join(os.userInfo().homedir, "Library/Application Support/Learning/workspaces.json"), "utf-8")) as Json;
		return Object.keys(obj(registry.workspaces)).map((w) => path.resolve(w));
	} catch {
		return [];
	}
}

async function copyRun(): Promise<void> {
	const workspace = path.resolve(values.workspace ?? fail("--workspace names the course copy"));
	const out = path.resolve(values.out ?? fail("--out names the run's folder"));
	const engineHome = path.resolve(values["engine-home"] ?? fail("--engine-home names the sandbox HOME the engine runs under"));
	if (engineHome === path.resolve(os.userInfo().homedir)) fail("--engine-home is the real HOME; a copy run runs the engine under a sandbox HOME");
	if (realCourses().includes(workspace)) fail(`${workspace} is a registered real course; run on a copy`);
	const mode = values.edges as EdgeMode;
	if (mode !== "apply" && mode !== "propose") fail("--edges is apply or propose");
	const label = values.account ?? fail("--account names the Claude account (its T3 label or instance id)");
	const account = loadClaudeAccounts().find((a) => a.label === label || a.instanceId === label) ?? fail(`no Claude account ${label}`);
	const engine = claudeEngine(account.providerId);
	fs.mkdirSync(out, { recursive: true });
	const env = { ...process.env, HOME: engineHome, ...(values["engine-vault"] ? { VAULT_DIR: path.resolve(values["engine-vault"]) } : {}) };
	const courseRecords = createCourseRecords({ ...LEARNING_ENGINE, env, timeoutMs: 120_000 });
	const transcript = fs.createWriteStream(path.join(out, "transcript.jsonl"));
	const pass = createArcPass({ courseRecords, ledgers: arcPassLedgersAt(path.join(out, "ledger.json")), engine });
	const started = new Date().toISOString();
	const result = await pass.run(workspace, { edges: mode, asked: COPY_ASKED, transcript: (entry: TranscriptEntry) => transcript.write(`${JSON.stringify(entry)}\n`) });
	transcript.end();
	const shown = await courseRecords.run(workspace, { verb: "show", handles: "all" });
	const record = shown.ok ? obj(shown.json) : {};
	const topicArcs = Object.fromEntries(Object.entries(obj(record.topics)).flatMap(([k, t]) => (typeof obj(t).arc === "string" ? [[k, obj(t).arc as string]] : [])));
	const arcOrder = Array.isArray(obj(record.path).arcs) ? (obj(record.path).arcs as string[]) : [];
	if (result.edges) {
		const { mode, submit, diffs, applied, skipped } = result.edges;
		write(out, "edges.json", { mode, ...submit, diffs, applied, skipped, ...(mode === "propose" ? { against_cut: againstCut(diffs, topicArcs, arcOrder) } : {}) });
	}
	if (result.answer) write(out, "answer.json", result.answer);
	if (result.status === "formed") write(out, "patch.json", result.formation.changes);
	else if (result.status === "failed" && result.patch) write(out, "patch.json", result.patch);
	const arcs = await courseRecords.run(workspace, { verb: "arcs", report: true });
	write(out, "report.json", {
		status: result.status,
		...(result.status === "formed" ? { summary: result.summary, stripped: result.formation.stripped, placedByEngine: result.formation.placedByEngine } : { reason: result.reason }),
		...(arcs.ok ? { arcs: arcs.json } : { arcs_error: arcs.message }),
	});
	write(out, "run.json", {
		state: result.status === "formed" ? "proposed" : result.status,
		at: started,
		workspace,
		...(values.original ? { original: path.resolve(values.original) } : {}),
		edges: mode,
		revision: record.revision ?? null,
		topicArcs,
	});
	console.log(`${path.basename(workspace)}: ${result.status === "formed" ? result.summary : `${result.status}: ${result.reason}`}`);
}

/** The backup the migration makes, under the learning support folder. */
function backup(workspace: string): string {
	const file = path.join(workspace, ".study", "course.json");
	const key = `${path.basename(workspace)}-${createHash("sha1").update(path.resolve(workspace)).digest("hex").slice(0, 8)}`;
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
	const folder = path.join(os.homedir(), "Library/Application Support/Learning/backups", `arc-pass-${stamp}`, key);
	fs.mkdirSync(folder, { recursive: true });
	fs.copyFileSync(file, path.join(folder, "course.json"));
	fs.writeFileSync(path.join(folder, "origin.json"), `${JSON.stringify({ record: path.resolve(file) })}\n`);
	return folder;
}

async function apply(): Promise<void> {
	const runDir = path.resolve(values.apply!);
	const workspace = path.resolve(values.workspace ?? fail("--workspace names the real course"));
	const approval = values.approval?.trim() || fail("--approval quotes his words approving these arcs");
	const run = obj(JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf-8")));
	if (run.state !== "proposed") fail(`${runDir} proposes no arcs (its state is ${String(run.state)})`);
	if (run.original !== workspace) fail(`${runDir} is a copy of ${String(run.original ?? "no named course")}, not ${workspace}`);
	const ledger = arcPassLedgers.get(workspace);
	if (ledger && (ledger.state === "approved" || ledger.state === "formed")) fail(`${workspace} has its arcs already (${ledger.state} on ${ledger.at})`);
	const answer = JSON.parse(fs.readFileSync(path.join(runDir, "answer.json"), "utf-8")) as ArcSubmit;
	const edges = obj(JSON.parse(fs.readFileSync(path.join(runDir, "edges.json"), "utf-8")));
	const proposed = (Array.isArray(edges.diffs) ? edges.diffs : []) as EdgeDiff[];
	const accepted = values["accept-edge"]!.map((pair) => {
		const [topic, need] = pair.split(":");
		return proposed.find((d) => d.topic === topic && d.need === need) ?? fail(`--accept-edge ${pair} is no edge ${runDir} proposes`);
	});
	const courseRecords = createCourseRecords({ ...LEARNING_ENGINE, timeoutMs: 120_000 });
	const shown = await courseRecords.run(workspace, { verb: "show", handles: "all" });
	if (!shown.ok) fail(`the course record: ${shown.message}`);
	const record = obj(shown.ok ? shown.json : {});
	if (Object.keys(obj(record.arcs)).length > 0) fail(`${workspace} has arcs already`);
	const view = arcPassView(courseView(record, NO_STANDING), record);
	const settled = accepted.length > 0 ? edgeChanges(accepted, view) : null;
	const day = new Date().toISOString().slice(0, 10);
	const formation = arcPassChanges(answer, view, { edges: edgeWords(settled?.applied ?? []), asked: approval, reason: `approved by Edo on ${day}: ${approval}` }) ?? fail(`${runDir} forms no arcs`);
	const topics = obj(formation.changes.topics);
	for (const [k, t] of Object.entries(obj(settled?.changes.topics))) topics[k] = { ...obj(topics[k]), ...obj(t) };
	const changes = { ...formation.changes, topics };
	const checked = await courseRecords.run(workspace, { verb: "check", changes });
	if (!checked.ok) fail(`the engine refuses the arcs: ${checked.message}`);
	const folder = backup(workspace);
	console.log(`backed up ${workspace} to ${folder}`);
	const saved = await courseRecords.run(workspace, { verb: "save", changes });
	if (!saved.ok) fail(`the save was refused: ${saved.message}`);
	const after = await courseRecords.run(workspace, { verb: "show", handles: "all" });
	const now = obj(after.ok ? after.json : {});
	const copy = obj(run.topicArcs);
	const moved = Object.entries(obj(now.topics)).filter(([k, t]) => k in copy && obj(t).arc !== copy[k]);
	const report = await courseRecords.run(workspace, { verb: "arcs", report: true });
	write(runDir, "applied.json", { at: new Date().toISOString(), workspace, approval, accepted, backup: folder, report: report.ok ? obj(report.json).report : report.message, moved: moved.map(([k]) => k) });
	arcPassLedgers.save(workspace, { state: "approved", at: new Date().toISOString(), topics: Object.keys(obj(now.topics)).length, revision: Number(now.revision), run: runDir, approval });
	if (moved.length > 0) fail(`saved, but these topics sit in another arc than in the copy: ${moved.map(([k]) => k).join(", ")}`);
	console.log(`${path.basename(workspace)}: arcs formed as approved; report in ${path.join(runDir, "applied.json")}`);
}

await (values.apply ? apply() : copyRun());
