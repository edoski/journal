/**
 * polish-variant: the app's side of the variant protocol. The Logbook's in-app guide is the switcher (its menu,
 * Alt+1 to Alt+9 and Alt+T); this file is all an app needs to read the variant and hand the guide its surfaces.
 * Import it once in the app's dev entry, never in production builds:
 *
 *   if (import.meta.env.DEV) import("./polish-variant.js").then((m) => m.registerPolishHost({
 *     groups: [{ id: "sidebar", label: "Sidebar" }, { id: "body", label: "Body" }],
 *     appearance: { read, set, subscribe },
 *   }));
 *
 * `appearance` is required and is the app's own theme API, the same functions its settings use (or the string
 * "single" for an app with one appearance, which leaves out the guide's Theme row and Alt+T):
 * `read()` returns "light" or "dark" as the page wears it now, `set(mode)` stores that appearance the way the
 * settings would, and `subscribe(onChange)` returns an unsubscribe. Never toggle a class or CSS variables for it:
 * the guide must show the app's real light and dark themes.
 *
 * State per group:
 *   - localStorage `polish:<group>`, "current" or "proposed"; `?polish-<group>=proposed` in the URL overrides it.
 *   - The attribute `data-polish-<group>` on <html>, so CSS alone can scope a variant:
 *     `[data-polish-sidebar="proposed"] .row { … }`.
 *   - The event `polish:change` on window, with `detail: { group, variant }`, for code that renders differently.
 */
const DEFAULT_VARIANTS = ["current", "proposed"];
// Every group has exactly Current and Proposed; an Explore candidate is its own group (SKILL.md, Explore).
const known = new Map();
const variantsOf = (group) => known.get(group) ?? DEFAULT_VARIANTS;
const EVENT = "polish:change";
const storageKey = (group) => `polish:${group}`;

export function polishVariant(group) {
  try {
    const fromUrl = new URLSearchParams(location.search).get(`polish-${group}`);
    // A ?polish-<group>= link pins this tab only. Persisting it would make two tabs pinned to different
    // variants overwrite each other through the storage event without end.
    if (variantsOf(group).includes(fromUrl)) return fromUrl;
    const stored = localStorage.getItem(storageKey(group));
    return variantsOf(group).includes(stored) ? stored : "current";
  } catch {
    return "current";
  }
}

export function setPolishVariant(group, variant) {
  if (!variantsOf(group).includes(variant)) throw new Error(`polish: unknown variant ${variant} for ${group}`);
  localStorage.setItem(storageKey(group), variant);
  // A ?polish-<group>= link chose the first view; an explicit choice replaces it.
  const url = new URL(location.href);
  if (url.searchParams.has(`polish-${group}`)) {
    url.searchParams.delete(`polish-${group}`);
    history.replaceState(history.state, "", url);
  }
  document.documentElement.setAttribute(`data-polish-${group}`, variant);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { group, variant } }));
}

/** Subscribe to switches (this tab's and other tabs'); returns the unsubscribe. Fits React's useSyncExternalStore. */
export function onPolishChange(callback) {
  const onStorage = (event) => {
    if (!event.key?.startsWith("polish:")) return;
    const group = event.key.slice("polish:".length);
    document.documentElement.setAttribute(`data-polish-${group}`, polishVariant(group));
    callback({ group, variant: polishVariant(group) });
  };
  const onChange = (event) => callback(event.detail);
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Hands the in-app guide this app's surfaces and theme, and marks each surface's variant on <html>. */
export function registerPolishHost({ groups, appearance }) {
  for (const { id, variants } of groups) {
    if (variants) known.set(id, variants);
    document.documentElement.setAttribute(`data-polish-${id}`, polishVariant(id));
  }
  window.polishHost = { groups: groups.map((g) => ({ ...g, variants: variantsOf(g.id) })), appearance };
  window.dispatchEvent(new Event("polish:host"));
}
