import { StudyHome } from "@/components/study-home/study-home";

// Dynamic: every navigation re-reads the page (dynamic routes aren't
// cached client-side).
export const dynamic = "force-dynamic";

export default function HomePage() {
	return <StudyHome />;
}
