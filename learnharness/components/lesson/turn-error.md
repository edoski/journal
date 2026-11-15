# TurnError

A failed reply, under the learner's message. `data-testid="turn-error"`, `role="alert"`, `data-kind` from `turnErrorText` (turn-error-text.ts).

| Slot | Notes |
|---|---|
| sentence | 13/18 (`text-row`) in `danger`: one plain sentence the learner can act on |
| Retry | quiet 32px button, `foreground` at 500; shown while the failed turn can be retried. Reads Try again on a dropped connection, where it asks the app what became of the reply: it reattaches to a turn still running, or shows the reply that never came with its own Try again; while the app can't be reached the line says so |
| Sign in | quiet, `foreground` at 500; only when the turn was refused because Claude is signed out; opens the sign-in dialog |
| Open Settings | quiet, `muted-foreground`; only when the provider rejected the key; opens Settings on Providers |
| Go to Home | quiet, `foreground` at 500; only when the lesson was deleted elsewhere, which also drops Retry |
| Details | quiet, `muted-foreground`, `aria-expanded`; shown when the sentence replaces the provider's own text |
| details | the provider's raw text in 12/16 mono, `muted-foreground`, wrapping, on its own line under the row |

## The sentence

| Kind | When | Sentence |
|---|---|---|
| signed-out | the server refused the turn before it started (`provider_key_missing`: Claude isn't signed in); his words went back into the box. The line leaves once the account reads connected again, and his box takes focus (round 8: it stayed red after Refresh, and focus went to Sign in). While the composer's "Sign in to Claude" pill shows, the line has no Sign in of its own | Claude isn't signed in, so the tutor couldn't reply. What you wrote is still in the box. |
| key | status 401 or 403, or the text says the key is invalid | The provider rejected your API key. |
| busy | status 429 or 529, or a rate limit or overload | The provider is busy. Wait a moment, then retry. |
| offline | the browser never reached the app (`Failed to fetch`, `Load failed`, Firefox's `NetworkError…`) | Couldn't reach the app. Check it's running, then try again. Pressed again and failing again: Still can't reach the app. Check it's running, then try again. |
| gone | the app answered `{"error":"Unknown chat"}`: the lesson was deleted, in another tab or window | This lesson was deleted. |
| written | already prose for people (the subscription providers' curated failures, the Claude plan limit, an app route's `{"error":"…"}` sentence) | the message itself, no Details |
| failed | anything else | The reply failed. |

A press that fails the same way as the one before it is answered too: the line enters again, with "Still" where its words take it (round 9: a second Enter while the app was down changed nothing on screen, so he could not tell the press counted).

Sources: Apple HIG alerts (say what happened and what to do, in plain words, no codes), Vercel's error messages guideline (every error suggests a next step), findings from the review site (the raw `401 {"type":"error",…}` line).
