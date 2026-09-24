# Native teaching visuals

Researched 2026-09-18. Scope: existing learning skill, Pi Markdown mirror, Obsidian and Mermaid documentation, and the original `amosblomqvist/learn` visualization skill. No runtime, vault, or configuration changes.

## Verdict

Use a short instruction in the existing learning skill: native Mermaid for a relationship that benefits from a diagram; ordinary Markdown math for equations. A separate visualization skill, renderer installation, routine image exports, or maker-agent loop is not justified for this workflow; retain a small optional reference only if real usage needs more guidance.

## Findings

1. **The current transport already carries diagrams.** `lessonText` retains user/assistant text and `sync` publishes it as Markdown; it does not need a diagram renderer. The shared skill already selects native Markdown and math. Mermaid fences can travel through that existing path unchanged. This is a source-level finding, not a new live rendering test. [Pi source](../../../learning/pi.ts), [learning skill](../../../learning/skills/learn/SKILL.md), [architecture](../../../learning/README.md).

2. **Obsidian provides the required renderer.** Its documentation explicitly supports diagrams in fenced `mermaid` blocks, including flowcharts and sequence diagrams. Authoring such a block requires no extra CLI, browser automation, plugin, or PNG file. Recommendation: one small diagram only when its structure, ordering, or state changes explain something more clearly than prose. [Obsidian formatting](https://obsidian.md/help/advanced-syntax).

3. **The original skill solves a heavier problem.** It delegates to Mermaid/SVG makers, requires PNG render-and-inspect iteration, then embeds the resulting asset. It depends on its own visual-tools extension and renderer dependencies. Its useful design advice is to show one idea with few elements and distinguish relational diagrams from exact geometry. Keep that advice; do not import its execution architecture for ordinary native diagrams. [Original skill](https://github.com/amosblomqvist/learn/blob/main/skills/visualize/SKILL.md).

4. **Rendering cannot guarantee factual correctness.** Mermaid's parser validates syntax; rendering turns a graph definition into a picture. Neither establishes that a causal arrow, dependency, numerical value, or geometrical claim is true. Inspection can catch visible errors but cannot guarantee all false claims are caught, contrary to the original skill's guarantee. Check the relationships against the lesson's evidence separately. [Mermaid API](https://mermaid.js.org/config/usage.html#syntax-validation-without-rendering), [original guarantee](https://github.com/amosblomqvist/learn/blob/main/skills/visualize/SKILL.md).

5. **Math support is not universal.** Obsidian's note math uses MathJax; Mermaid documents KaTeX expressions delimited by `$$` for flowcharts and sequence diagrams, with version and browser constraints. This does not establish equivalent support in every diagram type or client. Prefer plain diagram labels with equations beside the diagram; use in-diagram math only when the relevant target supports it. [Obsidian math](https://obsidian.md/help/advanced-syntax), [Mermaid math](https://mermaid.js.org/config/math).

6. **Shared source need not imply identical client rendering.** Mermaid documents platform/font differences and separate builds with different features. Keep the saved Markdown source portable, but allow each host's native capabilities; a client without rendering can expose the fenced source while Obsidian supplies the visual. Do not promise that the installed Pi, Codex, Claude, and Obsidian versions all render the same diagram identically. No forced common renderer or feature matrix is needed for simple diagrams. [Mermaid platform differences](https://mermaid.js.org/config/math#handling-rendering-differences), [Mermaid usage/builds](https://mermaid.js.org/config/usage.html).

7. **Assets remain an occasional tool.** Exact coordinates, scientific plots, or requested exports may justify a generated SVG or other supported asset, embedded into the existing note. Use the existing asset location and verify those outputs according to their mathematical or publishing purpose. Routine diagrams do not need duplicate source/PNG files. [Existing asset location](../../../learning/README.md), [Obsidian embeds](https://obsidian.md/help/embeds).

## Minimal implementation proposal

Add one paragraph beside the existing Markdown/math instruction in `learning/skills/learn/SKILL.md`; no change to `pi.ts`:

> When a visual clarifies the current idea, use one small native Mermaid block for relationships, flow, sequence, or state. Keep labels plain and put equations in surrounding Markdown unless the target supports that diagram's math syntax. Check what every arrow and label claims; successful rendering does not prove correctness. Use a generated asset only when geometry, plotting, or an explicit export calls for it. Do not routinely delegate visuals, export PNGs, or run render-and-inspect loops; investigate rendering when it actually fails or the requested artifact needs visual verification.

Use basic syntax and quoted labels; consult the relevant Mermaid page only for unfamiliar syntax. Avoid a full syntax catalogue in the always-loaded skill. Flowchart keywords and edge shorthand have real pitfalls, so simple node IDs and quoted display text are useful defaults. [Flowchart syntax](https://mermaid.js.org/syntax/flowchart.html).

## Confidence

High: native Obsidian support, current Pi text transport, the original skill's extra machinery, and the distinction between syntax and truth. High for the documented math limits; actual support depends on the installed client. The recommendation for a single short instruction is an architectural judgment based on the existing code and the user's token-efficiency constraint, not a benchmarked token-saving estimate.

## Gaps

Installed renderer versions and per-client appearance were not tested; no claim of successful live rendering is made. Resolve a concrete failure in the affected client when it occurs. Reconsider a separate optional reference or asset workflow only after repeated use demonstrates a missing capability; no extra dependencies or acceptance suite are required for this documentation proposal.
