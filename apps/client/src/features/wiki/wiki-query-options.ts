import { queryOptions } from "@tanstack/react-query";
import { fetchPage, fetchPages } from "@/features/wiki/wiki-api";
import { wikiKeys } from "@/features/wiki/wiki-cache";
import { retryUnlessSignedOut } from "@/lib/api-client";

export function pagesQueryOptions(q?: string) {
	return queryOptions({
		queryKey: wikiKeys.pages(q),
		queryFn: () => fetchPages(q),
		retry: retryUnlessSignedOut,
	});
}

export function pageQueryOptions(slug: string) {
	return queryOptions({
		queryKey: wikiKeys.page(slug),
		queryFn: () => fetchPage(slug),
		retry: retryUnlessSignedOut,
	});
}
