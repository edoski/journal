/** Client-safe shapes for the Claude subscription provider. LearnHarness drives
 * the user's own signed-in Claude Code CLI and never holds a Claude credential. */
export const CLAUDE_SUBSCRIPTION = { providerId: "claude-subscription", label: "Claude" } as const;

export type ClaudeConnection =
	| { state: "connected"; email: string | null; plan: string | null }
	| { state: "signed-out" }
	/** Logged in some other way (Console or API key, Bedrock, Vertex): turns would not use the plan. */
	| { state: "not-subscription"; authMethod: string }
	| { state: "missing" }
	| { state: "error"; message: string };

/** Only Opus 5.5 is offered, by the owner's choice: every role runs on it. */
export const CLAUDE_MODEL_IDS = ["claude-opus-5-5"] as const;
export type ClaudeModelId = (typeof CLAUDE_MODEL_IDS)[number];

/** What "Use for all roles" writes to every model slot. */
export const CLAUDE_ROLE_DEFAULT = { id: "claude-opus-5-5", thinkingLevel: "high" } as const satisfies { id: ClaudeModelId; thinkingLevel: string };

export const CLAUDE_USAGE_URL = "https://claude.ai/settings/usage";
