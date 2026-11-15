import { PLAN_MAP_CAP, type PlanEdge, type PlanNode, type PlanTree } from "./contracts.ts";

/**
 * Pure, validated plan-tree operations (vision §2 "the formal plan tree").
 *
 * Every function takes a tree and returns a NEW tree — never mutates its
 * input. All validation throws PlanTreeError with a message written for the
 * agent (it flows straight back as a tool-result error), stating exactly what
 * is wrong and which id/edge is at fault.
 *
 * Invariants enforced everywhere:
 * - Node ids are unique and non-empty; every edge endpoint references an
 *   existing node.
 * - The structure is a DAG: no self-loops, no duplicate edges, no cycles.
 * - `version` increments on every successful STATE-CHANGING op. True no-ops
 *   (setCurrent to the already-current node, markDone of an already-done
 *   node) return the input tree unchanged — version drives UI re-animation,
 *   so a non-change must not tick it. createTree always starts at version 1.
 */

/** Error thrown by every op on invalid input. Message is agent-readable. */
export class PlanTreeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PlanTreeError";
	}
}

/** An empty, never-stored tree used as the seed before plan_init runs. */
export function emptyTree(): PlanTree {
	return { nodes: [], edges: [], version: 0 };
}

// ─── validation helpers ──────────────────────────────────────────────────────

function assertValidNode(node: PlanNode): void {
	if (!node || typeof node.id !== "string" || node.id.trim() === "") {
		throw new PlanTreeError("Every node needs a non-empty `id` (a stable slug like 'chain-rule-intuition').");
	}
	if (typeof node.title !== "string" || node.title.trim() === "") {
		throw new PlanTreeError(`Node "${node.id}" needs a non-empty \`title\`.`);
	}
}

function nodeMap(nodes: PlanNode[]): Map<string, PlanNode> {
	const map = new Map<string, PlanNode>();
	for (const node of nodes) {
		assertValidNode(node);
		if (map.has(node.id)) {
			throw new PlanTreeError(`Duplicate node id "${node.id}" — node ids must be unique.`);
		}
		map.set(node.id, node);
	}
	return map;
}

function requireNode(map: Map<string, PlanNode>, id: string, what: string): void {
	if (!map.has(id)) {
		throw new PlanTreeError(`${what} references unknown node id "${id}" — it is not in the tree.`);
	}
}

function edgeKey(from: string, to: string): string {
	return `${from}\u0000${to}`;
}

/**
 * Would adding edge from→to create a cycle? Walk forward from `to` along
 * existing edges; if we can reach `from`, the new edge closes a loop.
 */
function createsCycle(edges: PlanEdge[], from: string, to: string): boolean {
	const adjacency = new Map<string, string[]>();
	for (const e of edges) {
		const list = adjacency.get(e.from);
		if (list) list.push(e.to);
		else adjacency.set(e.from, [e.to]);
	}
	const stack = [to];
	const seen = new Set<string>();
	while (stack.length > 0) {
		const current = stack.pop()!;
		if (current === from) return true;
		if (seen.has(current)) continue;
		seen.add(current);
		for (const next of adjacency.get(current) ?? []) stack.push(next);
	}
	return false;
}

/** Full edge validation against existing nodes/edges: endpoints exist, no self-loop, no duplicate, acyclic. */
function assertValidEdge(from: string, to: string, nodes: PlanNode[], existingEdges: PlanEdge[]): void {
	const map = nodeMap(nodes); // also re-validates nodes on createTree
	requireNode(map, from, "Edge `from`");
	requireNode(map, to, "Edge `to`");
	if (from === to) {
		throw new PlanTreeError(`Edge "${from}" → "${to}" is a self-loop — a node can't require itself.`);
	}
	if (existingEdges.some((e) => e.from === from && e.to === to)) {
		throw new PlanTreeError(`Edge "${from}" → "${to}" already exists — duplicate edges are not allowed.`);
	}
	if (createsCycle(existingEdges, from, to)) {
		throw new PlanTreeError(
			`Edge "${from}" → "${to}" would create a cycle: "${to}" already leads (directly or transitively) back to "${from}". ` +
				`"from" must be understood before "to" — the tree is a DAG.`,
		);
	}
}

// ─── ops ─────────────────────────────────────────────────────────────────────

/** Build a fresh tree (version 1) from node and edge lists, validating all invariants. */
export function createTree(nodes: PlanNode[], edges: PlanEdge[]): PlanTree {
	const map = nodeMap(nodes);
	for (const e of edges) {
		requireNode(map, e.from, "Edge `from`");
		requireNode(map, e.to, "Edge `to`");
	}
	const accepted: PlanEdge[] = [];
	for (const e of edges) {
		// Each edge is checked against the ones already accepted, so any
		// violation names the culprit edge.
		assertValidEdge(e.from, e.to, nodes, accepted);
		accepted.push({ from: e.from, to: e.to });
	}
	return { nodes: nodes.map((n) => ({ ...n })), edges: accepted, version: 1 };
}

/** The longest chain of steps in a plan, counted in steps: the rows its
 *  map takes. A tree from createTree is acyclic. */
export function planDepth(tree: Pick<PlanTree, "nodes" | "edges">): number {
	const above = new Map<string, string[]>(tree.nodes.map((n) => [n.id, []]));
	for (const e of tree.edges) above.get(e.to)?.push(e.from);
	const memo = new Map<string, number>();
	const depth = (id: string): number => {
		const known = memo.get(id);
		if (known !== undefined) return known;
		const value = 1 + Math.max(0, ...(above.get(id) ?? []).map(depth));
		memo.set(id, value);
		return value;
	};
	return Math.max(0, ...tree.nodes.map((n) => depth(n.id)));
}

/** What makes a plan too big for one screen of his lesson map
 *  (`PLAN_MAP_CAP`), as words the tutor can act on, or null when it fits. */
export function planMapTooBig(tree: Pick<PlanTree, "nodes" | "edges">): string | null {
	const steps = tree.nodes.length;
	const deep = planDepth(tree);
	const over = [
		steps > PLAN_MAP_CAP.steps ? `${steps} steps where ${PLAN_MAP_CAP.steps} fit` : null,
		deep > PLAN_MAP_CAP.deep ? `a chain ${deep} steps long where ${PLAN_MAP_CAP.deep} fit` : null,
	].filter((x): x is string => x !== null);
	if (over.length === 0) return null;
	return (
		`This map does not fit his lesson map on one screen: ${over.join(", and ")}. ` +
		"Each step is one idea. Prune steps he already holds (the probe shows them), or split the lesson: " +
		"map the part that reaches the first goal he can use, and leave the rest for the next lesson."
	);
}

/** A relation between two things, in plain text or TeX: a title holding
 *  one states a result rather than naming an idea. */
const RELATION = /[=≠≈≡∼≃≅∝→↦⇒⟹⇔⟺≤≥<>∈⊂⊆~]|->|\\(?:to|rightarrow|Rightarrow|longrightarrow|Longrightarrow|implies|iff|Leftrightarrow|mapsto|leq?|geq?|neq?|approx|sim|simeq|cong|equiv|propto|in|subset|subseteq|lt|gt)(?![A-Za-z])/;

/** A condition or a law in words: a title holding one states when
 *  something holds rather than naming the question (round 9: "Pivots in
 *  every column" above the question asking what the echelon form must
 *  look like). */
const CONDITION = /\b(?:every|always|never|whenever|exactly when|only when|only if|if and only if|iff|precisely when|necessary and sufficient)\b/i;

/** The roadmap shows every title before its step is taught, so a title that
 *  states its step's result shows him the answer to the question on screen.
 *  Returns words the tutor can act on, or null when every title names an idea. */
export function planTitlesGiveAway(tree: Pick<PlanTree, "nodes">): string | null {
	const spoilers = tree.nodes.filter((n) => RELATION.test(n.title) || CONDITION.test(n.title)).map((n) => JSON.stringify(n.title));
	if (spoilers.length === 0) return null;
	return (
		`These titles state their step's result: ${spoilers.join(", ")}. ` +
		"He sees every title before the step is taught, so a title names what the step teaches, never its result, formula or condition: " +
		"\"The no-event case\", not \"P(no event) = e^{-λ}\"; \"What the echelon form needs\", not \"Pivots in every column\"."
	);
}

/** A step named after the lesson itself: its topic's handle as the id, or
 *  the lesson's title as its title, alone or before a colon, comma or dash.
 *  A step that only starts with the title's words names a part of it
 *  ("Poisson distribution as a limit of the binomial"). The whole map is the topic, so
 *  such a step repeats it (round 8: "Invertible matrices: test and compute"
 *  closed the Invertible matrices map). Words the tutor can act on, or null. */
export function planStepIsTheTopic(tree: Pick<PlanTree, "nodes">, lesson: { topic?: string; titles: readonly string[] }): string | null {
	const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
	const spaced = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
	const titles = lesson.titles.filter((t) => norm(t).length > 0);
	const isTheLesson = (step: string, title: string) => norm(step) === norm(title) || (spaced(step).startsWith(spaced(title)) && /^\s*[:,;\u2013\u2014-]/.test(spaced(step).slice(spaced(title).length)));
	const named = tree.nodes.filter((n) => (lesson.topic && n.id === lesson.topic) || titles.some((t) => isTheLesson(n.title, t)));
	if (named.length === 0) return null;
	return (
		`These steps are the lesson itself: ${named.map((n) => JSON.stringify(n.title)).join(", ")}. ` +
		"The whole map is the topic, so leave such a step out: the map ends at the last step he reaches."
	);
}

// The per-node mutation ops (addNode/updateNode/removeNode/addEdge/removeEdge/
// setCurrent/markDone) were deleted with the author-once protocol
// (2026-09-03) and their dead exports removed with the 2026-09-11 pivot: the
// tree carries structure ONLY — no progress fields exist to mutate
// (docs/probe-teach-split.md §3). Restructuring is a plan_init rewrite.
