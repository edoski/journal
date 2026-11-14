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
export * from "./ports.ts";

export * from "./question-core.ts";
// The event bus (push architecture, 2026-10-02): vocabulary + emit/subscribe
// for every layer; the browser shell consumes the types + the runtime names
// through this barrel (shell law: pure core via @/src/core only).
export * from "./events.ts";
export * from "./plan-tree.ts";
export * from "./phases.ts";
export * from "./pending.ts";
export * from "./prompt-segments.ts";
export * from "./math-delims.ts";
// Wave B (owner-approved 2026-09-26): the native record (LhMessage), the
// and the input-events contract — all
// pure logic, browser-safe.
export * from "./native-messages.ts";
export * from "./compaction.ts";
export * from "./input-events.ts";
// Wave D (owner-approved 2026-09-26): the client view model — the grouping
// canon (one continuous assistant document, step separators) ported from
// the deleted server projection to the client side. Pure, browser-safe.
export * from "./view.ts";
export * from "./tool-parts.ts";
export * from "./answer-presentation.ts";
export * from "./prices.ts";
export * from "./context-usage.ts";
export type { ChatGPTStatus, ChatGPTControlBridge } from "./contracts/chatgpt.ts";
export { CLAUDE_SUBSCRIPTION, CLAUDE_MODEL, CLAUDE_USAGE_URL, CLAUDE_LIMIT_TEXT, claudeProviderId, isClaudeProvider, isClaudeLimitFailure, nextClaudeAccount, soonestClaudeReset } from "./contracts/claude.ts";
export type { ClaudeAccount, ClaudeAccountStatus, ClaudeConnection, ClaudeUsage } from "./contracts/claude.ts";
export * from "./fuzzy.ts";
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
