import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        api: fileURLToPath(new URL("./api.html", import.meta.url)),
        about: fileURLToPath(new URL("./about.html", import.meta.url)),
        remoteHarness: fileURLToPath(new URL("./remote-harness.html", import.meta.url))
      }
    }
  },
  resolve: {
    alias: {
      "@open-file-viewer/core/style.css": fileURLToPath(
        new URL("../packages/core/src/style.css", import.meta.url)
      ),
      "@open-file-viewer/core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url))
    }
  }
});
