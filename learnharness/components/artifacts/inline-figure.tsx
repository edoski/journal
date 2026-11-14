"use client";

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DownloadIcon, MaximizeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { ChatActionsContext } from "@/components/chat";
import { useSessionMermaid } from "@/components/session-overlay";
import { downloadFile, slugFilename } from "@/components/artifacts/download";
import { InvertDiscIcon } from "@/components/artifacts/invert-disc";
import { FIGURE_ON_DARK } from "@/components/artifacts/figure-on-dark";
import { DemoErrorChip, INITIAL_DEMO_BRIDGE_STATE, reduceDemoBridgeState, type DemoBridgeState } from "@/components/artifacts/demo-card";
import { SvgImage } from "@/components/artifacts/svg-image";
import { svgNaturalWidth } from "@/components/artifacts/visual-card";
import type { DemoResult, VisualResult } from "@/src/core";

/**
 * A tutor's figure or demo in the flow of his reply (spec: inline-figure.md):
 * at column width, no border, no caption, the app's dark colours, its height
 * its content's, and its few controls only while pointed at. The lesson
 * draws these in place of the visual and demo cards.
 */

/** The app's tokens a demo may use, handed to it as `:root` variables. */
const THEME_TOKENS = ["--foreground", "--muted-foreground", "--card", "--muted", "--border", "--primary", "--primary-foreground", "--accent", "--ring", "--danger", "--success", "--warning", "--font-sans", "--radius"] as const;

/** The `:root` block for a demo: the app's resolved tokens, a transparent
 *  page in the lesson's text colour and face, and dark form controls. Pure:
 *  `read` resolves one token (the document's computed style in the app). */
export function demoThemeStyle(read: (token: string) => string): string {
	const vars = THEME_TOKENS.map((token) => [token, read(token).trim()] as const)
		.filter(([, value]) => value)
		.map(([token, value]) => `${token}:${value};`)
		.join("");
	return `<style data-lh-theme>:root{color-scheme:dark;--background:transparent;${vars}}html,body{margin:0;background:transparent;color:var(--foreground);font-family:var(--font-sans,system-ui);font-size:16px;line-height:1.6}</style>`;
}

/** Tells the lesson the demo's height, any error, and whether it painted its
 *  own light page (an older demo drawn for white), so the lesson can turn
 *  that page dark. Never the model's job: injected into every demo. */
export const INLINE_BRIDGE_SCRIPT = `<script>(function(){
var send=function(m){try{parent.postMessage(m,"*")}catch(e){}};
var light=function(){var els=[document.body,document.documentElement];for(var i=0;i<els.length;i++){var el=els[i];if(!el)continue;var c=getComputedStyle(el).backgroundColor;var m=c&&c.match(/[\\d.]+/g);if(!m||m.length<3)continue;if(m.length>3&&+m[3]===0)continue;return (0.2126*m[0]+0.7152*m[1]+0.0722*m[2])/255>0.5}return false};
var post=function(){var b=document.body;var h=b?Math.max(b.scrollHeight,b.getBoundingClientRect().height):document.documentElement.scrollHeight;if(b){var cs=getComputedStyle(b);h+=(parseFloat(cs.marginTop)||0)+(parseFloat(cs.marginBottom)||0)}send({type:"demo-resize",height:Math.ceil(h)});send({type:"demo-page",light:light()})};
if(typeof ResizeObserver!=="undefined"){new ResizeObserver(post).observe(document.documentElement)}
window.addEventListener("resize",post);window.addEventListener("load",post);
window.addEventListener("error",function(e){send({type:"demo-error",message:e.message||String(e)})});
setTimeout(post,50);setTimeout(post,400);
})();</script>`;

/** The demo's document: the theme first, so the demo's own styles win, and
 *  the bridge last. Pure. */
export function buildInlineSrcDoc(html: string, theme: string): string {
	const themed = /<head[^>]*>/i.test(html)
		? html.replace(/<head[^>]*>/i, (head) => `${head}${theme}`)
		: /<html[^>]*>/i.test(html)
			? html.replace(/<html[^>]*>/i, (open) => `${open}<head>${theme}</head>`)
			: `${theme}${html}`;
	return /<\/body>/i.test(themed) ? themed.replace(/<\/body>/i, `${INLINE_BRIDGE_SCRIPT}</body>`) : `${themed}${INLINE_BRIDGE_SCRIPT}`;
}

/** Whether a bridge message says the demo painted a light page. */
export function demoPageLight(data: unknown): boolean | null {
	if (typeof data !== "object" || data === null) return null;
	const message = data as { type?: unknown; light?: unknown };
	return message.type === "demo-page" && typeof message.light === "boolean" ? message.light : null;
}

/** The figure's frame: the content, and its controls in the top-right
 *  corner while pointed at or focused. */
function FigureFrame({ testId, controls, children, className }: { testId: string; controls: ReactNode; children: ReactNode; className?: string }) {
	return (
		<figure data-testid={testId} data-slot="inline-figure" className={`group/figure relative my-2 w-full ${className ?? ""}`}>
			{children}
			<div className="absolute top-1 right-1 flex items-center gap-0.5 rounded-md bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover/figure:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
				{controls}
			</div>
		</figure>
	);
}

function Control({ label, onClick, testId, pressed, children }: { label: string; onClick: () => void; testId: string; pressed?: boolean; children: ReactNode }) {
	return (
		<Hint label={label}>
			<Button variant="quiet" size="icon-inline" aria-label={label} aria-pressed={pressed} data-testid={testId} onClick={onClick} className={pressed ? "text-foreground" : undefined}>
				{children}
			</Button>
		</Hint>
	);
}

/** Saves the invert switch on the steer record, as the cards do. */
function useInvert(initial: boolean | undefined, messageId: string | undefined) {
	const actions = useContext(ChatActionsContext);
	const [chosen, setChosen] = useState<boolean | undefined>(initial);
	const choose = (next: boolean) => {
		setChosen(next);
		if (!actions?.chatId || !messageId) return;
		void fetch(`/api/chats/${actions.chatId}/artifact-ui`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ input: { messageId, inverted: next } }),
		}).catch(() => {});
	};
	return [chosen, choose] as const;
}

function FigureFailed({ testId, words }: { testId: string; words: string }) {
	return <p data-testid={testId} className="lh-prose text-muted-foreground">{words}</p>;
}

/** A demo in the flow: a sandboxed frame that runs its code, never the
 *  app's storage, cookies or DOM. */
export function InlineDemo({ output, messageId, initialInverted }: { output: unknown; messageId?: string; initialInverted?: boolean }) {
	const result = output as DemoResult | undefined;
	if (!result || typeof result.html !== "string" || typeof result.title !== "string") return <FigureFailed testId="inline-demo-failed" words="The demo was built, but it could not be shown." />;
	if (result.html.length === 0) return <FigureFailed testId="inline-demo-failed" words={result.notes ?? "The demo could not be built."} />;
	return <DemoFrame title={result.title} html={result.html} messageId={messageId} initialInverted={initialInverted} />;
}

function DemoFrame({ title, html, messageId, initialInverted }: { title: string; html: string; messageId?: string; initialInverted?: boolean }) {
	const actions = useContext(ChatActionsContext);
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const [state, setState] = useState<DemoBridgeState>(INITIAL_DEMO_BRIDGE_STATE);
	const [light, setLight] = useState(false);
	const [chosen, choose] = useInvert(initialInverted, messageId);
	// A light page turns dark unless he chose otherwise.
	const inverted = chosen ?? light;
	const [theme, setTheme] = useState<string | null>(null);
	useEffect(() => {
		const style = getComputedStyle(document.documentElement);
		setTheme(demoThemeStyle((token) => style.getPropertyValue(token)));
	}, []);
	const srcDoc = useMemo(() => (theme === null ? null : buildInlineSrcDoc(html, theme)), [html, theme]);
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
			setState((prev) => reduceDemoBridgeState(prev, event.data));
			const page = demoPageLight(event.data);
			if (page !== null) setLight(page);
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);
	return (
		<FigureFrame
			testId="inline-demo"
			controls={
				<>
					<Control label="Invert colours" testId="inline-demo-invert" pressed={inverted} onClick={() => choose(!inverted)}>
						<InvertDiscIcon className="size-3.5" />
					</Control>
					<Control label="Download as HTML" testId="inline-demo-download" onClick={() => downloadFile(`${slugFilename(title)}.html`, html, "text/html")}>
						<DownloadIcon />
					</Control>
				</>
			}
		>
			{state.error && (
				<DemoErrorChip title={title} message={state.error} onSend={actions ? () => actions.sendText(`The demo "${title}" threw an error: ${state.error}`) : undefined} />
			)}
			{srcDoc !== null && (
				<iframe
					ref={iframeRef}
					title={title}
					// Scripts only: no same origin, so the demo never reaches the
					// app's storage, cookies or DOM.
					sandbox="allow-scripts"
					srcDoc={srcDoc}
					// The bridge sizes the frame to its content, and a frame that
					// scrolls would trap the wheel over it.
					scrolling="no"
					data-testid="inline-demo-frame"
					className="block w-full border-0 bg-transparent"
					style={{ height: state.height ?? 240, colorScheme: "dark", filter: inverted ? FIGURE_ON_DARK : undefined }}
				/>
			)}
		</FigureFrame>
	);
}

/** A figure in the flow: the maker's SVG, drawn dark lines on white, turned
 *  to the page's own dark unless he switched it back. */
export function InlineVisual({ output, messageId, initialInverted = true }: { output: unknown; messageId?: string; initialInverted?: boolean }) {
	const result = output as VisualResult | undefined;
	const overlay = useSessionMermaid();
	const [chosen, choose] = useInvert(initialInverted, messageId);
	const inverted = chosen ?? true;
	if (!result || typeof result.svg !== "string") return <FigureFailed testId="inline-visual-failed" words="The figure was drawn, but it could not be shown." />;
	if (result.svg.length === 0) return <FigureFailed testId="inline-visual-failed" words={result.notes ?? "The figure could not be drawn."} />;
	return (
		<FigureFrame
			testId="inline-visual"
			controls={
				<>
					<Control label="Invert colours" testId="inline-visual-invert" pressed={inverted} onClick={() => choose(!inverted)}>
						<InvertDiscIcon className="size-3.5" />
					</Control>
					<Control label="Download as SVG" testId="inline-visual-download" onClick={() => downloadFile("figure.svg", result.svg, "image/svg+xml")}>
						<DownloadIcon />
					</Control>
					{overlay && (
						<Control label="Open full-screen" testId="inline-visual-open" onClick={() => overlay.openFigure(result.svg, inverted)}>
							<MaximizeIcon />
						</Control>
					)}
				</>
			}
		>
			<div className="w-full bg-white" style={{ filter: inverted ? FIGURE_ON_DARK : undefined }}>
				{/* A declared width sits at its size, shrunk to fit; a figure
				    with none takes the column. */}
				<SvgImage svg={result.svg} width={svgNaturalWidth(result.svg) ?? undefined} className={svgNaturalWidth(result.svg) === null ? "block h-auto w-full" : "mx-auto block h-auto max-w-full"} />
			</div>
		</FigureFrame>
	);
}
