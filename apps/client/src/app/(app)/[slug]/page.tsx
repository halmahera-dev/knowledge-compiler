import { NoteReader } from "@/features/notes/components/notes-desk";

export default async function NoteDetailPage({ params }: PageProps<"/[slug]">) {
	const { slug } = await params;
	return <NoteReader slug={slug} />;
}
