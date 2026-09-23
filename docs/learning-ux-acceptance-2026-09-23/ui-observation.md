# Actual UI observation — 23 September 2026

Obsidian rendering and preservation of an annotation entered through its editor
passed this bounded synthetic check. Pi's visible streaming and localized quiz UI
remain unverified because the Computer Use tool refused access to Ghostty.

## Scope and method

The repository HEAD was `13d5f32f33a3b1e52c0e91440ef137a1785749cd`.
No production, skill, or test files were edited by this check. All study content
was newly written synthetic Italian material about a singular linear system;
existing learner records and course notes were not used as fixtures.

The actual application identified itself as **Obsidian 1.13.7**. GUI actions,
accessibility observations, and screenshots used only `mcp__cua_repl`. The screenshots
were viewed in the task's tool outputs; no screenshot files were exported.
Filesystem checks support the UI observations and are identified separately below.

Temporary vault:
`/private/tmp/journal-ui-20260923-zbuqvu83/SyntheticLearningUI`.
The unmodified `learning.lessons.publish` created
`learn/sessions/48c84ec6-fc78-4e59-9458-9192701c24fd.md` inside that vault.
The vault was opened through Obsidian's **Open folder as vault** control. No plugin,
theme, login, or real-vault setting was changed.

## Observed results

| Check | Actual observation | Result |
| --- | --- | --- |
| Reading mode | Italian lesson heading and paragraphs rendered; a 2×2 matrix and column vector appeared as formatted display math; inline math, a purple example callout, and a two-row table rendered legibly. | Passed |
| Publication metadata | Reading mode hid session/lesson metadata, fingerprint, generated-region markers, and the annotation comment. | Passed in reading mode |
| Annotation entry | Used Obsidian's editor to append `Appunto sintetico del lettore: controllo anche il termine noto.` beneath **Your notes**, then saved. | Passed |
| Republish teaching | Called the real Python publisher with changed teaching. The subsequent reading-view screenshot showed **Precisazione pubblicata: la seconda equazione ripete la prima, quindi** and the learner annotation together. | Passed |
| Annotation preservation | The entire suffix after `<!-- learning-generated:end -->` was compared before/after publication and was byte-identical. The preserved sentence was independently visible on screen. | Passed; filesystem and UI evidence |
| Close/reopen note | Closed the synthetic note tab, reopened it through Quick Switcher, and switched to reading mode. The revised teaching and annotation were still visible. | Passed for note reopening |
| Temporary UI cleanup | Closed the synthetic vault window; removed its entry with **Remove from list**; closed the vault manager. The remaining manager list matched the three pre-existing vault entries. | Passed |

The annotation/publication comparison was saved outside the repository as
`/private/tmp/journal-ui-20260923-zbuqvu83/annotation-publication-evidence.json`.
The initial synthetic teaching and manifest remain beside it for reproduction.
Temporary files were retained; removal from Obsidian's list did not delete them.

Two presentation limitations were visible in a fresh vault with its defaults.
Obsidian displayed the UUID filename as a large inline title above the natural
lesson heading, and the publisher's annotation heading remained English
(`Your notes`) in an Italian lesson. Live Preview displayed the metadata comments
when editing; reading mode hid them. Reopening the note through Quick Switcher
returned to editing mode, so a reading-mode switch was needed. These observations
do not establish what the Pi opener selects or how a configured existing vault
looks; that path was not exercised.

## Pi blocker and unexercised paths

The attempted UI selection was exactly
`cua.getApp('com.mitchellh.ghostty')`. It returned:

> Computer Use is not allowed to use the app 'com.mitchellh.ghostty' for safety reasons.

No terminal window, TUI session, provider/model stream, quiz, or alternative GUI
route was launched after that refusal. No auth or installation was attempted.

A separate bounded preparatory check found a possible deterministic local
provider route in the installed Pi **0.85.1** API. It created only temporary
files under `/tmp/journal-ui-harness.ESMC27/` and successfully listed the registered
offline model. Its stream was never run. That preparation is not UI acceptance
evidence and says nothing about actual streaming or quiz presentation.

This run therefore did **not** verify early readable Pi teaching, localized
choice/free-text controls, keyboard cancellation, pending-answer concealment,
Obsidian repaint before quiz input, automatic opening from Pi, `correct_lesson`,
Pi restart/branch reconstruction, native application restart, publication races,
or source/diagram interaction. Close/reopen of one Obsidian note is not a substitute
for those paths. No latency, model quality, retention, transfer, or long-term
learning outcome was measured.
