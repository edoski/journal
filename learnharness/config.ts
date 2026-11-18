import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** App root (this file is at <app>/config.ts); its parent is the journal repository. */
export const ROOT = path.dirname(fileURLToPath(import.meta.url));

// node's test runner sets NODE_TEST_CONTEXT in every test-file child.
const TEST_SCRATCH =
	process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT !== undefined ? createTestScratch() : undefined;

function createTestScratch(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
	process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}

/**
 * THE data-location seam (the Electron contract, 2026-09-17): LH_DATA_DIR
 * relocates every MUTABLE record — chat sessions, jobs, settings — when set. The desktop shell points it at
 * userData so nothing is written inside the read-only .app bundle
 * (macOS translocation guarantees the bundle is read-only anyway).
 * Unset (plain web dev / repo work) it resolves to the repo's data/,
 * byte-for-byte as before, and in a test process to TEST_SCRATCH's.
 * Read-only assets (prompts) stay ROOT-anchored on purpose: they ship
 * inside the app bundle by design.
 */
const DATA_ROOT = process.env.LH_DATA_DIR
	? path.resolve(process.env.LH_DATA_DIR)
	: path.join(TEST_SCRATCH ?? ROOT, "data");

export const PATHS = {
	root: ROOT,
	/** Teacher system prompt — the agent's instructions (src/agent/). */
	teacherPrompt: path.join(ROOT, "src", "agent", "system-prompt.md"),
	data: DATA_ROOT,
	/** Chat sessions (AI SDK UIMessage transcripts, one JSON file per chat). */
	chats: path.join(DATA_ROOT, "chats"),
	/** Debug artifacts (env-gated): data/debug/provider-events/<chatId>.jsonl
	 * raw provider stream recordings (src/agent/provider-events.ts). */
	debug: path.join(DATA_ROOT, "debug"),
	/** The tutor skill's references in the learning engine beside this app
	 *  (<repository>/learning/skills/tutor/references), the teaching doctrine
	 *  both hosts compose. Read-only like the prompts: scripts/build-server.mjs
	 *  copies them beside the standalone server, so this path holds there too. */
	tutorReferences: path.join(path.dirname(ROOT), "learning", "skills", "tutor", "references"),
} as const;

/**
 * The learner's `learning` engine, which owns every course record a session
 * can link to. It is the sibling package in this app's repository, so the
 * default root is the app folder's parent and the interpreter its
 * `.venv/bin/python`. LH_LEARNING_ENGINE names another repository;
 * LH_LEARNING_PYTHON another interpreter that has its dependencies. When the
 * engine cannot run, no session can start: the composer names the reason and
 * these two settings.
 */
const LEARNING_ROOT = process.env.LH_LEARNING_ENGINE
	? path.resolve(process.env.LH_LEARNING_ENGINE)
	: path.dirname(ROOT);
export const LEARNING_ENGINE = {
	root: LEARNING_ROOT,
	python: process.env.LH_LEARNING_PYTHON || path.join(LEARNING_ROOT, ".venv", "bin", "python"),
} as const;

// ─── Models ────────────────────────────────────────────────────────────────
// Every agent runs Claude Opus 5.5 at high effort on one Claude account
// (owner, 2026-11-14; src/core/contracts/claude.ts CLAUDE_MODEL): there is
// no model choice anywhere. What remains here is the agent roles.

/** Every agent role in the app — the engine-injection key; every role
 *  runs the same engine (src/server/chat-handler.ts agentEngine). */
export type ModelRole =
	| "prober"
	| "teacher"
	| "researcher"
	| "demoBuilder"
	| "visualMaker"
	| "pdfReader";

/**
 * THE USER SETTINGS RECORD (settings-storage wave, 2026-09-19): one
 * versioned, DELTA-shaped JSON blob at the data-dir seam holding every
 * non-secret product preference — claude (the account every agent runs
 * on) and appearance. Explicit user choices only: ABSENT keys resolve to the
 * factory defaults compiled into src/core/settings.ts (FACTORY_SETTINGS), so
 * a software update that adds a knob (a new appearance field) needs no
 * migration — old records simply lack the new keys. The
 * version field is a PRIVATE schema counter for breaking shape changes
 * only (field renamed/meaning changed), unrelated to the app release
 * version. Secrets (login tokens) NEVER live here.
 */
export const SETTINGS_FILE = path.join(DATA_ROOT, "settings.json");

