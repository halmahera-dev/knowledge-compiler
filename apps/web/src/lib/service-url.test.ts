/**
 * Where a production bundle is allowed to point.
 *
 * The failure being pinned: the production image was built without
 * VITE_API_URL, so the client fell back to `http://localhost:8000` and every
 * visitor's browser asked their own machine for the knowledge base. Pages
 * rendered empty because the route loaders catch and swallow the failure, and
 * navigation stalled for seconds — a page served from a public origin asking
 * for a localhost resource is a private-network request, which Chrome
 * preflights before refusing.
 *
 * Nothing surfaced. It looked like a slow app with an empty database.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { serviceUrl } from "./service-url";

const FALLBACK = "http://localhost:8000";

/** `import.meta.env.PROD` is what separates a build that may guess from one that may not. */
function asProduction(value: boolean) {
  vi.stubEnv("PROD", value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("serviceUrl", () => {
  it("uses the configured URL when there is one", () => {
    expect(serviceUrl("https://api.example.com", FALLBACK)).toBe("https://api.example.com");
  });

  it("drops a trailing slash, so paths do not end up doubled", () => {
    expect(serviceUrl("https://api.example.com/", FALLBACK)).toBe("https://api.example.com");
  });

  describe("in development", () => {
    it("falls back to localhost, which is the point of the fallback", () => {
      asProduction(false);
      expect(serviceUrl(undefined, FALLBACK)).toBe(FALLBACK);
    });
  });

  describe("in production", () => {
    it("does not throw, because module load must not take the site down", () => {
      // An earlier version threw here. It ran at module load, so one missing
      // build argument returned an opaque 500 for every page including the
      // landing page and sign-in — neither of which needs the API at all.
      asProduction(true);
      expect(() => serviceUrl(undefined, FALLBACK)).not.toThrow();
    });

    it("says loudly what is wrong, since it can no longer stop the build", () => {
      asProduction(true);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      serviceUrl(undefined, FALLBACK);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]![0]).toMatch(/VITE_API_URL/);
      spy.mockRestore();
    });

    it("treats an empty string as unset", () => {
      // The case that actually shipped: an unset Docker ARG becomes "", not
      // undefined, so `?? fallback` never fires. A base of "" would silently
      // turn every call into a same-origin path that 404s against the web
      // server — quieter than the bug it replaces.
      asProduction(true);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(serviceUrl("", FALLBACK)).toBe(FALLBACK);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("treats whitespace as unset too", () => {
      asProduction(true);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(serviceUrl("   ", FALLBACK)).toBe(FALLBACK);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("stays quiet when a real URL is configured", () => {
      asProduction(true);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(serviceUrl("https://api.example.com", FALLBACK)).toBe("https://api.example.com");
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
