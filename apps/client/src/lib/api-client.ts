/**
 * The one way this app talks to the Python API.
 *
 * Shared rather than repeated per feature: every call needs the same bearer
 * token, the same base URL, and the same treatment of a 401. Four copies of
 * that would drift, and the copy that drifts is the one that stops sending the
 * token — which fails as an empty page rather than as an error.
 *
 * Scoping is structural. The workspace comes from the reader's own token, so
 * nothing here names one and there is nothing for a caller to point elsewhere.
 */
import { getApiToken } from "@/features/user/user-token";

/**
 * Where the Python API lives.
 *
 * Checked for a usable value rather than a defined one: `NEXT_PUBLIC_*` is
 * substituted at build time, and an unset variable is baked in as `""`, which
 * `??` sails straight past. The retired app shipped exactly that — every
 * deployed browser tried to reach the visitor's own machine on :8000.
 */
function resolveApiUrl(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured) return configured.replace(/\/$/, "");

	if (process.env.NODE_ENV === "production") {
		console.error(
			"NEXT_PUBLIC_API_URL is not set. Requests will go to the visitor's own " +
				"machine. Rebuild with it set to the deployed API origin.",
		);
	}
	return "http://localhost:8000";
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/**
 * True when the failure is "you are signed out" rather than a broken service.
 *
 * Structural rather than `instanceof ApiError`: the copilot talks to a second
 * service through its own error class, and an identity check silently excluded
 * it — a Mastra 401 was retried twice before the sign-in prompt appeared, and
 * `QueryError` classified it as "the API did not answer".
 */
export function isSignedOut(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		(error as { status: unknown }).status === 401
	);
}

async function send(path: string, init?: RequestInit): Promise<Response> {
	const token = await getApiToken();
	if (!token) throw new ApiError("Sign in to continue.", 401);

	const response = await fetch(`${API_URL}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			...init?.headers,
		},
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new ApiError(
			`${init?.method ?? "GET"} ${path} failed with ${response.status}: ${body.slice(0, 200)}`,
			response.status,
		);
	}

	return response;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await send(path, init);
	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

/**
 * A multipart POST, for the one endpoint that takes a file.
 *
 * Content-Type is deliberately left unset so the browser can add the multipart
 * boundary; setting it by hand produces a body the server cannot parse.
 */
export async function upload<T>(path: string, form: FormData): Promise<T> {
	const token = await getApiToken();
	if (!token) throw new ApiError("Sign in to continue.", 401);

	const response = await fetch(`${API_URL}${path}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		body: form,
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new ApiError(
			`POST ${path} failed with ${response.status}: ${body.slice(0, 200)}`,
			response.status,
		);
	}

	return (await response.json()) as T;
}

/**
 * Retry policy shared by every query here.
 *
 * Signed out is a stable answer, not a transient failure — retrying it only
 * delays the sign-in prompt behind three doomed requests.
 */
export function retryUnlessSignedOut(failureCount: number, error: unknown) {
	return isSignedOut(error) ? false : failureCount < 2;
}
