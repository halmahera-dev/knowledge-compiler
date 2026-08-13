export const wikiKeys = {
	pages: (q?: string) => ["wiki", "pages", q ?? ""] as const,
	page: (slug: string) => ["wiki", "page", slug] as const,
};
