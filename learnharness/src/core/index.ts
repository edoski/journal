/**
 * THE CORE PUBLIC API — the only module the shell (app/, components/) may
 * import. Everything exported here is browser-safe: pure logic + types,
 * no node builtins, no fs, no network.
 *
 * Server-side surfaces (chat streaming, store reads) live behind
 * src/server's barrel instead — the import law (eslint.config.mjs):
 *
 *   components/**  →  "@/src/core"        (this barrel, ONLY)
 *   app/**         →  "@/src/core" + "@/src/server"
 *
 * The storage PORT TYPES are types-only and browser-safe, hence re-exported.
 */

export * from "./contracts.ts";
// moved-words.ts: why a told day moved, the words every surface says (pure).
export * from "./moved-words.ts";
export * from "./ports.ts";

export * from "./question-core.ts";
// The event bus (push architecture, 2026-10-02): vocabulary + emit/subscribe
// for every layer; the browser shell consumes the types + the runtime names
// through this barrel (shell law: pure core via @/src/core only).
export * from "./events.ts";
export * from "./plan-tree.ts";
export * from "./lesson-place.ts";
export * from "./session-opening.ts";
export * from "./phases.ts";
export * from "./pending.ts";
export * from "./prompt-segments.ts";
export * from "./math-delims.ts";
// Wave B (owner-approved 2026-09-26): the native record (LhMessage), the
// and the input-events contract — all
// pure logic, browser-safe.
export * from "./native-messages.ts";
export * from "./compaction.ts";
export * from "./sdk-session.ts";
export * from "./input-events.ts";
// photos.ts: photos of his handwritten working (pure, browser-safe).
export * from "./photos.ts";
// Wave D (owner-approved 2026-09-26): the client view model — the grouping
// canon (one continuous assistant document, step separators) ported from
// the deleted server projection to the client side. Pure, browser-safe.
export * from "./view.ts";
export * from "./tool-parts.ts";
export * from "./answer-presentation.ts";
export * from "./answer-marks.ts";
export { closedTonight, doneTonightAtEnd, leftQuestionRepose } from "./session-end.ts";
export { replyCutOf, replyNeverCame } from "./turn-cut.ts";
export { sameQuestionKey } from "./shown-help.ts";
export { CLAUDE_SUBSCRIPTION, CLAUDE_MODEL, CLAUDE_USAGE_URL, CLAUDE_LIMIT_TEXT, CLAUDE_ACCOUNT_SIGNED_OUT, CLAUDE_SIGNED_OUT_STARTS, claudeProviderId, isClaudeProvider, isClaudeLimitFailure, nextClaudeAccount, soonestClaudeReset } from "./contracts/claude.ts";
export type { ClaudeAccount, ClaudeAccountStatus, ClaudeConnection, ClaudeUsage } from "./contracts/claude.ts";
// course-context.ts: a course's context sorted from its record (pure).
export * from "./course-context.ts";
// settings.ts + settings-resolution.ts (settings-storage wave, 2026-09-19):
// the user-settings record's shape/sanitizer (pure) and its fully-resolved
// view. Browser-safe — the Wave-4 panel imports these directly.
export * from "./settings.ts";
export * from "./settings-resolution.ts";
export * from "./session-find.ts";
export * from "./session-navigation.ts";
// keyboard.ts: the shortcut registry + binding normalization (pure, browser-safe).
export * from "./keyboard.ts";
// spatial-nav.ts: which target an arrow key moves to, from screen boxes (pure).
export * from "./spatial-nav.ts";
// session-markdown.ts: the session→markdown formatter behind the export.
// Pure, browser-safe.
export * from "./session-markdown.ts";
// demo-frame.ts: the base every demo runs on, and its controls' contrast check (pure).
export * from "./demo-frame.ts";
