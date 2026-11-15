"use client";
/**
 * The Keyboard section (thin settings wave): view / rebind / reset over
 * core/keyboard.ts's registry. The overrides persist in localStorage
 * (lh:keymap, overrides-only, merged over DEFAULT_BINDINGS), so rebinding
 * is INSTANT — the dispatcher reads the map per keydown, no reload.
 *
 * Rebind flow: click Rebind → the row listens for the next keydown
 * (capture phase, preventDefault — nothing types anywhere), eventBinding
 * normalizes it, saveOverrides persists. Escape cancels. displayOnly
 * actions (a surface owns those keys — the question dock's row machine)
 * are listed for reading but never rebindable.
 *
 * Thin: no conflict detection — if a new binding collides with another
 * action's, the first match in registry order wins; the cheat sheet shows
 * both. Detection belongs to the designed wave.
 */

import { useEffect, useState } from "react";
import {
	KEY_SCOPES,
	KEYBOARD_ACTIONS,
	eventBinding,
	formatBinding,
	loadOverrides,
	saveOverrides,
	type KeyAction,
} from "@/src/core";
import { SettingsGroup, SettingsRow } from "./controls.tsx";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

/** The overrides map after ONE change (pure — exported for tests):
 *  binding null = reset the action to its default (key removed). */
export function nextOverrides(
	current: Partial<Record<KeyAction, string>>,
	id: KeyAction,
	binding: string | null,
): Partial<Record<KeyAction, string>> {
	const next = { ...current };
	if (binding === null) delete next[id];
	else next[id] = binding;
	return next;
}

export function KeyboardSection() {
	const [overrides, setOverrides] = useState<Partial<Record<KeyAction, string>>>({});
	const [rebinding, setRebinding] = useState<KeyAction | null>(null);
	const [nonce, setNonce] = useState(0);

	// localStorage is read post-mount (SSR-safe); `nonce` re-reads after writes.
	useEffect(() => {
		setOverrides(loadOverrides());
	}, [nonce]);

	// The capture listener — only while a rebind is armed.
	useEffect(() => {
		if (!rebinding) return;
		const onKey = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.key === "Escape") {
				setRebinding(null);
				return;
			}
			// Modifier keydowns arrive one by one (⌘ down, then ⇧, then the
			// key) — each is a keydown this capture listener sees. They are
			// not bindings; keep listening for the real key.
			if (e.key === "Control" || e.key === "Meta" || e.key === "Alt" || e.key === "Shift") return;
			const binding = eventBinding(e);
			if (!binding) return;
			const next = nextOverrides(loadOverrides(), rebinding, binding);
			saveOverrides(next);
			setRebinding(null);
			setNonce((n) => n + 1);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [rebinding]);

	function resetOne(id: KeyAction) {
		saveOverrides(nextOverrides(loadOverrides(), id, null));
		setNonce((n) => n + 1);
	}

	function resetAll() {
		saveOverrides({});
		setNonce((n) => n + 1);
	}

	const overridden = (id: KeyAction) => overrides[id] !== undefined;

	const action = "h-7 px-2 font-normal";
	// Settings lists what can be changed; the keys a screen owns (the
	// question's) stay in the cheat sheet.
	const changeable = KEYBOARD_ACTIONS.filter((a) => !a.displayOnly);
	return (
		<>
			{KEY_SCOPES.map(({ scope, label }) => {
				const actions = changeable.filter((a) => a.scope === scope);
				if (!actions.length) return null;
				return (
					<SettingsGroup key={scope} label={label} testid={`kbd-scope-${scope}`}>
						{actions.map((def) => (
							<SettingsRow
								key={def.id}
								label={def.label}
								hint={def.displayOnly ? "Fixed — part of this screen" : undefined}
								testid={`kbd-row-${def.id}`}
							>
								<span className="flex shrink-0 items-center gap-1">
									<Kbd className={rebinding === def.id ? "mr-1 text-foreground" : "mr-1"}>
										{rebinding === def.id ? "Press keys…" : formatBinding(overrides[def.id] ?? def.binding)}
									</Kbd>
									{def.displayOnly ? null : rebinding === def.id ? (
										<Button variant="quiet" size="sm" className={action} onClick={() => setRebinding(null)}>
											Cancel
										</Button>
									) : (
										<>
											{overridden(def.id) && (
												<Button variant="quiet" size="sm" className={action} onClick={() => resetOne(def.id)} data-testid={`kbd-reset-${def.id}`}>
													Reset
												</Button>
											)}
											<Button variant="quiet" size="sm" className={action} onClick={() => setRebinding(def.id)} data-testid={`kbd-rebind-${def.id}`}>
												Change
											</Button>
										</>
									)}
								</span>
							</SettingsRow>
						))}
					</SettingsGroup>
				);
			})}
			<div className="flex justify-end">
				<Button variant="quiet" size="sm" className={action} onClick={resetAll} data-testid="kbd-reset-all">
					Reset all to defaults
				</Button>
			</div>
		</>
	);
}
