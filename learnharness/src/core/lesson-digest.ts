/**
 * The lesson digest's pure core. When a lesson finishes, a background agent
 * reads what it taught and fills what the tutor's live saves left out of
 * the course record: topic gaps and notes, topics taught but never marked
 * introduced, course knowledge, and where the open task stopped. This file
 * decides which part of the session the digest reads and turns the agent's
 * answer into one engine `save` patch.
 *
 * The patch only merges by handle and never carries observations: graded
 * answers are saved live, and a second copy would count twice.
 */

import { createHash } from "node:crypto";
import type { ChatRecord, DigestLedger } from "./contracts/chat.ts";
import type { PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh } from "./contracts/plan.ts";
import { sessionMarkdown } from "./session-markdown.ts";
import { sessionModeOf, type LhMessage } from "./native-messages.ts";
import { sessionEndOf } from "./session-end.ts";
import { CLAUDE_ROLE_DEFAULT, claudeProviderId, isClaudeProvider } from "./contracts/claude.ts";

/** The digest's model: Opus 5.5 at high effort, like every agent, on the
 *  Claude account the lesson ran on, or the default account when the
 *  lesson ran elsewhere. */
export function digestModel(lessonProvider: string | undefined): { provider: string; id: string; thinkingLevel: "high" } {
	return {
		provider: lessonProvider && isClaudeProvider(lessonProvider) ? lessonProvider : claudeProviderId(null),
		id: CLAUDE_ROLE_DEFAULT.id,
		thinkingLevel: CLAUDE_ROLE_DEFAULT.thinkingLevel,
	};
}

/** The part of a session one digest reads. */
export interface DigestWindow {
	/** Messages an earlier digest already read: context only. */
	context: LhMessage[];
	/** Messages this digest carries into the record. */
	fresh: LhMessage[];
	fingerprint: string;
	throughMessageId: string;
}

/** The messages after the last finished digest, or null when they show the
 *  learner nothing new or that exact stretch was already digested. Pure. */
export function digestWindow(messages: readonly LhMessage[], ledger: DigestLedger | undefined): DigestWindow | null {
	const last = ledger?.done.at(-1);
	const cut = last ? messages.findIndex((m) => m.id === last.throughMessageId) + 1 : 0;
	const context = messages.slice(0, cut);
	const fresh = messages.slice(cut);
	if (fresh.length === 0 || sessionMarkdown(fresh, { anchors: false }).trim() === "") return null;
	const fingerprint = createHash("sha256")
		.update(JSON.stringify(fresh.map((m) => [m.id, m.role, "content" in m ? m.content : null])))
		.digest("hex");
	if (ledger?.done.some((d) => d.fingerprint === fingerprint)) return null;
	return { context, fresh, fingerprint, throughMessageId: fresh.at(-1)!.id };
}

/** Whether a session is a lesson the digest reads: it studies a course and
 *  teaches (practice sessions write nothing, as for the graph). */
export function digestible(record: ChatRecord): boolean {
	return !!record.course && sessionModeOf(record.messages, record.kind) !== "practice";
}

/** The lesson finished: the tutor's last turn left the session closed. */
export function lessonFinished(record: ChatRecord): boolean {
	return digestible(record) && sessionEndOf(record.messages, record.tree, record.kind) === "closed";
}

/** The lesson stopped partway, waiting on the learner. */
export function lessonLeftMidway(record: ChatRecord): boolean {
	return digestible(record) && sessionEndOf(record.messages, record.tree, record.kind) === "mid-lesson";
}

/** Every plan step was reached: the lesson's plan has nothing left. */
export function planFinished(tree: PlanTree | undefined, messages: readonly LhMessage[]): boolean {
	if (!tree || tree.nodes.length === 0) return false;
	const { current, visited } = derivePlanStatusesLh(tree, messages);
	return tree.nodes.every((node) => node.id === current || visited.has(node.id));
}

// ─── the agent's answer ──────────────────────────────────────────────────────

export interface DigestTopic {
	handle: string;
	/** Required for a topic the course does not have yet. */
	title?: string;
	needs?: string[];
	introduced?: boolean;
	/** A testable misconception; null once the lesson showed it resolved. */
	gap?: string | null;
	note?: string;
}

export interface DigestSubmit {
	topics: DigestTopic[];
	knowledge: { text: string; topics: string[] }[];
	task?: { key: string; step?: string; help?: string; finished?: boolean };
	/** The topic the course path should stand on next. */
	current?: string;
}

/** What the course record holds that the patch is checked against. */
export interface DigestCourseView {
	/** Every course topic in path order, with its judged fields. */
	topics: ReadonlyArray<{ handle: string; title: string; introduced: boolean; gap: string | null; note: string | null }>;
	/** The topic the course path stands on. */
	current: string | null;
	/** The open tasks this session holds. */
	tasks: readonly string[];
	/** Whether the lesson's plan has nothing left. */
	planFinished: boolean;
}

const HANDLE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const validHandle = (h: string): boolean => HANDLE.test(h) && !/^o\d+$/.test(h);

/** A knowledge entry's handle, from its text alone, so a repeated digest
 *  merges into the same entry instead of adding one. */
export function knowledgeHandle(text: string): string {
	const slug = text
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/, "");
	const hash = createHash("sha256").update(text.trim()).digest("hex").slice(0, 6);
	return `${slug || "k"}-${hash}`;
}

/** The engine patch for an answer, and one line saying what it changes;
 *  null when it changes nothing. A topic the course lacks is created only
 *  with a title, and takes its place in the path right after its last
 *  prerequisite. Pure. */
export function digestChanges(submit: DigestSubmit, view: DigestCourseView): { changes: Record<string, unknown>; summary: string } | null {
	const known = new Map(view.topics.map((t) => [t.handle, t]));
	const order = view.topics.map((t) => t.handle);
	const created = new Set(
		submit.topics.filter((t) => validHandle(t.handle) && !known.has(t.handle) && t.title?.trim()).map((t) => t.handle),
	);
	const exists = (h: string) => known.has(h) || created.has(h);
	const said: string[] = [];
	const topics: Record<string, Record<string, unknown>> = {};
	for (const t of submit.topics) {
		if (!exists(t.handle)) continue;
		const current = known.get(t.handle);
		const patch: Record<string, unknown> = {};
		if (!current) {
			if (topics[t.handle]) continue;
			const needs = (t.needs ?? []).filter((n) => n !== t.handle && exists(n));
			Object.assign(patch, { title: t.title!.trim(), introduced: true, ...(needs.length > 0 ? { needs } : {}) });
			order.splice(Math.max(-1, ...needs.map((n) => order.indexOf(n))) + 1, 0, t.handle);
			said.push(`new topic ${t.handle}`);
		} else if (t.introduced === true && !current.introduced) {
			patch.introduced = true;
			said.push(`introduced ${t.handle}`);
		}
		const gap = typeof t.gap === "string" ? t.gap.trim() || undefined : t.gap;
		if (typeof gap === "string" && gap !== current?.gap) {
			patch.gap = gap;
			said.push(`gap on ${t.handle}`);
		} else if (gap === null && current?.gap) {
			patch.gap = null;
			said.push(`gap resolved on ${t.handle}`);
		}
		const note = t.note?.trim();
		if (note && note !== current?.note) {
			patch.note = note;
			said.push(`note on ${t.handle}`);
		}
		if (Object.keys(patch).length > 0) topics[t.handle] = { ...topics[t.handle], ...patch };
	}
	const knowledge: Record<string, Record<string, unknown>> = {};
	for (const k of submit.knowledge) {
		const text = k.text.trim();
		if (!text) continue;
		const linked = k.topics.filter(exists);
		knowledge[knowledgeHandle(text)] = { text, ...(linked.length > 0 ? { topics: linked } : {}) };
	}
	const facts = Object.keys(knowledge).length;
	if (facts > 0) said.push(`${facts} knowledge ${facts === 1 ? "entry" : "entries"}`);
	const changes: Record<string, unknown> = {};
	if (Object.keys(topics).length > 0) changes.topics = topics;
	if (facts > 0) changes.knowledge = knowledge;
	const task = submit.task;
	if (task && view.tasks.includes(task.key)) {
		const step = task.step?.trim();
		const help = task.help?.trim();
		if (task.finished && view.planFinished) {
			changes.tasks = { [task.key]: null };
			said.push(`task ${task.key} finished`);
		} else if (step || help) {
			changes.tasks = { [task.key]: { ...(step ? { step } : {}), ...(help ? { help } : {}) } };
			said.push(`task ${task.key} step`);
		}
	}
	const path: Record<string, unknown> = {};
	if (submit.current && submit.current !== view.current && exists(submit.current)) {
		path.current = submit.current;
		said.push(`path at ${submit.current}`);
	}
	if (created.size > 0) path.order = order;
	if (Object.keys(path).length > 0) changes.path = path;
	if (Object.keys(changes).length === 0) return null;
	return { changes, summary: said.join("; ") };
}
