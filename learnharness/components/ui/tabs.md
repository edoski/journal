# Tabs

Panels switched by a list: the Settings sections. `tabs.tsx`, shadcn's Radix tabs; `data-slot` `tabs`, `tabs-list`, `tabs-trigger`, `tabs-content`. The arrow keys move along the list.

| Slot | Notes |
|---|---|
| list `default` | a segmented track: full radius, `fill-hover`, padding 2, 32 tall |
| list `line` | shadcn v4's underline tabs: no track or fill; horizontal, 32 tall with 20 between tabs. Settings renders `NavRow` through `TabsTrigger asChild`, which brings its own look |
| trigger | 28px pill, 13px, muted until active; active on `fill-selected`; no weight change. In a `line` list: bare 13px text the list's height, muted until active, the active one in ink over a 2px full-ink underline at its foot (fades in 150ms); the focus ring keeps a 4 radius |
| content | fills the rest; Radix makes it focusable, so it shows the 2px ring inset on keyboard focus (the list shows it too while it hands focus to the active tab) |

Sources: shadcn tabs (new-york-v4 `tabs.tsx`, its `line` variant: transparent list, an `after:` bar 2px tall under the active trigger), the ToggleGroup `segmented` look (`toggle-group.md`), macOS System Settings' sidebar list.
