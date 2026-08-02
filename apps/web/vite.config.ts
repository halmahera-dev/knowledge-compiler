import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

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
    tailwindcss(),
    tanstackStart(),
    // Start's plugin must come first; React's builds on the routes it generates.
    viteReact(),
  ],
});
