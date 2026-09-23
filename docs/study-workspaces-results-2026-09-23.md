# Local study workspaces: implementation and cutover

Implemented and installed the [approved workspace design](study-workspaces-spec.md).
AIKR and SMM now own independent `.study` directories inside their course folders.
The three former global locations were removed after explicit user authorization,
migration, and verification. There is no active global learner-state fallback.

Production commits: `81619f7` and reviewed correction `8fb32b3`. Baseline: `2139b09`.
Unrelated macOS changes remain untouched.

## Daily use

```sh
cd /path/to/course-or-project
study init
study
```

`study init` is idempotent and creates no subject, inferred knowledge or model call.
The engine is installed once. `.study/workspace.json` marks an initialized directory;
state, preferences, lessons, diagrams and Pi conversations stay inside `.study`.
Personal generated files are ignored by Git by default.

From a descendant directory, `study` selects the nearest enclosing workspace.
Nested workspaces are independent. `study --workspace /path/to/course` selects an
exact initialized directory. Missing or malformed workspaces fail with an actionable
message; inherited environment selection cannot silently override ordinary discovery.
Pi passes the selected workspace explicitly to its tools. Native agent scripts use
the same resolver and can pass `--workspace` before their command.

`study --continue` uses the selected workspace's Pi history. `study --private` uses
disposable copies of only its records, no persistent output and no saved Pi transcript.
Source material stays in place. Sources within the workspace use portable relative
paths; explicitly external sources stay absolute. Generated diagram embeds are
relative to `.study/lessons`, so moving the directory preserves them.

No global registry, inherited learning profile, automatic cross-workspace retrieval
or aggregation was added. Those remain deferred. Native provider histories outside
the managed Pi files remain host-owned.

## Verification and review

The focused learning gate passes: **278 Python tests, 33 Pi adapter tests, Ruff,
strict mypy over 23 files, and 10 import contracts**. Tests exercise nested and
explicit selection, malformed markers, independence of identical scope names,
preferences, artifact publication, moved source/asset paths, private mode, import,
installed-command working directory, and Pi's pinned tool selection.

Independent Standards review: **zero remaining actionable findings**. Independent
Spec review: **zero remaining findings**. The review corrections removed inherited
environment routing from ordinary discovery and kept external import targets
absolute. Workspace source ownership is explicit; initialization publishes the
manifest and Git exclusion together through an atomic directory rename.

Installed-command smoke checks confirm that initialization runs in the caller's
directory, repeating it preserves the workspace, and use outside a workspace neither
launches a model nor creates state. Real Pi session discovery confirms both migrated
SMM conversations are recognized and resume selects the expected most recent one.

Three bounded native sessions used **Pi 0.87.1, GPT-6 Sol/high** with isolated
synthetic state. The initial candidate ran correction and recall; the final reviewed
candidate reran the correction after the routing fixes. All completed without tool
errors or source changes during execution. Correction changed only the intended
knowledge and publication metadata, preserving unrelated records and learner
observations; recall left state unchanged. This is integration evidence, not a new
estimate of model reliability or a claim that the previously reported behavioral
limitations are universally solved.

Evidence: [initial correction](learning-ux-acceptance-2026-09-23/workspaces-smoke/1-s1-qualified-correction/s1-qualified-correction.metrics.json),
[initial recall](learning-ux-acceptance-2026-09-23/workspaces-smoke/1-f3-course-recall/f3-course-recall.metrics.json),
[final correction](learning-ux-acceptance-2026-09-23/workspaces-final-smoke/1-s1-qualified-correction/s1-qualified-correction.metrics.json),
and [aggregate verification receipt](study-workspaces-acceptance-2026-09-23/verification.json).
Adjacent files retain public answers, sanitized tool traces and synthetic state.
No new Obsidian GUI verification or other-provider live lesson was performed.

## Personal migration and removal

Both course records retain their knowledge, learner evidence, tasks, assessments,
and provenance. Source paths were rebased and checked against the original targets.
Explicit general teaching defaults were copied into each workspace as independent
local rules; the SMM-specific preference remains local to SMM. AIKR has one preference
rule and SMM has two.

SMM received four lesson files (including one empty session placeholder), one SVG,
and two Pi conversations. Lessons and SVG were byte-verified. Only the conversations'
`cwd` headers changed; every subsequent message byte was preserved. Original file
timestamps were retained for conversation ordering. The SMM source referring to an
old lesson now points to its local `.study/lessons` copy; source metadata and learner
evidence remain intact.

After checking both local catalogs, preference rules, source targets, readiness and
Pi history discovery, the following old locations were removed:

- `the-vault/learn/`
- `the-vault/assets/learn/`
- `~/Library/Application Support/Learning/pi-sessions/`

All 18 files in those locations were checked against the migration snapshot before
removal. The 18 destination files were hash-verified before and after removal, and
the installed CLI was checked again afterward. No archive of the old locations is
retained by this migration. Course PDFs, exercises, other source material, shared
software installation, credentials and provider-side history were not deleted.

The general `study import` command remains a previewable, non-destructive one-scope
copy into an empty workspace; it never deletes source locations. The broader personal
lesson/history migration and removal above were a separately authorized cutover.
