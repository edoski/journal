# Compaction and usage accounting

## Retention

Claude Code compacts a lesson's session at its own point; the app gives it only the lesson's instructions. See [sessions and compaction](sessions-and-compaction.md).

## Usage

Each lesson turn and each background job keeps its token counts (`turns` on the chat record, `usage` on the job record). Nothing turns them into a price: the lessons run on Edo's Claude plan.
