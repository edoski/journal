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

export const CLAUDE_MODEL_IDS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"] as const;
export type ClaudeModelId = (typeof CLAUDE_MODEL_IDS)[number];

export const CLAUDE_ROLE_DEFAULTS = { strong: "claude-opus-5-5", cheap: "claude-sonnet-5-5", vision: "claude-sonnet-5-5" } as const satisfies Record<"strong" | "cheap" | "vision", ClaudeModelId>;

export const CLAUDE_USAGE_URL = "https://claude.ai/settings/usage";
