/**
 * Where the browser should look for the API and the agent.
 *
 * These are baked into the client bundle at build time — `import.meta.env` is
 * substituted by Vite, so nothing can change them afterwards. That makes an
 * unset value a deployment-shaped bug rather than a runtime one, and it is worth
 * failing loudly over.
 *
 * It has already gone wrong once. The production image was built without
 * VITE_API_URL, so every deployed browser fell back to `http://localhost:8000`
 * and asked the reader's own machine for the knowledge base. Pages rendered
 * empty because the loaders caught the failure, and navigation stalled for
 * seconds: a page served from a public origin asking for a localhost resource is
 * a private-network request, which Chrome preflights before refusing.
 *
 * Nothing in the app could tell. Every symptom pointed somewhere else.
 */

/**
 * Reads a build-time URL, treating blank as absent.
 *
 * `??` alone is not enough. An unset Docker `ARG` becomes an empty string
 * rather than undefined, so `import.meta.env.VITE_API_URL ?? fallback` would
 * yield "" — and a base of "" turns every call into a same-origin relative path
 * that 404s against the web server. That failure is quieter than the one it
 * replaces.
 */
export function serviceUrl(configured: string | undefined, devFallback: string): string {
  const trimmed = (configured ?? "").trim();
  if (trimmed) return trimmed.replace(/\/$/, "");

  if (import.meta.env.PROD) {
    // Loud on purpose. A production bundle pointed at localhost looks like a
    // working app with an empty database, which costs far more to diagnose than
    // a message naming the variable.
    throw new Error(
      "This build has no service URL configured, so it would ask the visitor's own machine for data. " +
        "Set VITE_API_URL and VITE_MASTRA_URL when building — see apps/web/Dockerfile.",
    );
  }

  return devFallback.replace(/\/$/, "");
}
