import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Refuses to produce a deployable build with no service URLs.
 *
 * VITE_API_URL and VITE_MASTRA_URL are substituted into the bundle at build
 * time, so an image built without them can never be corrected afterwards — it
 * ships asking every visitor's own machine for data.
 *
 * The first attempt at guarding this threw at runtime instead, which took the
 * entire site down with an opaque `{"status":500,"message":"HTTPError"}` for a
 * mistake made minutes earlier in a build command. Loud was right; the place was
 * not. A build that cannot be deployed correctly should fail while it is being
 * built, where the message lands in front of the person who typed the command
 * and no image is produced at all.
 *
 * Gated on KC_REQUIRE_SERVICE_URLS, which the Dockerfile sets, so a developer
 * running `pnpm build` to check bundle sizes still gets a build — with a warning
 * rather than a wall.
 */
function requireServiceUrls(): Plugin {
  return {
    name: "kc:require-service-urls",
    apply: "build",
    buildStart() {
      const missing = ["VITE_API_URL", "VITE_MASTRA_URL"].filter(
        (name) => !(process.env[name] ?? "").trim(),
      );
      if (missing.length === 0) return;

      const detail = [
        `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set.`,
        "These are compiled into the client bundle, so a container environment",
        "variable cannot fix them later — the browser would ask the visitor's own",
        "machine for data. Pass them as build args:",
        "",
        "  docker build \\",
        "    --build-arg VITE_API_URL=https://api.example.com \\",
        "    --build-arg VITE_MASTRA_URL=https://agent.example.com \\",
        "    -f apps/web/Dockerfile .",
      ].join("\n  ");

      if (process.env.KC_REQUIRE_SERVICE_URLS) {
        this.error(`\n  ${detail}\n`);
      }
      this.warn(`\n  ${detail}\n  Building anyway — this bundle is not deployable.\n`);
    },
  };
}

export default defineConfig({
  server: { port: 3000 },
  resolve: {
    // Declared here rather than left to tsconfig `paths`: Vite does not read
    // tsconfig for resolution, so without this the `~/` imports fail at runtime
    // even though they typecheck.
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    requireServiceUrls(),
    tailwindcss(),
    tanstackStart(),
    // Start's plugin must come first; React's builds on the routes it generates.
    viteReact(),
  ],
});
