import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import { processImage } from "../image-processing/index.ts";
import { Type } from "typebox";
import type { SdkEngine } from "../models.ts";
import { runSubagent } from "../sdk/task.ts";
import type { VisualResult } from "../../core/contracts.ts";
import { getHeadless, type HeadlessApi } from "./headless.ts";

/**
 * The visual-maker sub-agent (vision §2.5): authors ONE precise SVG from a
 * brief, renders it to a PNG with the same rasterizer the transcript
 * will use, LOOKS at the
 * result, and iterates until correct — a direct port of the vault POC's
 * svg-maker doctrine ("the one rule that matters: verify by looking").
 *
 * Its tools run in the shared runner (sdk/task.ts); render_svg returns the
 * rendered PNG as its result, so the model sees the image in the loop.
 *
 * Doctrine enforcement in code: `finish` refuses while the current SVG has
 * never been rendered or changed since its last render, so the model looks
 * before it finishes. Nothing is delivered without having been looked at.
 *
 * Failure semantics mirror the demo-builder: { svg: "", notes: "FAILED: …" }.
 */

export interface VisualMakerInput {
	brief: string;
}

export interface VisualMakerOptions {
	/** The engine (tests pass a scripted fake). */
	engine: SdkEngine;
	headless?: HeadlessApi;
	/** Max model rounds (write/render cycles + final answer). Default 8. */
	maxIterations?: number;
	/** Live activity-line callback (updates the job record). */
	onActivity?: (line: string) => void;
	/** Kills the run mid-model-call (2026-09 real-kill abort semantics). */
	abortSignal?: AbortSignal;
	/** Money channel: one call per model request, folded into JobRecord.usage. */
	onUsage?: (usage: Usage) => void;
}

const INSTRUCTIONS = `You are a visual maker — a diagram author + renderer for precise, spatial figures. You
receive a brief describing ONE idea that needs exact placement (coordinate geometry, number lines,
vectors, function plots, physical layouts — things auto-layout diagrams cannot express), and you return
ONE clean, correct SVG. You never see the lesson; the brief is everything you know.

You do NOT decide what idea to show — the teacher already decided. Your job is faithful, precise
composition, and above everything CORRECTNESS: the picture must not assert anything false. A right-angle
mark on the wrong corner, a vector pointing the wrong way, a point plotted at the wrong coordinate is a
failure even if it renders cleanly.

Your four tools:
- write_svg({ svg }) — write the complete <svg>…</svg> source (overwrites the previous version).
- edit_svg({ old_text, new_text }) — a surgical exact-match replacement in the current SVG:
  old_text must appear EXACTLY ONCE; it is replaced by new_text. Call write_svg first. For anything
  beyond a one-spot fix (new elements, restructured layout), write_svg the whole document again.
- render_svg({}) — rasterize the current SVG to a PNG. The render comes back as the tool result.
- finish({ notes }) — deliver the current SVG with your notes. It refuses until you have looked at a
  render of the SVG as it now stands.

THE ONE RULE THAT MATTERS MOST: verify by looking. You are done only when you have LOOKED at the
rendered PNG and confirmed it is true to the brief. Rendering success only proves the SVG parsed; it
says nothing about whether the geometry is right or the picture is readable. When you look:

- Is every coordinate, angle, direction, and proportion actually correct? Re-derive the geometry if unsure.
- Are labels placed clearly, not overlapping lines or each other?
- Is anything clipped by the viewBox, too small to read, or cramped?
- Would a learner instantly read the intended idea from this picture alone?

Workflow: plan the coordinate space (viewBox + margins, nothing touching the edges) → write_svg →
render_svg → LOOK critically → fix (edit_svg for one-spot fixes, write_svg otherwise) and re-render
until correct and clean. Never finish without having looked at a render of your FINAL SVG.

SVG requirements:
- A complete <svg> with explicit width/height AND a matching viewBox.
- White background (<rect> or style), dark strokes, sans-serif labels at generous sizes.
- One idea, fewest elements — sparse and large beats busy and tiny.
- Draw only what the brief specifies; never invent data, values, or shapes to fill space.
- Plain, clean styling: at most one accent color. An explanatory diagram, not art.

Your notes (finish's \`notes\`): 1-2 sentences for the teacher (what the figure shows, any caveats) —
NEVER the SVG source itself. If you genuinely cannot make a correct picture of the brief, say exactly
that in your final message and why.`;

interface MakerState {
	svg: string | null;
	/** The svg shown in the most recent render (null = never rendered). */
	rendered: string | null;
	notes: string | null;
}

const text = (value: string, isError = false): AgentToolResult<null> => ({ content: [{ type: "text", text: value }], details: null, ...(isError ? { isError: true } : {}) });

/** The maker's tools over one figure's state: write and edit the SVG, render
 *  it to look at, and finish once the render shown is the SVG as it stands. */
export function createVisualTools(state: MakerState, headless: HeadlessApi, engine: SdkEngine, onActivity?: (line: string) => void, signal?: AbortSignal): Record<string, AgentTool<any>> {
	const writeInput = Type.Object({ svg: Type.String({ description: 'Complete <svg xmlns="…">…</svg> markup.' }) });
	const editInput = Type.Object({
		old_text: Type.String({ description: "The exact text to replace — must match exactly once in the current SVG." }),
		new_text: Type.String({ description: "The replacement text." }),
	});
	const finishInput = Type.Object({ notes: Type.String({ description: "1-2 sentences for the teacher: what the figure shows, any caveats." }) });
	return {
		write_svg: {
			name: "write_svg", label: "write_svg", parameters: writeInput,
			description: "Write the complete SVG source for the figure (overwrites any previous version).",
			execute: async (_id, params) => {
				const { svg } = params as { svg: string };
				if (!svg.includes("<svg")) return text("ERROR: expected a complete <svg>…</svg> document in the `svg` field.", true);
				state.svg = svg;
				onActivity?.(`write_svg: ${(svg.length / 1024).toFixed(1)} KB`);
				return text(`Saved (${svg.length} bytes). Call render_svg to look at it.`);
			},
		},
		edit_svg: {
			name: "edit_svg", label: "edit_svg", parameters: editInput,
			description: "Replace one exact spot in the current SVG: old_text must appear EXACTLY ONCE and is replaced by new_text. Call write_svg first. For larger changes, write_svg the whole document.",
			execute: async (_id, params) => {
				const edit = params as { old_text: string; new_text: string };
				if (!state.svg) return text("ERROR: nothing to edit — call write_svg first.", true);
				if (!edit.old_text) return text("ERROR: expected old_text (non-empty) and new_text strings.", true);
				const occurrences = state.svg.split(edit.old_text).length - 1;
				if (occurrences === 0) return text(`ERROR: old_text not found. Closest line for reference:\n${snippetAround(state.svg, edit.old_text)}`, true);
				if (occurrences > 1) return text(`ERROR: old_text appears ${occurrences} times — it must match EXACTLY ONCE. Include more surrounding context to make it unique.`, true);
				state.svg = state.svg.replace(edit.old_text, edit.new_text);
				onActivity?.("edit_svg: applied");
				return text("OK — replaced 1 occurrence. Call render_svg to look at the edited SVG.");
			},
		},
		render_svg: {
			name: "render_svg", label: "render_svg", parameters: Type.Object({}),
			description: "Render the current SVG to a PNG and show it to you for inspection. No arguments.",
			execute: async () => {
				if (!state.svg) return text("ERROR: nothing to render — call write_svg first.", true);
				try {
					const png = await headless.renderSvg(state.svg);
					const image = await processImage(png, "image/png", { resizeOptions: engine.model.inputLimits?.images?.resize });
					signal?.throwIfAborted();
					if (!image.ok) throw new Error(image.message);
					state.rendered = state.svg;
					onActivity?.("render_svg: inspecting render");
					return { content: [{ type: "text", text: [LOOK_MESSAGE, ...image.hints].join("\n") }, { type: "image", data: image.data, mimeType: image.mimeType }], details: null };
				} catch (err) {
					if (signal?.aborted) throw err;
					onActivity?.("render_svg: render error");
					return text(`RENDER ERROR (the SVG may be malformed): ${err instanceof Error ? err.message : String(err)}. Fix it with write_svg and render again.`, true);
				}
			},
		},
		finish: {
			name: "finish", label: "finish", parameters: finishInput,
			description: "Deliver the current SVG with your notes for the teacher. Refused until you have looked at a render of the SVG as it now stands.",
			execute: async (_id, params) => {
				const { notes } = params as { notes: string };
				if (!state.svg) return text("ERROR: there is no SVG yet — call write_svg first.", true);
				if (state.rendered !== state.svg) return text("ERROR: you have not looked at a render of the SVG as it now stands. Call render_svg, look at it, then finish.", true);
				state.notes = notes.trim();
				return text("Delivered.");
			},
		},
	};
}

const LOOK_MESSAGE =
	"Here is the current render of your SVG — inspect it critically (geometry, labels, clipping, readability):";

export async function runVisualMaker(input: VisualMakerInput, opts: VisualMakerOptions): Promise<VisualResult> {
	const headless = opts.headless ?? getHeadless();
	const brief = input.brief.trim() || "(no brief)";
	const maxIterations = opts.maxIterations ?? 8;
	const reason = headless.unavailableReason();
	if (reason) return { svg: "", notes: `FAILED: ${reason}` };

	const state: MakerState = { svg: null, rendered: null, notes: null };
	const prompt = [
		"Brief for ONE precise figure (from the teacher, verbatim — it is everything you know):",
		brief,
		"",
		"Author the SVG, render it, look at it, iterate until correct, then finish with your notes.",
	].join("\n");
	let finalText = "";
	try {
		const result = await runSubagent(Object.values(createVisualTools(state, headless, opts.engine, opts.onActivity, opts.abortSignal)), {
			engine: opts.engine,
			systemPrompt: INSTRUCTIONS,
			prompt,
			maxTurns: maxIterations,
			abortSignal: opts.abortSignal,
			onUsage: opts.onUsage,
			endsTurn: (name) => name === "finish",
		});
		finalText = result.text.trim();
	} catch (err) {
		return { svg: "", notes: `FAILED: the maker crashed — ${err instanceof Error ? err.message : String(err)}` };
	}
	if (state.notes !== null) return { svg: state.svg!, notes: state.notes || undefined };
	if (state.svg && state.rendered === state.svg) return { svg: state.svg, notes: finalText || "Iteration limit reached — delivering the last verified SVG." };
	if (!state.svg) return { svg: "", notes: `FAILED: the maker never wrote an SVG.${finalText ? ` (${finalText.slice(0, 300)})` : ""}` };
	return { svg: "", notes: "FAILED: the maker stopped without looking at a render of its final SVG." };
}

/** A 3-line numbered context window around the closest fuzzy match for a
 *  failed edit — enough for the model to see what went wrong and retry
 *  (the pi svg_tools snippetAround semantics). */
function snippetAround(svg: string, target: string): string {
	const words = target.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "(empty old_text)";
	const lines = svg.split("\n");
	let bestAt = -1;
	let bestScore = -1;
	for (let i = 0; i < lines.length; i++) {
		const score = words.filter((w) => lines[i]!.includes(w)).length;
		if (score > bestScore) {
			bestScore = score;
			bestAt = i;
		}
	}
	if (bestAt < 0) return "(no similar line found)";
	const from = Math.max(0, bestAt - 1);
	const to = Math.min(lines.length, bestAt + 2);
	return lines
		.slice(from, to)
		.map((line, idx) => `${from + idx + 1} | ${line}`)
		.join("\n");
}
