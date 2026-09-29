import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: {
    exclude: ["emf-converter"]
  },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      external: ["@napi-rs/canvas"]
    }
  },
  resolve: {
    alias: {
      "@open-file-viewer/core/style.css": fileURLToPath(
        new URL("../../packages/core/src/style.css", import.meta.url)
      ),
      "@open-file-viewer/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@open-file-viewer/svelte": fileURLToPath(new URL("../../packages/svelte/src/index.ts", import.meta.url))
    }
  }
});
