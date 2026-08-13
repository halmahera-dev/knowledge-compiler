/**
 * Better Auth's OpenTelemetry import must resolve to a real module.
 *
 * The production failure this pins: every authenticated request 500'd with
 * "Cannot read properties of undefined (reading 'getTracer')".
 *
 * Better Auth wraps each auth endpoint in a span and reaches for the telemetry
 * API like this:
 *
 *     import("@opentelemetry/api").then(m => api = m).catch(() => undefined)
 *     return api ?? noopOpenTelemetryAPI
 *
 * which handles the package being absent — the import rejects, `api` stays
 * undefined, and the no-op stands in. It does not handle the third case, and
 * the bundler produces exactly that third case: with the package uninstalled,
 * Rollup could not resolve the specifier and emitted a 47-byte stub exporting
 * `default: {}` instead. The import then *succeeded* with an empty namespace,
 * so `api` was truthy, the no-op was skipped, and destructuring `trace` off it
 * gave undefined.
 *
 * A module that is absent is safe. A module that is present and empty is not,
 * and nothing in the auth path could tell the difference.
 *
 * Dev never saw it: there the specifier is resolved by Node at runtime, the
 * import genuinely rejects, and the catch does its job. Only the bundled build
 * turned a clean failure into a broken success.
 */
import { describe, expect, it } from "vitest";

describe("@opentelemetry/api", () => {
  it("resolves, so the bundler has something real to emit", async () => {
    // If this throws, the package is missing and the production build will
    // quietly stub it again.
    const otel = await import("@opentelemetry/api");
    expect(otel).toBeDefined();
  });

  it("exposes the two names Better Auth destructures", async () => {
    // `withSpan` reads `trace`; `endSpanWithError` reads `SpanStatusCode`. Both
    // were undefined in production, and both are on the same module — so a stub
    // that satisfies one and not the other is not a passing state.
    const { trace, SpanStatusCode } = await import("@opentelemetry/api");
    expect(typeof trace?.getTracer).toBe("function");
    expect(SpanStatusCode?.ERROR).toBeDefined();
  });

  it("returns a usable tracer with no provider registered", async () => {
    // Nothing registers an SDK here, and nothing should have to. The API's own
    // default is a no-op tracer, which is the behaviour this project wants —
    // the point is that the shape is right, not that spans go anywhere.
    const { trace } = await import("@opentelemetry/api");
    const tracer = trace.getTracer("test", "0.0.0");
    expect(typeof tracer.startActiveSpan).toBe("function");
  });
});
