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
 * - Left section nav in the sidebar's row anatomy (NavRow), text-only, no
 *   icons, matching the minimal-color doctrine.
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
	useState,
} from "react";
import {
	CURRENT_SETTINGS_VERSION,
	type AgentSettings,
	type AppearanceSettings,
	type UserSettings,
} from "@/src/core";
import { useAppearance } from "./appearance.tsx";
import { SettingsGroup, SettingsRow, SettingsSection } from "./controls.tsx";
import { AgentSection } from "./agent-section.tsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notifySettingsSaved } from "@/components/settings-signal";
import { ClaudeConnectionRow } from "./claude-connection.tsx";
import { Hint } from "@/components/ui/hint";
import { AppearanceSection } from "./appearance-section.tsx";
import { KeyboardSection } from "./keyboard-section.tsx";
import { NavRow, NavRowLabel } from "@/components/nav/nav-row";
import { NavSection } from "@/components/nav/nav-section";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/** Owner (2026-09-20): hints earn their place — mechanics-explaining
 *  prose is out; only the keyboard note stays (storage location is a
 *  real question users ask). */
const SECTIONS = [
	{ id: "keys", label: "Accounts" },
	{ id: "agent", label: "Tutor" },
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
		<DialogContext.Provider value={{ open }}>
			{children}
			{show && (
				<SettingsDialog onClose={() => setShow(false)} initialSection={landOn} />
			)}
		</DialogContext.Provider>
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
	// The frame (spec: settings.md): one raised surface, the section list on
	// the left, the section's grouped rows on the right. The Radix dialog
	// owns Esc, the backdrop and focus.
	return (
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
	);
}

/** The dialog's inside without the Radix portal — the SSR-testable frame
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

	/** ONE writer for the whole dialog: PUT the whole section, keep the
	 *  record mirror in sync, surface route errors inline (a 400 is a
	 *  schema mistake caught by the validation surface). */
	const write = useCallback(
		async (
			section: "agent" | "appearance",
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
			// Server truth, never the request body: the record the route
			// stored is what the surfaces show.
			const stored = (
				(await res.json().catch(() => null)) as { settings?: UserSettings } | null
			)?.settings;
			setRecord(
				(prev) =>
					stored ?? ({ ...(prev ?? {}), [section]: body }) as UserSettings,
			);
			notifySettingsSaved(section);
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
							className="mx-6 mt-6 text-row text-danger"
							data-testid="settings-error"
						>
							{error}
						</p>
					)}
					{record === undefined ? (
						<p className="px-6 py-6 text-row text-muted-foreground">
							Loading settings…
						</p>
					) : record === null ? (
						<p className="px-6 py-6 text-row text-muted-foreground">
							Settings could not be loaded — refresh to retry.
						</p>
					) : (
						<div>
							{active === "general" && (
								<SettingsSection
									title="General"
									testid="section-general"
								>
									<SettingsGroup label="About">
										<SettingsRow label="Version" testid="row-version">
											<span className="text-row tabular-nums text-muted-foreground">{APP_VERSION || "unknown"}</span>
										</SettingsRow>
									</SettingsGroup>
								</SettingsSection>
							)}
							{active === "keys" && (
								<SettingsSection title="Accounts" testid="section-keys">
									<SettingsGroup label="Subscriptions" testid="group-subscriptions">
										<ClaudeConnectionRow />
									</SettingsGroup>
								</SettingsSection>
							)}
							{active === "agent" && (
								<SettingsSection
									title="Tutor"
									testid="section-agent"
								>
									<AgentSection
										agent={record.agent}
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
				<div className="min-w-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="settings-content">
					{sections}
				</div>
			</TabsContent>
		</Tabs>
	);
}
