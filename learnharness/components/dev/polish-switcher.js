/**
 * polish-switcher: a framework-free dev overlay that switches each polished surface between Current and
 * Proposed. Import it once in the app's dev entry, never in production builds:
 *
 *   if (import.meta.env.DEV) import("./polish-switcher.js").then((m) => m.installPolishSwitcher({
 *     groups: [{ id: "sidebar", label: "Sidebar" }, { id: "body", label: "Body" }],
 *     appearance: { read, set, subscribe },
 *   }));
 *
 * `appearance` is required and is the app's own theme API, the same functions its settings use:
 * `read()` returns "light" or "dark" as the page wears it now, `set(mode)` stores that appearance the way the
 * settings would, and `subscribe(onChange)` returns an unsubscribe. Never toggle a class or CSS variables from
 * here: the overlay must show the app's real light and dark themes. If the theme API lives in a hook, lift its
 * setter and reader into plain exported functions the hook calls.
 *
 * State per group:
 *   - localStorage `polish:<group>`, "current" or "proposed"; `?polish-<group>=proposed` in the URL overrides it.
 *   - The attribute `data-polish-<group>` on <html>, so CSS alone can scope a variant:
 *     `[data-polish-sidebar="proposed"] .row { … }`.
 *   - The event `polish:change` on window, with `detail: { group, variant }`, for code that renders differently.
 *
 * Keys: Alt+1 to Alt+9 run through every group's variants in order (by default Current then Proposed per group),
 * and Alt+T flips light and dark. The overlay's Theme row does the same with the mouse.
 * At rest the overlay is a small "Polish" tag in a corner; hovering or focusing it opens the switchers.
 */
const DEFAULT_VARIANTS = ["current", "proposed"];
// A group may list more variants for Explore mode, e.g. ["current", "proposed-a", "proposed-b"].
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

export function installPolishSwitcher({ groups, appearance, corner = "top-right", offset = { x: 16, y: 56 } } = {}) {
  if (!Array.isArray(groups) || groups.length === 0) throw new Error("polish: pass groups: [{ id, label }]");
  if (!appearance || ["read", "set", "subscribe"].some((key) => typeof appearance[key] !== "function"))
    throw new Error("polish: pass appearance: { read, set, subscribe } wired to the app's own theme setting");
  for (const { id, variants } of groups) {
    if (variants) known.set(id, variants);
    document.documentElement.setAttribute(`data-polish-${id}`, polishVariant(id));
  }

  const host = document.createElement("div");
  host.setAttribute("data-polish-switcher", "");
  const [vertical, horizontal] = corner.split("-");
  Object.assign(host.style, { position: "fixed", zIndex: "2147483000", [vertical]: `${offset.y}px`, [horizontal]: `${offset.x}px` });
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; font: 500 11px/1 system-ui, -apple-system, sans-serif; }
      .wrap { display: flex; flex-direction: column; align-items: ${horizontal === "right" ? "flex-end" : "flex-start"}; gap: 6px; opacity: .7; transition: opacity 150ms; }
      .wrap:hover, .wrap:focus-within { opacity: 1; }
      .tag { padding: 6px 8px; border-radius: 6px; background: rgb(23 23 23 / .92); color: rgb(252 211 77); border: 1px solid rgb(255 255 255 / .1); letter-spacing: .06em; text-transform: uppercase; font-weight: 700; font-size: 10px; }
      .groups { display: none; flex-direction: column; gap: 4px; }
      .wrap:hover .groups, .wrap:focus-within .groups { display: flex; }
      .wrap:hover .tag, .wrap:focus-within .tag { display: none; }
      .group { display: flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px; background: rgb(23 23 23 / .92); border: 1px solid rgb(255 255 255 / .1); box-shadow: 0 6px 16px rgb(0 0 0 / .3); }
      .label { padding: 0 6px; color: rgb(125 211 252); text-transform: uppercase; letter-spacing: .06em; font-size: 10px; font-weight: 700; min-width: 56px; }
      button { all: unset; cursor: pointer; padding: 5px 8px; border-radius: 6px; color: rgb(255 255 255 / .75); }
      button:hover { background: rgb(255 255 255 / .1); color: white; }
      button[aria-pressed="true"] { background: white; color: rgb(23 23 23); }
      button:focus-visible { outline: 2px solid rgb(125 211 252); }
    </style>
    <div class="wrap"><span class="tag">Polish</span><div class="groups"></div></div>`;
  const list = root.querySelector(".groups");
  const row = (label, buttons) => {
    const element = document.createElement("div");
    element.className = "group";
    const name = document.createElement("span");
    name.className = "label";
    name.textContent = label;
    element.append(name, ...buttons);
    return element;
  };
  const button = (text, title, pressed, onClick) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    if (title) element.title = title;
    element.setAttribute("aria-pressed", String(pressed));
    element.addEventListener("click", onClick);
    return element;
  };
  const render = () => {
    let key = 0;
    const current = appearance.read();
    list.replaceChildren(
      ...groups.map(({ id, label }) =>
        row(
          label ?? id,
          variantsOf(id).map((variant) => {
            key += 1;
            const text = variant === "current" ? "Current" : variant === "proposed" ? "Proposed" : variant.replace(/^proposed-/, "").replace(/^./, (c) => c.toUpperCase());
            return button(text, key <= 9 ? `Alt+${key}` : undefined, polishVariant(id) === variant, () => setPolishVariant(id, variant));
          }),
        ),
      ),
      row("Theme", ["light", "dark"].map((mode) => button(mode === "light" ? "Light" : "Dark", "Alt+T", current === mode, () => appearance.set(mode)))),
    );
  };
  render();
  const offChange = onPolishChange(render);
  const offAppearance = appearance.subscribe(render);
  const onKey = (event) => {
    if (!event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.code === "KeyT") {
      event.preventDefault();
      event.stopPropagation();
      appearance.set(appearance.read() === "dark" ? "light" : "dark");
      return;
    }
    const digit = Number(/^Digit([1-9])$/.exec(event.code)?.[1]);
    if (!digit) return;
    const slots = groups.flatMap(({ id }) => variantsOf(id).map((variant) => [id, variant]));
    const slot = slots[digit - 1];
    if (!slot) return;
    event.preventDefault();
    event.stopPropagation();
    setPolishVariant(slot[0], slot[1]);
  };
  window.addEventListener("keydown", onKey, true);
  document.body.append(host);
  return () => {
    offChange();
    offAppearance();
    window.removeEventListener("keydown", onKey, true);
    host.remove();
  };
}
