/**
 * Carries a new chat's first message across the navigation from `/agent` to
 * `/agent/[id]`, so the thread page can send it instead of refetching a
 * thread that doesn't exist on the server yet. Backed by sessionStorage so
 * it survives a refresh while the reply is still in flight.
 */
const prefix = "kc:pending-message:";

export function setPendingMessage(threadId: string, text: string) {
	sessionStorage.setItem(prefix + threadId, text);
}

export function hasPendingMessage(threadId: string): boolean {
	if (typeof window === "undefined") return false;
	return sessionStorage.getItem(prefix + threadId) !== null;
}

export function takePendingMessage(threadId: string): string | undefined {
	const key = prefix + threadId;
	const value = sessionStorage.getItem(key);
	if (value !== null) sessionStorage.removeItem(key);
	return value ?? undefined;
}
