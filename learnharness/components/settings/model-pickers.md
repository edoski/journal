# Model pickers

The Proposed bodies of the agent pickers (`model-pickers.tsx`), one per picker, shared by the lesson's details, Settings › Agent, and setup. Each host owns its trigger and its Popover or DropdownMenu.

| Body | Inside | Notes |
|---|---|---|
| `ModelCommand` | a picker `PopoverContent` (`p-1`, 352px) | `Command` with `shouldFilter={false}`: the catalog ranked by `fuzzyScore` over provider, id and name; two-line rows (`size="tall"`): name and price over provider · id and context size; the current model `checked`; a loading line, an empty line, an error line, a footer note |
| `ThinkingMenuItems` | a `DropdownMenuContent` (176px) | the levels this model supports as a radio group, the effective one checked; a quiet line when there are none; a footer note |

Test ids: `model-search`, `model-list`, `model-option-<id>`, `thinking-option-<level>`.

Sources: components/ui/command.md, dropdown-menu.md, menu.md; shadcn's combobox pattern (Popover + Command).
