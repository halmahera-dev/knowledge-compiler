import type { Metadata } from "next";
import { WikiPageView } from "@/features/wiki/components/wiki-page-view";
import { fetchPageForMetadata } from "@/features/wiki/wiki-api.server";

/**
 * This is the route people share, so the tab and the link preview should say
 * what the page is rather than repeating the product name. Falls back to the
 * generic title when the page cannot be read — which includes the ordinary case
 * of a link to a workspace the reader is not a member of.
 */
export async function generateMetadata({
	params,
}: PageProps<"/[slug]">): Promise<Metadata> {
	const { slug } = await params;
	const page = await fetchPageForMetadata(slug);
	return page ? { title: page.title, description: page.summary } : {};
}

export default async function NotePage({ params }: PageProps<"/[slug]">) {
	const { slug } = await params;
	return <WikiPageView slug={slug} />;
}
