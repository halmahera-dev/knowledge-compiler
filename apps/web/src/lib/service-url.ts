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
    // Complains, but does not throw.
    //
    // Throwing here is what an earlier version did, and it was the wrong call:
    // this runs at module load, so a missing build argument took the whole site
    // down — landing page, sign-in and all — with an opaque 500, for a mistake
    // that had nothing to do with the request being served. The build now
    // refuses to produce such a bundle in the first place (see vite.config.ts),
    // which is where that failure belongs.
    //
    // So this is the last line of defence rather than the first, and its job is
    // to be visible, not fatal. Data-loading fails and says why; everything that
    // does not need the API still works.
    console.error(
      "[knowledge-compiler] No service URL was compiled into this build, so requests " +
        "would go to the visitor's own machine. Rebuild with VITE_API_URL and " +
        "VITE_MASTRA_URL set — see apps/web/Dockerfile.",
    );
  }

  return devFallback.replace(/\/$/, "");
}
