import { redirect } from "next/navigation";

/** The course map lives on Home: an old link or shortcut to `/knowledge` lands there. */
export default function KnowledgePage() {
	redirect("/");
}
