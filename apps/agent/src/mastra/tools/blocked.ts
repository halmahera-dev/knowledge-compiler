/**
 * Turning an API status into a sentence the reader can act on.
 *
 * Shared by every copilot tool rather than written per tool: the API's own
 * `detail` is addressed to a developer, and two tools explaining 401 in two
 * different ways would make the same problem look like two problems.
 */
export function explain(status: number): string {
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have access to this workspace.";
  if (status === 409)
    return "No workspace is selected. Create or choose one, then try again.";
  if (status === 429)
    return "This workspace has hit its hourly limit. Try again in a little while.";
  return "That could not be done right now.";
}
