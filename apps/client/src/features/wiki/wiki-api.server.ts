import "server-only";

import { auth } from "@kc/auth";
import { headers } from "next/headers";
import { API_URL } from "@/lib/api-client";
import type { PageDetail } from "./wiki-api";

/**
 * Reading a page from the server, for `generateMetadata`.
 *
 * The browser client cannot be reused here. It mints its token through
 * `getApiToken()`, which fetches the relative URL `/api/auth/token` against a
 * module-level cache — neither works during a server render, where there is no
 * origin to resolve against and no per-request isolation. So the token is minted
 * from the request's own cookies instead, and the API is called absolutely.
 */
export async function fetchPageForMetadata(
	slug: string,
): Promise<PageDetail | null> {
	try {
		const requestHeaders = await headers();
		const minted = await auth.api.getToken({ headers: requestHeaders });
		const token = minted?.token;
		if (!token) return null;

		const response = await fetch(
			`${API_URL}/api/v1/pages/${encodeURIComponent(slug)}`,
			{ headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
		);
		if (!response.ok) return null;

		return (await response.json()) as PageDetail;
	} catch {
		// A title is decoration; the page itself renders from the browser. Failing
		// here must never take the route down with it — the caller falls back to
		// the generic title.
		return null;
	}
}
