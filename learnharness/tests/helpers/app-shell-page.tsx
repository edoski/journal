/** The app's frame as the root layout draws it (app/layout.tsx), for a real
 *  browser: the sidebar and its rail, an empty page, and the providers they
 *  read. No server: the sidebar's reads fail and it draws its empty state.
 *  `?open=1` opens the sidebar, as its cookie would. Bundled by
 *  tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider, type NotifySource } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import { TooltipProvider } from "@/components/ui/tooltip";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const quiet = (): NotifySource => ({ onEvent() {}, onOpen() {}, close() {} });
const open = new URLSearchParams(location.search).get("open") === "1";

createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<ServerEventsProvider connect={quiet}>
			<TooltipProvider>
				<AppearanceProvider>
					<SidebarProvider initial={{ open, width: 256 }}>
						<ActivityProvider>
							<AppShell>
								<div data-slot="page" className="h-dvh" />
							</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</TooltipProvider>
		</ServerEventsProvider>
	</AppRouterContext.Provider>,
);
