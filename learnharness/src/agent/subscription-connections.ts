/** Background consent for the provider a wake, a digest or a map build would spend. Every agent runs on the user's own
 *  Claude plan through the `claude` CLI, which asks no separate consent for background work, so every provider is allowed. */
export function connectionBackgroundAllowed(_provider: string | undefined): boolean { return true; }
