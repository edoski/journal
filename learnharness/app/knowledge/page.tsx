import { KnowledgeView } from "@/components/knowledge-view";
import { readSettingsRecord } from "@/src/server";
import { resolveSettings } from "@/src/core";

// Dynamic: the graph-rendering setting is re-read on every visit, as home does.
export const dynamic = "force-dynamic";

/** The course content view: the knowledge graph (or, with graph rendering
 *  off, the chains view) with its search, chain table and notes import. */
export default function KnowledgePage() {
	return <KnowledgeView rendering={resolveSettings(readSettingsRecord() ?? null).graph.rendering} />;
}
