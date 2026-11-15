# Compaction and usage accounting

## Retention

Claude Code compacts a lesson's session at its own point; the app gives it only the lesson's instructions. See [sessions and compaction](sessions-and-compaction.md).

## Spending

`src/server/pricing.ts` uses Pi AI's full, key-independent catalog and public
`calculateCost` on a new usage object. The browser receives derived costs, not a
second calculator/rate table. Totals are estimates using the currently shipped
catalog, not provider invoices; catalog updates can reprice history.

Saved input is Pi-normalized **fresh input**, disjoint from cache buckets. Never
subtract cached reads from it again or migrate old logs as raw inclusive prompt
tokens. New captures preserve the one-hour subset of cache writes and individual
background-job calls. Older write-bearing records with a lost retention split,
and tier-priced multi-call jobs with only aggregate usage, remain unpriced when
the lost detail can change the answer. They are not reconstructed from totals.
Flat-rate historical jobs with sufficient counts remain priceable. Missing models
or required usage stay unpriced; Claude plan usage remains plan usage, not
API dollars.
