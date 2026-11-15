/** React's renderers, wrapped in the providers the app root gives every page
 *  (app/layout.tsx): one TooltipProvider, so a component with a hint renders
 *  in a test as it does in the app. */
import React from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { createRoot as createReactRoot, type Root, type RootOptions } from "react-dom/client";
import { TooltipProvider } from "../../components/ui/tooltip.tsx";

const app = (node: React.ReactNode) => <TooltipProvider>{node}</TooltipProvider>;

export function renderToStaticMarkup(node: React.ReactNode): string {
	return renderMarkup(app(node));
}

export function createRoot(container: Element | DocumentFragment, options?: RootOptions): Root {
	const root = createReactRoot(container, options);
	return { render: (node: React.ReactNode) => root.render(app(node)), unmount: () => root.unmount() };
}

export type { Root };
