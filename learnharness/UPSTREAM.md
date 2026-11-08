# Upstream intake

This app is a fork of [amosblomqvist/learnharness](https://github.com/amosblomqvist/learnharness), licensed AGPL-3.0 (kept, see `LICENSE`). We take from upstream only what fits the merged study system (`docs/merged-study-system.md`): the journal's engine owns learner state, the tutor runs on Claude through the owner's own `claude` login, and the loop stays simple with few instruments.

reviewed-through: 713377f3 (v0.5.0, 4 Nov 2026)

Every upstream commit up to and including `reviewed-through` has been decided, taken or skipped. The next intake starts after it.

## How to take the next intake

```sh
git remote add upstream https://github.com/amosblomqvist/learnharness.git   # once per checkout, fetch only
git fetch upstream
git log --reverse --no-merges 713377f3..upstream/main                        # the next ledger
git cherry-pick -x -X subtree=learnharness <commit>                          # one decision per commit
```

- `-X subtree=learnharness` maps upstream's root paths onto this folder.
- `-x` records `(cherry picked from commit …)`, so `git log --grep "cherry picked from commit <sha>"` answers "did we take this?".
- When a pick needs adapting, fold the change into that pick's commit and add an `Adapted:` line after the trailer, so every commit builds on its own.
- Use cherry-picks, never `git subtree pull`. A subtree pull merges all of upstream at once and records a merge that claims every skipped commit is in.
- Drop at once the commits that only touch skipped families: `src/agent/claude-code/`, `src/server/custom-provider*`, `src/core/search.ts`, `src/server/search.ts`, `components/source-folder-tree.tsx`, release workflows and version bumps.
- Then update `reviewed-through` here.

## What came in (8 Nov 2026)

| Intake PR | Upstream commits | Outcome |
| --- | --- | --- |
| [#10](https://github.com/edoski/journal/pull/10) | (fork-only) | Upstream's update feed and the in-app updater removed; `publish: null`. |
| [#11](https://github.com/edoski/journal/pull/11) | `6c0d3ef4` `61d94aa4` `96b50a40` `964fef4e` `5c666766` `bbc33af3` | File tools refuse credential stores, `~/.t3`, every `~/.claude*` and each Claude config dir. |
| [#12](https://github.com/edoski/journal/pull/12) | `485c51f0` `1c18640e` `4a97cfc9` `0d66cd8c` | "Problem waiting" in the sidebar; replays never double messages. |
| [#14](https://github.com/edoski/journal/pull/14) | `3c769309` `3ea192d1` `68483c63` `517cadf6` | Math survives streaming; inline code matches code blocks. |
| [#13](https://github.com/edoski/journal/pull/13) | `59f389d0` | Next 16.4.3. |
| [#15](https://github.com/edoski/journal/pull/15) | `b018c71c` `c0256a92` `52316140` `a7069195` `2106a3cb` `03acd5ce` `05f34865` `936f894c` `4b2417ac` `fe188489` `d45609d6` `240f454b` `dbcaab19` `c4e088e9` | Every store save is crash-safe. |
| [#16](https://github.com/edoski/journal/pull/16) | `e1e55a7e` `8999f08b` `241f4cdb` `dd74fa88` `bf38618b` `68deca49` `8ef46d05` `e2efdb19` `ab9cda6f` `661c6f62` `071a850d` `8485d732` | PDFs read as Markdown and import through Import notes. |
| [#17](https://github.com/edoski/journal/pull/17) | `c58ea7ec` `4f896993` `4e22e9c6` `cee2fec7` `1f9e3b21` `673f05af` `8e550f88` | The auditor finds duplicates from ranked candidates. |
| [#22](https://github.com/edoski/journal/pull/22) | `82f0b593` `6ff49247` `3993122a` `21227a09` `8cca0eb2` | A malformed question no longer strands the session. |
| [#19](https://github.com/edoski/journal/pull/19) | `84f93999` | Images the model sees are normalized (photon-node). |
| [#23](https://github.com/edoski/journal/pull/23) | `2d94eab0` `c1361d1d` | Typing does not re-render the chat. |
| [#24](https://github.com/edoski/journal/pull/24) | `2dc0e11e` | Cache hit rate in the session stats. |

## Skipped families, and why

- **Upstream's Claude Code provider** (`src/agent/claude-code/`, 36 commits). Ours keeps multi-account switching, plan-limit handling, the API-key refusal and a cache-stable replay, and holds no process across tool calls.
- **Custom, local and declarative providers.** The owner studies only with Claude.
- **Hosted web search engines** (Exa, Firecrawl, hosted Ollama). We use the model's native search.
- **Debug capture of background-worker payloads.** Not needed for this fork's debugging.
- **The folder-restriction setting for file tools.** The credential guard closes the risk; a course root from the engine is the natural restriction if one is wanted.
- **File-path chips and the composer paperclip.** The course folder already gives the tutor its files.
- **Showing and annotating the learner's own images.** A new instrument outside the current loop.
- **Source folders, drag, dimming, chains keyboard navigation and Find.** Graph-browsing instruments the loop does not use.
- **Practice prompt overrides in Settings.** They would fork the single doctrine in `learning/skills/tutor/references/`.
- **Pi cache-retention preferences.** They never reach the Claude CLI, which controls caching itself.
- **Non-Latin keyboard shortcut normalization and update-banner dismissal.** No updater here; the owner's layout reports ASCII.
- **Releases, version bumps, docs reorganization, contribution guide.** Upstream's own.

## Decided on evidence

- **Narration delivery guard** (`e6cbc3eb`, `86185a40`): not needed. On 8 Nov 2026 a teaching session on Claude account F (probe, planning, two teach turns) streamed 11 signature-only thinking blocks; none had a signature naming narration, and every teach turn delivered its prose through `send_to_user` before the question. Reopen if a recorded teach turn shows a thinking block whose decoded signature head contains `narration`, or a question arrives without its explanation.
- **Session-reported context window** (`074ba7af`): not needed. On 8 Nov 2026 Claude Code's `get_context_usage` reported `maxTokens` 1,000,000 for `claude-opus-5-5` on account F, before and after a model turn, equal to the catalog. Reopen if it reports another value.

## Deferred until the per-course graph

- **Import a course's notes folder**: `37ec6efe` (without its parallel-subagents setting), `7529a9bb`, the import half of `b85440ee`, `c48e630a`, `9cdfb864`. Imports should land in the course's graph and tag statements with its topics.
- **Delete an imported source**: `ee4e05b1`, `039cab6d`, without the source-folder UI. Bring back the source-deletion cases of `store-writes-atomic` and `store-delete-leftovers` with it (dropped in #15).
