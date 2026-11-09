# Switch

An on/off setting applied at once. `switch.tsx`, shadcn's Radix switch; `data-slot` `switch`, `switch-thumb`. `role="switch"` and `aria-checked` come from Radix; give it an `aria-label` or a `Label`.

| Part | Notes |
|---|---|
| track | 32 × 20, full radius; on: `muted-foreground`, off: `input` |
| disc | 16px, inset 2; on: `foreground`, off: `muted-foreground`; slides 150ms |
| focus | 2px `ring`, offset 2 on the popover fill |

Owner, 2026-09-20: on is a grey track with a white disc, never a bright one. Sources: shadcn switch, `components/settings/settings.md`, macOS switches.
