/** A page under the window's band as the course page and a topic page draw
 *  it (`WindowPage`, `PageFrame`, `PageHead` with the course head's
 *  Mistakes and a Context press), inside the app's frame, for a real
 *  browser. Bundled by tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FolderOpenIcon } from "lucide-react";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider, type NotifySource } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { WindowPage } from "@/components/page-frame/window-page";
import { PageFrame, PageHead } from "@/components/page-frame/page-frame";
import { MistakesHead, MistakesPress } from "@/components/course-page/standing/mistakes-press";
import type { MistakeRow } from "@/components/course-page/standing/standing-model";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const quiet = (): NotifySource => ({ onEvent() {}, onOpen() {}, close() {} });
const row = {
	topic: { handle: "rank", title: "Rank and the column space" },
	slip: "confident",
	words: "Subtracted the rank from the number of rows.",
	when: "Today",
	helped: false,
	hint: null,
	arc: null,
	resume: null,
	creation: {},
	workspace: "/study/la",
	href: "/unit/la/rank",
} as unknown as MistakeRow;

createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<ServerEventsProvider connect={quiet}>
			<TooltipProvider>
				<AppearanceProvider>
					<SidebarProvider initial={{ open: true, width: 256 }}>
						<ActivityProvider>
							<AppShell>
								<WindowPage data-testid="window-page">
									<PageFrame>
										<MistakesHead>
											<PageHead
												compact
												title="Linear Algebra"
												actions={
													<>
														<MistakesPress rows={[row]} />
														<Button variant="quiet" size="row" data-slot="course-context">
															<FolderOpenIcon aria-hidden />
															Context
														</Button>
													</>
												}
											/>
										</MistakesHead>
									</PageFrame>
								</WindowPage>
							</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</TooltipProvider>
		</ServerEventsProvider>
	</AppRouterContext.Provider>,
);
