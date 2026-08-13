"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ensureActiveWorkspace } from "../user-actions";
import { clearApiToken } from "../user-token";

/**
 * Repairs a session that belongs to a workspace but has none selected.
 *
 * Rendered by the app shell only when it sees that state, and it renders
 * nothing itself. Its whole job is to move the write off the server render and
 * into a Server Action, where setting a cookie is legal.
 *
 * Guarded by a ref rather than an empty dependency array: Strict Mode runs the
 * effect twice in development, and two concurrent `setActiveOrganization` calls
 * on the same session is a race with no upside.
 */
export function WorkspaceRepair() {
	const router = useRouter();
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;

		ensureActiveWorkspace().then((repaired) => {
			// Only refresh when something changed — an unconditional refresh on
			// every render of the shell is a loop.
			if (!repaired) return;

			// The cached JWT was minted with workspaceId: null and is good for
			// another ~15 minutes, so without this the session is repaired but
			// every scoped call keeps 409ing until the token happens to expire.
			clearApiToken();
			router.refresh();
		});
	}, [router]);

	return null;
}
