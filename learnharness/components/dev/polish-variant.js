/**
 * polish-variant: the app's side of the variant protocol. The Logbook's in-app guide is the switcher (its menu,
 * Alt+1 to Alt+9 and Alt+T); this file is all an app needs to read the variant and hand the guide its surfaces.
 * Import it once in the app's dev entry, never in production builds:
 *
 *   if (import.meta.env.DEV) import("./polish-variant.js").then((m) => m.registerPolishHost({
 *     groups: [
 *       { id: "design", label: "Design" },                          // Current, Proposed
 *       { id: "home", label: "Home", options: ["a", "b", "c"],      // Current, A, B, C: three candidates, one row
 *         requires: { design: "proposed" } },                       // any of them wears Design's Proposed
 *     ],
 *     appearance: { read, set, subscribe },
 *   }));
 *
 * A group is one change. With no `options` it offers Current and Proposed; with `options` it offers Current and each
 * option, so an Explore pass's candidates for one change are one group (SKILL.md, Explore). Current is every group's
 * own and is never listed. An option's label is its value with a capital ("a" reads A, "dense" Dense).
 * `requires` names the values of other groups that every option of this group needs: while the group is on anything
 * but Current, those groups read as required; switching one of them away turns this group back to Current.
 *
 * `appearance` is required and is the app's own theme API, the same functions its settings use (or the string
 * "single" for an app with one appearance, which leaves out the guide's Theme row and Alt+T):
 * `read()` returns "light" or "dark" as the page wears it now, `set(mode)` stores that appearance the way the
 * settings would, and `subscribe(onChange)` returns an unsubscribe. Never toggle a class or CSS variables for it:
 * the guide must show the app's real light and dark themes.
 *
 * State per group, for a group `home` with options a, b, c:
 *   - localStorage `polish:home`, one of "current", "a", "b", "c"; `?polish-home=b` in the URL pins this tab to B.
 *   - The attribute `data-polish-home` on <html>, so CSS alone can scope a variant: `[data-polish-home="b"] .row { … }`.
 *   - The event `polish:change` on window, with `detail: { group, variant }`, for code that renders differently; a
 *     group a requirement moved hears its own event.
 * A capture names the same value: `logbook after <id> --variant home=b`.
 */
const DEFAULT_VARIANTS = ["current", "proposed"];
const VALUE = /^[\w-]+$/;
const known = new Map(); // group -> { variants, requires }
const variantsOf = (group) => known.get(group)?.variants ?? DEFAULT_VARIANTS;
const EVENT = "polish:change";
const storageKey = (group) => `polish:${group}`;

/** The group's own value: this tab's pin, else the stored choice, else Current. */
function ownVariant(group) {
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

/** The groups on an option that requires something of `group`, with what they require. */
const requirers = (group) => [...known].filter(([id, g]) => id !== group && g.requires?.[group] && ownVariant(id) !== "current").map(([id, g]) => [id, g.requires[group]]);

export function polishVariant(group) {
  return requirers(group)[0]?.[1] ?? ownVariant(group);
}

const shown = new Map();
/** Marks every group's value on <html> and tells subscribers about each one that moved, `first` before the rest. */
function publish(first) {
  const ids = [...new Set([first, ...known.keys()].filter(Boolean))];
  for (const id of ids) {
    const now = polishVariant(id);
    document.documentElement.setAttribute(`data-polish-${id}`, now);
    if (id === first || shown.get(id) !== now) {
      shown.set(id, now);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { group: id, variant: now } }));
    }
  }
}

function store(group, variant) {
  localStorage.setItem(storageKey(group), variant);
  // A ?polish-<group>= link chose the first view; an explicit choice replaces it.
  const url = new URL(location.href);
  if (url.searchParams.has(`polish-${group}`)) {
    url.searchParams.delete(`polish-${group}`);
    history.replaceState(history.state, "", url);
  }
}

export function setPolishVariant(group, variant) {
  if (!variantsOf(group).includes(variant)) throw new Error(`polish: unknown variant ${variant} for ${group}`);
  store(group, variant);
  // A group that needs another value of this one goes back to Current, so the switch never looks stuck.
  for (const [id, needed] of requirers(group)) if (needed !== variant) store(id, "current");
  publish(group);
}

/** Subscribe to switches (this tab's and other tabs'); returns the unsubscribe. Fits React's useSyncExternalStore. */
export function onPolishChange(callback) {
  const onStorage = (event) => {
    if (!event.key?.startsWith("polish:")) return;
    const group = event.key.slice("polish:".length);
    // Another tab's choice moves the groups it requires too.
    for (const id of [group, ...Object.keys(known.get(group)?.requires ?? {})]) {
      document.documentElement.setAttribute(`data-polish-${id}`, polishVariant(id));
      callback({ group: id, variant: polishVariant(id) });
    }
  };
  const onChange = (event) => callback(event.detail);
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** A group's values: Current, then its options, or Proposed; `variants` is the full list an older registry gave. */
function valuesOf({ id, options, variants }) {
  if (variants) return variants;
  if (!options) return DEFAULT_VARIANTS;
  for (const o of options) {
    if (o === "current") throw new Error(`polish: ${id} lists current among its options; Current is every group's own`);
    if (!VALUE.test(o)) throw new Error(`polish: ${id}'s option "${o}" must be letters, digits, - or _, as a URL pin and a capture's --variant take it`);
  }
  return ["current", ...new Set(options)];
}

/** Hands the in-app guide this app's surfaces, store and theme, and marks each surface's variant on <html>. */
export function registerPolishHost({ groups, appearance }) {
  const next = new Map(groups.map((g) => [g.id, { variants: valuesOf(g), requires: g.requires }]));
  for (const [id, { requires }] of next) {
    for (const [other, value] of Object.entries(requires ?? {})) {
      if (!next.has(other)) throw new Error(`polish: ${id} requires ${other}, which is not a group`);
      if (!next.get(other).variants.includes(value)) throw new Error(`polish: ${id} requires ${other}=${value}, which ${other} does not offer`);
    }
  }
  known.clear();
  for (const [id, g] of next) known.set(id, g);
  shown.clear();
  for (const id of known.keys()) shown.set(id, polishVariant(id));
  for (const id of known.keys()) document.documentElement.setAttribute(`data-polish-${id}`, polishVariant(id));
  window.polishHost = {
    groups: groups.map((g) => ({ ...g, variants: variantsOf(g.id) })),
    appearance,
    read: polishVariant,
    set: setPolishVariant,
    subscribe: onPolishChange,
  };
  window.dispatchEvent(new Event("polish:host"));
}
