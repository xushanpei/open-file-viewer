import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
      "@open-file-viewer/react": fileURLToPath(new URL("../../packages/react/src/index.tsx", import.meta.url))
    }
  }
});
