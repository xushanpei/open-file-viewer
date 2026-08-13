# @open-file-viewer/core

Framework-agnostic browser file preview core for Open File Viewer.

Open File Viewer renders files inside your own DOM container instead of opening a new window. It supports images, PDF, Office documents, audio, video, text/code, archives, email, drawings, CAD, 3D, GIS, data and design asset formats through a plugin-based pipeline.

DWG/DWF are proprietary binary CAD formats. `cadPlugin()` supports a Worker-backed WebGL CAD scene through `webglDwg`, a lightweight LibreDWG SVG path, and a highest-priority `binaryRenderer` override.

Data/design asset previews are pure frontend where practical: SQLite shows header, schema and sample rows from common table leaf pages; PDF-compatible Illustrator files embed a browser PDF preview; PSD/PSB tries the Photoshop composite image; XPS/OXPS renders a lightweight FixedPage SVG view plus extracted text and package structure.

- Website: https://open-file-viewer-workspace.void.app
- GitHub: https://github.com/xushanpei/open-file-viewer
- npm: https://www.npmjs.com/package/@open-file-viewer/core

## Install

```bash
npm install @open-file-viewer/core
```

PDF preview requires `pdfjs-dist`:

```bash
npm install pdfjs-dist
```

### Vite / Rollup dependency chunks

Text grammars, Markdown, and email parsers load asynchronously when their plugins are first used.
Prism language chunks are loaded in dependency order, so applications do not need to preload parent
grammars such as Java before Scala. In monorepos, `resolve.dedupe: ["prismjs"]` prevents duplicate
Prism runtimes. Keep `/prismjs/components/` out of catch-all vendor `manualChunks` rules so the
side-effectful language modules remain separate on-demand chunks and execute in dependency order.
`postal-mime` and `@kenjiuno/msgreader` may optionally share an `ofv-email` chunk.

DWG geometry preview uses optional LibreDWG WASM. The recommended setup keeps
parsing in a worker and copies the package's browser assets during each build.

1. Install a pinned compatible version:

```bash
npm install @mlightcad/libredwg-web@0.7.4
```

2. Add `scripts/copy-libredwg-assets.mjs` to the host application:

```js
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleEntry = fileURLToPath(import.meta.resolve("@mlightcad/libredwg-web"));
const packageRoot = dirname(dirname(moduleEntry));
const targetRoot = fileURLToPath(
  new URL("../public/vendor/libredwg-web/", import.meta.url)
);

await mkdir(targetRoot, { recursive: true });
await Promise.all([
  cp(join(packageRoot, "dist"), join(targetRoot, "dist"), {
    recursive: true,
    force: true
  }),
  cp(join(packageRoot, "wasm"), join(targetRoot, "wasm"), {
    recursive: true,
    force: true
  })
]);
```

This example targets `public/`. Change `targetRoot` if the framework uses a
different static asset directory.

3. Run it before development and production builds. Append these commands if
   the application already has `predev` or `prebuild` scripts.

```json
{
  "scripts": {
    "assets:dwg": "node scripts/copy-libredwg-assets.mjs",
    "predev": "npm run assets:dwg",
    "prebuild": "npm run assets:dwg"
  }
}
```

4. Point `cadPlugin()` to the copied assets:

```ts
cadPlugin({
  libreDwg: {
    wasmBaseUrl: "/vendor/libredwg-web/wasm",
    workerModuleUrl: "/vendor/libredwg-web/dist/libredwg-web.js",
    workerTimeoutMs: 120_000
  }
});
```

Verify that `/vendor/libredwg-web/dist/libredwg-web.js` and
`/vendor/libredwg-web/wasm/libredwg-web.wasm` both return `200`. When deploying
below a URL prefix, prepend the application's public base path to both URLs.
Serve `.wasm` as `application/wasm`.

The plugin creates a dedicated module worker, transfers a copy of the DWG
buffer to it, and terminates the worker on timeout, file replacement, or viewer
destruction.

The configured URLs point to application-hosted static assets, not an external
CDN. Copy `dist/` and `wasm/` from the installed, pinned
`@mlightcad/libredwg-web` package into your public directory during build or
deployment. This repository's documentation app automates that step with
`doc/scripts/copy-libredwg-assets.mjs` in `predev` and `prebuild`; its copied
directories are Git-ignored because they are reproducible generated files and
include a roughly 6 MB WASM binary.

LibreDWG Web is an optional GPL-3.0 dependency and is not bundled into the
MIT-licensed core package. Review the upstream license requirements when
enabling it in a distributed application.

The ESM file and its WASM assets must be same-origin or served with appropriate
CORS headers. A Content Security Policy must allow module workers and `blob:` in
`worker-src`. If that is not possible, provide `workerFactory` for a separately
hosted worker, or set `useWorker: false`; both cases retain the existing
main-thread SVG/thumbnail fallback.

Native browser video formats such as MP4, WebM and MOV do not need extra dependencies. HLS uses `hls.js`, which is bundled with the core package. FLV and MPEG-TS/M2TS playback is optional: install `mpegts.js` in your application only if you need those formats. If it is not installed, `videoPlugin()` shows the built-in download fallback for FLV/M2TS files.

Pass the native media `controlsList` tokens when the host application needs to
remove browser-provided controls. For example, Chromium hides the Download item
for `nodownload`:

```ts
videoPlugin({ controlsList: "nodownload" });
```

This is a browser UI hint, not download protection. It does not hide Open File
Viewer's toolbar download action or the unsupported-format fallback link.

```bash
npm install mpegts.js
```

`mpegts.js` currently depends on a git-based `webworkify-webpack` fork. pnpm 11 users with `blockExoticSubdeps` enabled can keep `@open-file-viewer/core` installed normally because `mpegts.js` is no longer a required dependency. If your app really needs FLV/M2TS playback, either allow that dependency in your app or override it to the npm release:

```json
{
  "pnpm": {
    "overrides": {
      "webworkify-webpack": "2.1.5"
    }
  }
}
```

## Quick Start

```ts
import {
  createViewer,
  imagePlugin,
  videoPlugin,
  audioPlugin,
  textPlugin,
  pdfPlugin,
  officePlugin,
  archivePlugin,
  emailPlugin,
  drawingPlugin,
  xmindPlugin,
  cadPlugin,
  model3dPlugin,
  gisPlugin,
  fallbackPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

const plugins = [
  imagePlugin(),
  videoPlugin(),
  audioPlugin(),
  textPlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc }),
  officePlugin(),
  archivePlugin(),
  emailPlugin(),
  drawingPlugin(),
  xmindPlugin(),
  cadPlugin(),
  model3dPlugin(),
  gisPlugin(),
  fallbackPlugin()
];

const viewer = createViewer({
  container: "#viewer",
  file: fileOrUrl,
  fileName: "contract.pdf",
  width: "100%",
  height: "70vh",
  fit: "contain",
  toolbar: true,
  theme: "auto",
  plugins
});

viewer.resize();
viewer.destroy();
```

Use the same plugin list to check support before mounting a viewer:

```ts
import { isPreviewSupported } from "@open-file-viewer/core";

const supported = await isPreviewSupported(fileOrUrl, plugins, {
  fileName: "contract.pdf",
  mimeType: "application/pdf"
});
```

The check normalizes the source exactly like `createViewer()` and evaluates
`plugin.match()` in order. It does not mount DOM or call `plugin.render()`, and
`fallbackPlugin()` is not counted as native preview support.
Keep the plugin order identical to the viewer configuration; a matching
`fallbackPlugin()` is terminal and must not be placed before native plugins.

### PDF loading compatibility

If PDF preview falls back in Umi Max, utoo pack or similar build environments and the console shows
`Cannot set properties of undefined (setting 'onPull')` from pdf.js, enable `useFetchData`. It fetches
the PDF bytes on the main thread and then passes `data` to pdf.js, avoiding the worker network stream
path that can break in those bundlers:

```ts
pdfPlugin({
  workerSrc: pdfWorkerSrc,
  useFetchData: true
});
```

This keeps compatibility at the cost of holding one extra copy of the PDF in memory, so use it only
for affected environments.

For 360 Secure Browser, 360 Extreme Browser, and older Chromium kernels, `pdfPlugin()` defaults to
`compatibilityMode: "auto"`. It installs the `Promise.withResolvers` compatibility shim when needed
and selects the matching PDF.js legacy worker. If an enterprise browser hides its 360 user-agent
marker, force the compatibility path with `pdfPlugin({ compatibilityMode: "legacy" })`. When
self-hosting that worker, point `workerSrc` to the same-version
`pdfjs-dist/legacy/build/pdf.worker.min.mjs`. Use `compatibilityMode: "modern"` only when targeting
modern Chrome or Edge exclusively.

## High-Fidelity Office Conversion

Browser-side Office renderers cannot perfectly reproduce Word/WPS layout for files with anchored
textboxes, absolute positioning, custom fonts, headers/footers or legacy binary formats. For those
files, configure `officePlugin({ convert })` to send the file to your own LibreOffice, OnlyOffice or
Microsoft Graph conversion service and return a PDF. The converted PDF is rendered by the built-in
PDF viewer.

Without a conversion hook, legacy `ppt` / `pps` files use a local lightweight renderer for slide
geometry, positioned text, master bitmaps, raster images, and common compressed EMF/WMF artwork.
Use conversion when unsupported drawing records or exact Office typography must be preserved.

```ts
officePlugin({
  pdf: { workerSrc: pdfWorkerSrc },
  async convert({ file, arrayBuffer, reason }) {
    const form = new FormData();
    form.append("file", new Blob([arrayBuffer]), file.name);
    form.append("reason", reason);

    const response = await fetch("/api/office/convert-to-pdf", {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      throw new Error("Office conversion failed");
    }

    return {
      blob: await response.blob(),
      fileName: file.name.replace(/\.[^.]+$/, ".pdf"),
      mimeType: "application/pdf"
    };
  }
});
```

Open File Viewer does not upload files by default. The conversion hook is only called when you
explicitly configure it, and currently targets `complex-docx` and `legacy-office` cases. You can also
return `{ url, fileName, mimeType: "application/pdf" }` when your service stores the converted PDF.

## CAD Customization

For complex drawings, install the optional WebGL engine and host its two Worker
files as static assets:

```bash
npm install @mlightcad/cad-simple-viewer@1.5.9 @mlightcad/data-model@1.12.3 lodash-es@4.17.21
```

```ts
cadPlugin({
  webglDwg: {
    engineLoader: () => import("@mlightcad/cad-simple-viewer"),
    workerBaseUrl: "/vendor/cad-engine",
    baseUrl: "/cad-data/"
  }
});
```

The explicit `engineLoader` keeps the optional engine out of builds that do not
configure WebGL DWG preview and gives strict esbuild setups a host-owned import
they can resolve.

Copy `libredwg-parser-worker.js` and `mtext-renderer-worker.js` from
`@mlightcad/cad-simple-viewer/dist/` to `/vendor/cad-engine/`. `baseUrl` is
optional and points to a licensed, self-hosted CAD font resource directory.
Configured WebGL errors are surfaced to the host and do not silently switch to
the lightweight SVG renderer.

Without `webglDwg`, `cadPlugin()` keeps the existing CAD preview layers:

1. Default built-in path: DWG automatically tries LibreDWG WASM. If linework cannot be produced but the file contains an embedded preview image, the plugin shows that thumbnail. If the engine is unavailable or parsing fails, it shows DWG/DWF metadata and conversion guidance.
2. External enhancement path: `binaryRenderer` can take over DWG/DWF completely for CADViewer, MxCAD, a custom WebGL/SVG renderer, or a backend PNG/PDF/SVG/DXF conversion service.

Use the recommended setup above to keep DWG parsing off the UI thread. The
runtime configuration is:

```ts
cadPlugin({
  libreDwg: {
    wasmBaseUrl: "/vendor/libredwg-web/wasm",
    workerModuleUrl: "/vendor/libredwg-web/dist/libredwg-web.js"
  }
});
```

Disable it when you only want metadata and conversion guidance:

```ts
cadPlugin({ libreDwg: false });
```

Or let a custom renderer/service take over DWG/DWF completely. This is the recommended path for high-fidelity layouts, fonts, xrefs, print space, and production CAD workflows:

```ts
cadPlugin({
  async binaryRenderer({ panel, fileName, bytes }) {
    const result = await uploadToCadPreviewService(bytes, fileName);
    panel.append(result.element);
    return { destroy: () => result.dispose() };
  }
});
```

## Supported Inputs

`createViewer` accepts local files and remote sources:

- `File`
- `Blob`
- URL string
- `ArrayBuffer`
- multiple files through `files`

## Package Notes

Import the stylesheet once in your app:

```ts
import "@open-file-viewer/core/style.css";
```

React, Vue and Svelte adapters are available as separate packages:

```bash
npm install @open-file-viewer/react
npm install @open-file-viewer/vue
npm install @open-file-viewer/svelte
```

## Toolbar Customization

The toolbar can be configured from simple feature toggles to a fully custom renderer:

```ts
createViewer({
  container: "#viewer",
  file,
  toolbar: {
    labels: {
      download: "Download",
      fullscreen: "Fullscreen",
      search: "Search"
    },
    order: ["search", "download", "approve", "fullscreen"],
    actions: [
      {
        id: "approve",
        label: "Approve",
        onClick(ctx) {
          openApprovalDialog(ctx.file);
        }
      }
    ]
  },
  plugins
});
```

Use `toolbar.render(ctx)` when you need to replace the toolbar completely. The context exposes file metadata, queue navigation, preview commands, download, fullscreen, print and search helpers.

## Locale and Fallback Text

Built-in states, fallback panels, toolbar labels, and plugin messages default to English. Set `locale: "zh-CN"` for Simplified Chinese, or override individual PDF, image, text, Office, and custom-plugin strings with `messages`:

```ts
createViewer({
  container: "#viewer",
  file,
  locale: "zh-CN",
  messages: {
    unsupportedTitle: "No inline preview available",
    downloadFile: "Download original file",
    pdfPreviewFailedTitle: "Unable to open report",
    imageDownload: "Save original image"
  },
  plugins
});
```

The PDF viewer includes a synchronized page navigator with previous/next buttons and a numeric page input. Enter a page number and press Enter to jump directly to it.

## License

MIT
