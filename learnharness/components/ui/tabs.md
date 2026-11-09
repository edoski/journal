# Tabs

Panels switched by a list: the Settings sections. `tabs.tsx`, shadcn's Radix tabs; `data-slot` `tabs`, `tabs-list`, `tabs-trigger`, `tabs-content`. The arrow keys move along the list.

| Slot | Notes |
|---|---|
| list `default` | a segmented track: full radius, `fill-hover`, padding 2, 32 tall |
| list `line` | bare; the triggers bring their own look (Settings renders `NavRow` through `TabsTrigger asChild`) |
| trigger | 28px pill, 13px, muted until active; active on `fill-selected`; no weight change |
| content | fills the rest |

Sources: shadcn tabs, the ToggleGroup `segmented` look (`toggle-group.md`), macOS System Settings' sidebar list.
