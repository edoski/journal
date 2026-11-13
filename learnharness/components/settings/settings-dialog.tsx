"use client";
/**
 * THE SETTINGS DIALOG (settings-app wave, 2026-09-20): the thin settings
 * page graduated into the designed surface — a centered modal over
 * everything, left section nav + one scrolling content column.
 *
 * Owner decisions this wave:
 * - Dialog, not a page: opens over whatever screen you're on (the payoff:
 *   appearance edits restyle the chat LIVE behind the dialog). Escape,
 *   backdrop, and ✕ all close. Modal-only — /settings redirects, so
 *   nothing links into a dead surface.
 * - Left section nav in the app's mono chrome (text-only, session-list
 *   language — active = bg-accent), no icons, matching the minimal-color
 *   doctrine.
 * - The dialog is surface-agnostic by construction: the sections talk to
 *   /api/settings* and localStorage only, so this shell can be re-mounted
 *   as a true OS window in the Electron round with near-zero churn.
 *
 * The record + the single `write` seam moved here from the thin page:
 * one record instance for the whole dialog, sections write through it,
 * switching sections never refetches.
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import {
	CURRENT_SETTINGS_VERSION,
	type AgentSettings,
	type AppearanceSettings,
	type UserSettings,
} from "@/src/core";
import { useAppearance } from "./appearance.tsx";
import { SettingsGroup, SettingsRow, SettingsSection } from "./controls.tsx";
import { AgentSection } from "./agent-section.tsx";
import type { ModelsSettings } from "@/src/core";
import { MENU_CLOSE_EVENT, MENU_OPEN_EVENT } from "@/components/menu-shell";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notifySettingsSaved, useSettingsSaved } from "@/components/settings-signal";
import { SubscriptionConnections } from "./subscription-connections.tsx";
import { Hint } from "@/components/ui/hint";
import { AppearanceSection } from "./appearance-section.tsx";
import { KeyboardSection } from "./keyboard-section.tsx";
import { ChatGPTUIProvider } from "./chatgpt-connection.tsx";
import { SettingsDesignContext } from "./settings-design";
import { useDesignVariant } from "@/components/design-variant";
import { NavRow, NavRowLabel } from "@/components/nav/nav-row";
import { NavSection } from "@/components/nav/nav-section";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/** Owner (2026-09-20): hints earn their place — mechanics-explaining
 *  prose is out; only the keyboard note stays (storage location is a
 *  real question users ask). */
const SECTIONS = [
	{ id: "keys", label: "Accounts" },
	{ id: "agent", label: "Agent" },
	{ id: "appearance", label: "Appearance" },
	{ id: "keyboard", label: "Keyboard", hint: "Stored on this device" },
	{ id: "general", label: "General" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const APP_VERSION = process.env.LH_VERSION ?? "";

const DialogContext = createContext<{ open: (section?: string) => void }>({ open: () => {} });

/** AppShell-level mount: the sidebar row and the mod+, chord call this.
 *  `open(section)` lands the dialog on a specific section (the first-run
 *  setup flow deep-links to Providers when no subscription is signed in). */
export function SettingsDialogProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [show, setShow] = useState(false);
	const [landOn, setLandOn] = useState<SectionId>("keys");
	const open = useCallback((section?: string) => {
		setLandOn(section ? section as SectionId : "keys");
		setShow(true);
	}, []);
	return (
		<ChatGPTUIProvider><DialogContext.Provider value={{ open }}>
			{children}
			{show && (
				<SettingsDialog onClose={() => setShow(false)} initialSection={landOn} />
			)}
		</DialogContext.Provider></ChatGPTUIProvider>
	);
}

export function useSettingsDialog() {
	return useContext(DialogContext);
}

function SettingsDialog({
	onClose,
	initialSection,
}: {
	onClose: () => void;
	initialSection: SectionId;
}) {
	const backdropDismiss = useBackdropDismiss(onClose);
	const design = useDesignVariant();
	if (design === "proposed") {
		// The Proposed frame (spec: settings.md): one raised surface, the
		// section list on the left, the section's grouped rows on the right.
		return (
			<SettingsDesignContext.Provider value="proposed">
				<Dialog open onOpenChange={(open) => !open && onClose()}>
					<DialogContent
						aria-describedby={undefined}
						data-testid="settings-dialog"
						className="h-[792px] max-h-[90vh] w-[880px] max-w-[90vw] flex-row gap-0 overflow-hidden p-0"
					>
						<DialogTitle className="sr-only">Settings</DialogTitle>
						<SettingsDialogBody onClose={onClose} initialSection={initialSection} />
					</DialogContent>
				</Dialog>
			</SettingsDesignContext.Provider>
		);
	}
	// Plain dim backdrop (no blur — nothing decorative); a genuine
	// backdrop click closes, the dialog body stops propagation.
	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-background/80"
			data-testid="settings-backdrop"
			{...backdropDismiss}
		>
			<SettingsDialogBody onClose={onClose} initialSection={initialSection} />
		</div>,
		document.body,
	);
}

/** The dialog without the portal/backdrop — the SSR-testable frame
 *  (portals render nothing under renderToStaticMarkup). */
export function SettingsDialogBody({
	onClose,
	initialSection = "keys",
}: {
	onClose: () => void;
	initialSection?: SectionId;
}) {
	const { onAppearanceChange } = useAppearance();
	const [record, setRecord] = useState<UserSettings | null | undefined>(
		undefined,
	);
	const [error, setError] = useState<string | null>(null);
	// MenuShell open-count — drives the content column's scroll lock.
	const [openMenus, setOpenMenus] = useState(0);
	const contentRef = useRef<HTMLDivElement | null>(null);
	// Scroll-lock (fix wave, owner ruling: the scrollbar MAY stay,
	// scrolling must NOT happen, nothing may move): the content column
	// keeps overflow-y-auto — the scrollbar and every width stay exactly
	// as they are — and while any MenuShell is open, non-passive wheel +
	// touchmove listeners on the column preventDefault. React attaches
	// synthetic wheel/touch passively at the root, so this needs the
	// native-listener ref seam.
	useEffect(() => {
		const el = contentRef.current;
		if (!el || openMenus === 0) return;
		const block = (e: Event) => e.preventDefault();
		el.addEventListener("wheel", block, { passive: false });
		el.addEventListener("touchmove", block, { passive: false });
		return () => {
			el.removeEventListener("wheel", block);
			el.removeEventListener("touchmove", block);
		};
	}, [openMenus]);

	useEffect(() => {
		const onOpen = () => setOpenMenus((n) => n + 1);
		const onClose = () => setOpenMenus((n) => Math.max(0, n - 1));
		window.addEventListener(MENU_OPEN_EVENT, onOpen);
		window.addEventListener(MENU_CLOSE_EVENT, onClose);
		return () => {
			window.removeEventListener(MENU_OPEN_EVENT, onOpen);
			window.removeEventListener(MENU_CLOSE_EVENT, onClose);
		};
	}, []);
	const [active, setActive] = useState<SectionId>(initialSection);
	// A deep-link fired while the dialog is ALREADY open (first exercised by
	// the wave-6 embedding picker's "Add a provider key first…" link — the
	// picker itself died with wave 7, the mechanism is general) changes
	// initialSection under our feet — follow it, or the link silently does
	// nothing.
	useEffect(() => {
		setActive(initialSection);
	}, [initialSection]);

	// Fetch once per dialog mount. 200 {settings: null} is FIRST BOOT
	// (no record = factory everything), not a failure — the error state is
	// a non-200 or a network throw only.
	useEffect(() => {
		fetch("/api/settings")
			.then((r) =>
				r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)),
			)
			.then((body: { settings: UserSettings | null }) =>
				setRecord(body.settings ?? { version: CURRENT_SETTINGS_VERSION }),
			)
			.catch(() => setRecord(null));
	}, []);

	// A models write from outside this dialog's own writer (Claude's "Use for
	// all roles" on the Providers page) must reach the mirror, or the Agent
	// tab would compose its next slot write from stale siblings.
	const announcing = useRef(false);
	useSettingsSaved((section) => {
		if (section !== "models" || announcing.current) return;
		fetch("/api/settings")
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
			.then((body: { settings: UserSettings | null }) =>
				setRecord((prev) => (prev ? { ...prev, models: body.settings?.models } : prev)),
			)
			.catch(() => {});
	});

	// Escape closes — the layered-dismiss convention (Esc is dead for the
	// sections' own editors while they hold focus; this listener is the
	// dialog's outer layer).
	const proposed = useDesignVariant() === "proposed";
	useEffect(() => {
		// Proposed: the Radix dialog claims its Esc itself.
		if (proposed) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): claim
				// at the document level — the window chain (abort) must
				// not also act. One Esc, one action.
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose, proposed]);

	/** ONE writer for the whole dialog: PUT the whole section, keep the
	 *  record mirror in sync, surface route errors inline (a 400 is a
	 *  schema mistake caught by the validation surface). */
	const write = useCallback(
		async (
			section: "agent" | "models" | "appearance",
			body: object,
		) => {
			setError(null);
			const res = await fetch(`/api/settings/${section}`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const detail = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				setError(`${section}: ${detail.error ?? res.status}`);
				return;
			}
			// Server truth, never the request body (fix wave, owner repro):
			// the models section clamps pinned thinking levels on write
			// (bd68486) — a swap that rides an unsupported level lands
			// CLAMPED in the record, and the writing surface must show the
			// stored value in this same interaction, not the optimistic one.
			const stored = (
				(await res.json().catch(() => null)) as { settings?: UserSettings } | null
			)?.settings;
			setRecord(
				(prev) =>
					stored ?? ({ ...(prev ?? {}), [section]: body }) as UserSettings,
			);
			announcing.current = true;
			try {
				notifySettingsSaved(section);
			} finally {
				announcing.current = false;
			}
			if (section === "appearance")
				onAppearanceChange(body as AppearanceSettings);
		},
		[onAppearanceChange],
	);

	const sections = (
		<>
					{error && (
						<p
							role="alert"
							className={proposed ? "mx-6 mt-6 text-row text-danger" : "m-4 rounded-sm border border-red-500/40 px-3 py-2 text-xs text-red-500"}
							data-testid="settings-error"
						>
							{error}
						</p>
					)}
					{record === undefined ? (
						<p className={proposed ? "px-6 py-6 text-row text-muted-foreground" : "px-6 py-5 text-xs text-muted-foreground/70"}>
							Loading settings…
						</p>
					) : record === null ? (
						<p className={proposed ? "px-6 py-6 text-row text-muted-foreground" : "px-6 py-5 text-xs text-muted-foreground/70"}>
							Settings could not be loaded — refresh to retry.
						</p>
					) : (
						<div>
							{active === "general" && (
								<SettingsSection
									title="General"
									testid="section-general"
								>
									{proposed ? (
										<SettingsGroup label="About">
											<SettingsRow label="Version" testid="row-version">
												<span className="text-row tabular-nums text-muted-foreground">{APP_VERSION || "unknown"}</span>
											</SettingsRow>
										</SettingsGroup>
									) : (
										<SettingsRow label={`Version ${APP_VERSION || "unknown"}`} testid="row-version">{null}</SettingsRow>
									)}
								</SettingsSection>
							)}
							{active === "keys" && (
								<SettingsSection title="Accounts" testid="section-keys">
									<SettingsGroup label="Subscriptions" testid="group-subscriptions">
										<SubscriptionConnections />
									</SettingsGroup>
								</SettingsSection>
							)}
							{active === "agent" && (
								<SettingsSection
									title="Agent"
									testid="section-agent"
								>
									<AgentSection
										agent={record.agent}
										models={record.models}
										onModelsChange={(next: ModelsSettings) =>
											void write("models", next)
										}
										onSectionChange={(next: AgentSettings) =>
											void write("agent", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "appearance" && (
								<SettingsSection
									title="Appearance"
									testid="section-appearance"
								>
									<AppearanceSection
										appearance={record.appearance}
										onSectionChange={(next: AppearanceSettings) =>
											void write("appearance", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "keyboard" && (
								<SettingsSection
									title="Keyboard"
									hint="Stored on this device"
									testid="section-keyboard"
								>
									<KeyboardSection />
								</SettingsSection>
							)}
						</div>
					)}
		</>
	);

	if (proposed) {
		// Inside the dialog's content (SettingsDialog): the section list in
		// the sidebar's row anatomy, the pane, a quiet ✕ in the corner.
		return (
				<Tabs orientation="vertical" value={active} onValueChange={(v) => setActive(v as SectionId)} className="contents">
				<nav aria-label="Settings sections" data-testid="settings-nav" className="flex w-52 shrink-0 flex-col border-r p-2">
					<NavSection title="Settings">
						<TabsList variant="line" className="w-full">
							{SECTIONS.map((s) => (
								<TabsTrigger key={s.id} value={s.id} asChild>
									<NavRow data-testid={`settings-nav-${s.id}`} active={active === s.id}>
										<NavRowLabel>{s.label}</NavRowLabel>
									</NavRow>
								</TabsTrigger>
							))}
						</TabsList>
					</NavSection>
				</nav>
				<TabsContent value={active} className="relative flex min-w-0 flex-1 flex-col">
					<Hint label="Close" binding="escape" side="left">
						<Button
							variant="quiet"
							size="icon-row"
							aria-label="Close settings"
							data-testid="settings-close"
							onClick={onClose}
							className="absolute right-3 top-3 z-10"
						>
							<XIcon />
						</Button>
					</Hint>
					<div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="settings-content">
						{sections}
					</div>
				</TabsContent>
				</Tabs>
		);
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
			data-testid="settings-dialog"
			className="settings-dialog-pop flex h-[620px] max-h-[85vh] w-[920px] max-w-[90vw] flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl"
			onClick={(e) => e.stopPropagation()}
		>
			{/* Header — the app's quiet CMU title language. */}
			<header className="flex h-15 shrink-0 items-center gap-3 border-b border-border px-5">
				<h2 className="font-title text-2xl tracking-tight">Settings</h2>
				<Hint
						// Esc closes the dialog (its own listener) — surface it.
						label="Close"
						binding="escape"
						side="left"
					>
						<button
					type="button"
					aria-label="Close settings"
					data-testid="settings-close"
					className="ml-auto size-7 rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onClick={onClose}
				>
					<svg
						viewBox="0 0 16 16"
						className="mx-auto size-3.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
					>
						<path d="M4 4l8 8M12 4l-8 8" />
					</svg>
				</button>
					</Hint>
			</header>

			<div className="flex min-h-0 flex-1">
				{/* Left nav — text-only, the session-list mono language,
					    active = bg-accent. */}
				<nav
					aria-label="Settings sections"
					data-testid="settings-nav"
					className="flex w-44 shrink-0 flex-col gap-1 border-r border-border p-2"
				>
					{SECTIONS.map((s) => (
						<button
							key={s.id}
							type="button"
							data-testid={`settings-nav-${s.id}`}
							aria-current={active === s.id}
							className={`rounded-sm px-3 py-1.5 text-left font-ui text-sm transition-colors ${
								active === s.id
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-foreground"
							}`}
							onClick={() => setActive(s.id)}
						>
							{s.label}
						</button>
					))}
				</nav>

				{/* Content column — one section at a time, this scrolls — and
				    LOCKS while any MenuShell is open (owner ruling: no
				    scrolling with a dropdown down; MenuShell announces
				    open/close, the count keeps overlap honest). The lock
				    intercepts wheel/touch instead of hiding the scrollbar —
				    nothing may shift when the lock engages. */}
				<div
					ref={contentRef}
					className="min-w-0 flex-1 overflow-y-auto"
					data-testid="settings-content"
				>
					{sections}
				</div>
			</div>
		</div>
	);
}
