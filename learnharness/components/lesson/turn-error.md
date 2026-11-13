# TurnError

A failed reply, under the learner's message. `data-testid="turn-error"`, `role="alert"`, `data-kind` from `turnErrorText` (turn-error-text.ts).

| Slot | Notes |
|---|---|
| sentence | 13/18 (`text-row`) in `danger`: one plain sentence the learner can act on |
| Retry | quiet 32px button, `foreground` at 500; shown while the failed turn can be retried |
| Open Settings | quiet, `muted-foreground`; only when the provider rejected the key; opens Settings on Providers |
| Go to Home | quiet, `foreground` at 500; only when the lesson was deleted elsewhere, which also drops Retry |
| Details | quiet, `muted-foreground`, `aria-expanded`; shown when the sentence replaces the provider's own text |
| details | the provider's raw text in 12/16 mono, `muted-foreground`, wrapping, on its own line under the row |

## The sentence

| Kind | When | Sentence |
|---|---|---|
| key | status 401 or 403, or the text says the key is invalid | The provider rejected your API key. |
| busy | status 429 or 529, or a rate limit or overload | The provider is busy. Wait a moment, then retry. |
| offline | the browser never reached the app (`Failed to fetch`, `Load failed`, Firefox's `NetworkError…`) | Couldn't reach the app. Check it's running, then send again. |
| gone | the app answered `{"error":"Unknown chat"}`: the lesson was deleted, in another tab or window | This lesson was deleted. |
| written | already prose for people (the subscription providers' curated failures, the Claude plan limit, an app route's `{"error":"…"}` sentence) | the message itself, no Details |
| failed | anything else | The reply failed. |

Sources: Apple HIG alerts (say what happened and what to do, in plain words, no codes), Vercel's error messages guideline (every error suggests a next step), findings from the review site (the raw `401 {"type":"error",…}` line).
