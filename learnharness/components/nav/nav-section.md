# NavSection

A titled group of sidebar rows: the sessions of one course. `data-slot="nav-section"`, header `data-slot="nav-section-header"`.

## Anatomy

| Slot | Element | Notes |
|---|---|---|
| root | `section`, labelled by its header | rows follow the header with no extra gap |
| header | `h2` | 28px band, 12/16, weight 500, sentence case, `muted-foreground`, left edge on the rows' label edge (padding 8) |

Sections sit 12px apart (between rows' 0 and the sidebar blocks' 16). The header is quieter than its rows: smaller (12 against 13) and never full ink.

## Sources

Header 12, medium, muted, sentence case: shadcn sidebar group label, Primer, Fluent. Header to first row 6 to 8 (the 28px band leaves 8 below the text): Primer, Fluent. All-caps tracked labels go: the owner's direction (findings row 1). See `~/.claude/skills/polish/references/targets.md`.
