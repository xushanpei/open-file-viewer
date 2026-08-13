# Open File Viewer

<p align="right">
  <a href="./README.zh-CN.md">Simplified Chinese</a>
  |
  <strong>English</strong>
  |
  <a href="./README.ja.md">日本語</a>
  |
  <a href="./README.ko.md">한국어</a>
  |
  <a href="./README.es.md">Español</a>
  |
  <a href="./README.pt-BR.md">Português</a>
</p>

Open File Viewer is a file preview SDK for modern web applications. It brings PDFs, Office documents, images, audio and video, archives, emails, drawings, 3D files, GIS data, and source code into one controlled container, with support for vanilla JavaScript, React, Vue, and Svelte.

<p>
  <a href="https://open-file-viewer-workspace.void.app">Website</a>
  |
  <a href="https://open-file-viewer-workspace.void.app/about.html">About</a>
  |
  <a href="https://github.com/xushanpei/open-file-viewer">GitHub</a>
  |
  <a href="https://www.npmjs.com/package/@open-file-viewer/core">NPM Core</a>
  |
  <a href="https://www.npmjs.com/package/@open-file-viewer/react">React</a>
  |
  <a href="https://www.npmjs.com/package/@open-file-viewer/vue">Vue</a>
  |
  <a href="https://www.npmjs.com/package/@open-file-viewer/svelte">Svelte</a>
</p>

[![GitHub](https://img.shields.io/badge/GitHub-xushanpei%2Fopen--file--viewer-111827?logo=github)](https://github.com/xushanpei/open-file-viewer)
[![Core](https://img.shields.io/npm/v/@open-file-viewer/core?label=%40open-file-viewer%2Fcore&color=7c5cff)](https://www.npmjs.com/package/@open-file-viewer/core)
[![React](https://img.shields.io/npm/v/@open-file-viewer/react?label=react&color=149eca)](https://www.npmjs.com/package/@open-file-viewer/react)
[![Vue](https://img.shields.io/npm/v/@open-file-viewer/vue?label=vue&color=41b883)](https://www.npmjs.com/package/@open-file-viewer/vue)
[![Svelte](https://img.shields.io/npm/v/@open-file-viewer/svelte?label=svelte&color=ff3e00)](https://www.npmjs.com/package/@open-file-viewer/svelte)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Why Choose It

Most business systems eventually need attachment preview: contracts, spreadsheets, drawings, archives, emails, images, videos, and source files. Open File Viewer is not a PDF-only demo. It is a file preview foundation that can evolve with real product needs over time.

- **Container-first**: all content renders inside the DOM container you provide. It does not open a new window or interrupt the host business page.
- **Multi-framework compatibility**: vanilla JavaScript, React, Vue, and Svelte share the same core capabilities.
- **Plugin-based formats**: each file format is handled by an independent plugin, making behavior easier to replace, trim, and extend.
- **Responsive preview**: supports CSS sizes such as `px`, `%`, `vh`, `vw`, `rem`, and `calc()`, and responds automatically to container changes.
- **Application-ready states**: includes loading, error, unsupported, download fallback, toolbar, theme, and multi-file queue behavior.
- **Progressive enhancement for complex formats**: formats that browsers can preview directly are rendered locally first; complex formats can gradually integrate WASM, dedicated parsers, or server-side conversion.

## Installation

```bash
pnpm add @open-file-viewer/core
```

React:

```bash
pnpm add @open-file-viewer/core @open-file-viewer/react
```

Vue:

```bash
pnpm add @open-file-viewer/core @open-file-viewer/vue
```

Svelte:

```bash
pnpm add @open-file-viewer/core @open-file-viewer/svelte
```

PDF preview requires `pdfjs-dist` when you use `pdfPlugin()`:

```bash
pnpm add pdfjs-dist
```

You can also use npm or yarn:

```bash
npm install @open-file-viewer/core
yarn add @open-file-viewer/core
```

Import the shared stylesheet once in your application:

```ts
import "@open-file-viewer/core/style.css";
```

## Quick Start

### Vanilla JavaScript

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

### Remote PDF fallback compatibility

When PDF.js cannot parse or load a remote PDF URL, the PDF plugin falls back to
the browser's embedded PDF viewer. Different Chromium-based viewers apply
different script requirements inside sandboxed iframes, so
`webFallbackScripts: "auto"` is the default:

- cross-origin PDF URLs receive `allow-scripts` while remaining sandboxed;
- same-origin URLs keep scripts blocked to avoid combining script execution
  with same-origin access by default.

The host can make the policy stricter, or explicitly trust a same-origin PDF
endpoint:

```ts
pdfPlugin({ webFallbackScripts: "never" });  // strict sandbox
pdfPlugin({ webFallbackScripts: "always" }); // trusted PDF endpoints only
```

This setting only affects the remote iframe fallback. It does not change the
normal PDF.js rendering path or force a `referrerpolicy` value.

### Office previews stuck on "Loading" inside qiankun / micro-app

Micro-frontend sandboxes (qiankun, micro-app, ...) tear down window `message`
listeners when a sub-app unmounts, which breaks the `setImmediate` polyfill that
jszip depends on. `JSZip.loadAsync` then never resolves, so every zip-based
preview (docx / xlsx / pptx / epub / ofd) hangs on the loading state forever
(see [qiankun#2589](https://github.com/umijs/qiankun/issues/2589)).

`createViewer()` detects sandbox flags such as `__POWERED_BY_QIANKUN__` and
`__MICRO_APP_ENVIRONMENT__` and automatically installs a MessageChannel-based
scheduler that sandboxes cannot break — no configuration needed. On versions up
to 0.1.27, patch it manually in the sub-app entry before any imports:

```js
if (window.__POWERED_BY_QIANKUN__) {
  window.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
}
```

### React

```tsx
import { FileViewer } from "@open-file-viewer/react";
import { imagePlugin, pdfPlugin, officePlugin, textPlugin } from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

const plugins = [
  imagePlugin(),
  textPlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc }),
  officePlugin()
];

export function AttachmentPreview({ file }: { file: File }) {
  return (
    <FileViewer
      file={file}
      fileName={file.name}
      width="100%"
      height="640px"
      fit="contain"
      toolbar
      theme="auto"
      plugins={plugins}
    />
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { OpenFileViewer } from "@open-file-viewer/vue";
import { imagePlugin, pdfPlugin, officePlugin, textPlugin } from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

defineProps<{ file: File }>();

const plugins = [
  imagePlugin(),
  textPlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc }),
  officePlugin()
];
</script>

<template>
  <OpenFileViewer
    :file="file"
    :file-name="file.name"
    width="100%"
    height="640px"
    fit="contain"
    toolbar
    theme="auto"
    :plugins="plugins"
  />
</template>
```

### Svelte

```svelte
<script lang="ts">
  import { OpenFileViewer } from "@open-file-viewer/svelte";
  import { imagePlugin, pdfPlugin, officePlugin, textPlugin } from "@open-file-viewer/core";
  import "@open-file-viewer/core/style.css";
  import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

  export let file: File;

  const plugins = [
    imagePlugin(),
    textPlugin(),
    pdfPlugin({ workerSrc: pdfWorkerSrc }),
    officePlugin()
  ];
</script>

<OpenFileViewer
  {file}
  fileName={file.name}
  width="100%"
  height="640px"
  fit="contain"
  toolbar
  theme="auto"
  {plugins}
/>
```

## Use Cases

| Scenario | What Open File Viewer Provides |
| --- | --- |
| OA / ERP / CRM attachment centers | A unified container preview for contracts, spreadsheets, images, emails, and archives |
| Cloud drives / knowledge bases / document systems | Multi-file queues, download, search, fullscreen, and theme adaptation |
| Low-code / form systems | Vanilla JS integration without forcing React, Vue, or Svelte |
| Engineering / manufacturing / GIS systems | Recognition and progressive enhancement for CAD, 3D, GIS, and drawing files |
| Developer platforms / log platforms | Text, config, Markdown, code highlighting, and large-file protection |

## Feature Overview

| Capability | Status |
| --- | --- |
| Vanilla JS / React / Vue / Svelte integration | Supported |
| Custom container, width, height, and responsive sizing | Supported |
| Multi-file queue, switching, and current index | Supported |
| Toolbar, download, fullscreen, print, and search | Supported |
| Light, dark, and `auto` themes | Supported |
| Local `File` / `Blob` / URL / `ArrayBuffer` sources | Supported |
| Plugin protocol and custom fallback | Supported |
| PDF, images, audio/video, text/code | Supported |
| Office, OFD, EPUB, XPS, email, and archives | Basic to enhanced preview |
| CAD, 3D, GIS, drawing boards, and design assets | Detection, basic preview, and ongoing enhancements |

## Format Coverage

| Category | Plugin | Representative Formats |
| --- | --- | --- |
| Images | `imagePlugin()` | `jpg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp`, `tiff`, `heic`, `heif` |
| Video | `videoPlugin()` | `mp4`, `webm`, `mov`, `m4v`, `avi`, `mkv`, `flv`, `wmv`, `m3u8`, `m2ts` |
| Audio | `audioPlugin()` | `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`, `opus`, `mid`, `wma` |
| Text / code | `textPlugin()` | `txt`, `lrc`, `md`, `json`, `yaml`, `xml`, `csv`, `js`, `ts`, `tsx`, `vue`, `html`, `css`, `py`, `go`, `rs`, `sql`, `sh` |
| PDF / ebooks | `pdfPlugin()`, `epubPlugin()`, `xpsPlugin()` | `pdf`, `epub`, `xps`, `oxps` |
| Office | `officePlugin()` | `doc`, `docx`, `docm`, `dot`, `rtf`, `odt`, `xls`, `xlsx`, `xlsm`, `xlsb`, `csv`, `ppt`, `pps`, `pptx`, `pptm`, `odp`, `wps`, `et`, `dps` |
| OFD | `ofdPlugin()` | `ofd` |
| Archives | `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| Email | `emailPlugin()` | `eml`, `msg`, `mbox` |
| Drawing / whiteboard | `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| Mind maps | `xmindPlugin()` | `xmind` |
| CAD / engineering / chip layout | `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs`, `ifc`, `skp`, `sldprt`, `gds`, `gdsii`, `oas`, `oasis` |
| 3D models | `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf`, `usd`, `usdz` |
| GIS | `gisPlugin()` | `geojson`, `topojson`, `kml`, `kmz`, `gpx`, `shp` |
| Asset recognition | `assetPlugin()` | `ttf`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro` |

Preview quality for complex formats depends on browser capabilities, file structure, and the parser used by each plugin. The current version focuses on making every format enter a controlled preview path inside the container. High-fidelity Office, CAD, design, and proprietary binary formats can continue to integrate dedicated engines or server-side conversion.

Legacy `ppt` / `pps` files use a local OLE and PowerPoint Binary File Format preview path. It restores slide geometry, positioned text, master bitmap artwork, JPEG/PNG/TIFF assets, and common compressed EMF/WMF graphics without uploading the file. Unsupported drawing records fall back gracefully; use `officePlugin({ convert })` when pixel-identical Office rendering is required.

Plugin order matters because the first matching plugin renders the file. For example, `csv` and `tsv` can match both `textPlugin()` and `officePlugin()`; place `officePlugin()` earlier if you want spreadsheet-style table preview.

### DWG / DWF Preview Model

DWG is AutoCAD's proprietary binary format. `cadPlugin()` can use a high-fidelity WebGL scene, the lightweight built-in SVG path, or an application-provided renderer.

- **High-fidelity WebGL path**: configure `webglDwg` to parse DWG in a Worker and draw layers, blocks, hatches, line styles, and text in an interactive CAD canvas. Once configured, errors are surfaced instead of silently switching to SVG.
- **Default built-in path**: `cadPlugin()` automatically tries LibreDWG WASM for DWG model-space linework. If the linework looks unreliable but the file contains an embedded thumbnail, it shows the DWG thumbnail. If LibreDWG is not installed, the WASM path is not configured, or parsing fails, it falls back to DWG/DWF metadata, version hints, structure probes, and conversion guidance.
- **External enhancement path**: use `cadPlugin({ binaryRenderer })` to integrate your own frontend engine, CADViewer, MxCAD, or a backend service that converts to PNG/PDF/SVG/DXF. `binaryRenderer` has the highest priority and fully takes over DWG/DWF preview when it returns an instance.
- **High-fidelity commercial route**: for complex fonts, external references, paper-space layouts, large drawings, and professional CAD fidelity, integrate a mature CAD SDK or server-side conversion pipeline.

Recommended high-fidelity setup:

```bash
npm install @mlightcad/cad-simple-viewer@1.5.9 @mlightcad/data-model@1.12.3 lodash-es@4.17.21
```

Copy `libredwg-parser-worker.js` and `mtext-renderer-worker.js` from the installed
`@mlightcad/cad-simple-viewer/dist/` directory into a public static directory,
then configure that directory:

```ts
cadPlugin({
  webglDwg: {
    engineLoader: () => import("@mlightcad/cad-simple-viewer"),
    workerBaseUrl: "/vendor/cad-engine"
  }
});
```

The explicit `engineLoader` keeps the optional engine out of builds that do not
configure WebGL DWG preview and gives strict esbuild setups a host-owned import
they can resolve.

The WebGL package is MIT licensed. Its published DWG parser Worker is based on
LibreDWG, so applications should also review the Worker's license requirements.
CAD font resources may be configured with `webglDwg.baseUrl`; only self-host
font files that your application is licensed to distribute.

Lightweight LibreDWG SVG setup:

1. Install the optional dependency. Pinning the version keeps the copied browser
   assets reproducible.

```bash
npm install @mlightcad/libredwg-web@0.7.4
```

2. Add `scripts/copy-libredwg-assets.mjs` to the host application. This example
   targets the conventional `public/` directory used by Vite and Next.js; change
   `targetRoot` if your framework uses a different static directory.

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

3. Run the copy step before local development and production builds:

```json
{
  "scripts": {
    "assets:dwg": "node scripts/copy-libredwg-assets.mjs",
    "predev": "npm run assets:dwg",
    "prebuild": "npm run assets:dwg"
  }
}
```

If the project already defines `predev` or `prebuild`, append the asset command
to the existing script instead of replacing it.

4. Keep LibreDWG's published `dist/` and `wasm/` directory layout and configure
   the browser-loadable ESM entry:

```ts
cadPlugin({
  libreDwg: {
    wasmBaseUrl: "/vendor/libredwg-web/wasm",
    workerModuleUrl: "/vendor/libredwg-web/dist/libredwg-web.js",
    workerTimeoutMs: 120_000
  }
});
```

After starting the application, verify that both URLs return `200`:

```text
/vendor/libredwg-web/dist/libredwg-web.js
/vendor/libredwg-web/wasm/libredwg-web.wasm
```

For applications deployed below a URL prefix, prepend the application's public
base path to both configuration URLs. Serve `.wasm` as `application/wasm`.

These are self-hosted static assets, not files loaded from an external CDN.
The documentation app runs `doc/scripts/copy-libredwg-assets.mjs` during
`predev` and `prebuild`, copying the pinned npm package's `dist/` and `wasm/`
directories into `doc/public/vendor/libredwg-web/`. Those generated directories
are ignored by Git because they are reproducible and include a roughly 6 MB
WASM binary. Host applications should add an equivalent copy step to their own
build or deployment pipeline. If the deployment platform cannot run that step,
publish the copied directories as static assets instead.

`@mlightcad/libredwg-web` is an optional GPL-3.0 dependency; it is intentionally
not bundled into the MIT-licensed core package. Applications that enable it
should review the upstream license requirements for their distribution model.

The viewer transfers a DWG buffer copy to a dedicated module worker and
terminates it when the file changes, the viewer is destroyed, or parsing times
out. The ESM/WASM assets must be same-origin or CORS-enabled, and CSP must allow
module workers plus `blob:` in `worker-src`. Without a worker URL, the existing
main-thread SVG/thumbnail fallback remains active.

```ts
cadPlugin({
  async binaryRenderer({ panel, extension, arrayBuffer, fileName }) {
    if (extension !== "dwg") return;

    const stage = document.createElement("div");
    stage.className = "my-dwg-stage";
    panel.append(stage);

    // Load your DWG engine, worker, fonts, and assets on demand here.
    // Example: await renderDwgWithYourEngine(stage, arrayBuffer, { fileName });

    return {
      destroy() {
        stage.remove();
      }
    };
  }
});
```

## Core API

```ts
createViewer(options: PreviewOptions): FileViewer;
```

### PreviewOptions

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | Required | Preview container |
| `file` | `File \| Blob \| string \| ArrayBuffer` | - | Single-file preview source |
| `files` | `(PreviewSource \| PreviewItem)[]` | - | Multi-file preview queue |
| `initialIndex` | `number` | `0` | Initial file index |
| `initialPage` | `number` | `1` | Initial 1-based page for paginated previews |
| `fileName` | `string` | Auto inferred | File name used for extension detection |
| `mimeType` | `string` | Auto inferred | MIME type |
| `width` | `number \| string` | Original container width | Preview container width |
| `height` | `number \| string` | Original container height | Preview container height |
| `zoom` | `number` | `1` | Initial zoom level, where `1` means 100% |
| `fit` | `contain \| cover \| width \| height \| actual \| scale-down` | `contain` | Content fitting mode. When omitted for a direct PDF preview, the continuous reader uses `width`; pass `contain` explicitly to fit both dimensions. |
| `plugins` | `PreviewPlugin[]` | `[]` | Plugin list, matched in order |
| `fallback` | `inline \| download \| custom` | `inline` | Fallback strategy for unsupported formats |
| `renderFallback` | `(ctx) => PreviewInstance` | - | Custom fallback renderer |
| `toolbar` | `boolean \| PreviewToolbarOptions` | `false` | Toolbar configuration |
| `theme` | `light \| dark \| auto` | `light` | Viewer theme |
| `className` | `string` | - | Extra container class name |
| `onLoad` | `(file) => void` | - | Callback after loading completes |
| `onError` | `(error, file) => void` | - | Error callback |
| `onUnsupported` | `(file) => void` | - | Unsupported-format callback |

## Toolbar Customization

`toolbar: true` enables the default toolbar, including multi-file navigation, zoom, rotate, download, fullscreen, print, and search when supported by the active plugin. You can extend it for business workflows without rewriting the whole viewer.

### Custom Labels, Order, and Icons

```ts
createViewer({
  container: "#viewer",
  file,
  toolbar: {
    zoom: true,
    rotate: true,
    download: true,
    fullscreen: true,
    search: true,
    labels: {
      download: "Download",
      fullscreen: "Fullscreen",
      search: "Search",
      "zoom-in": "Zoom in",
      "zoom-out": "Zoom out",
      "zoom-reset": "Actual size",
      "rotate-right": "Rotate"
    },
    titles: {
      download: "Download current file"
    },
    icons: {
      download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>'
    },
    order: ["search", "zoom-out", "zoom-in", "zoom-reset", "rotate-right", "download", "fullscreen"]
  },
  plugins
});
```

### Add Business Actions

```ts
createViewer({
  container: "#viewer",
  file,
  toolbar: {
    order: ["download", "favorite", "approve", "share", "fullscreen"],
    actions: [
      {
        id: "favorite",
        label: "Favorite",
        onClick(ctx) {
          favoriteFile(ctx.file);
        }
      },
      {
        id: "approve",
        label: "Approve",
        onClick(ctx) {
          openApprovalDialog(ctx.file);
        }
      },
      {
        id: "share",
        label: "Share",
        disabled(ctx) {
          return !ctx.file;
        },
        onClick(ctx) {
          shareFile(ctx.file);
        }
      }
    ]
  },
  plugins
});
```

### Fully Replace the Toolbar

```ts
createViewer({
  container: "#viewer",
  files,
  toolbar: {
    render(ctx) {
      const bar = document.createElement("div");
      bar.className = "business-toolbar";

      const name = document.createElement("strong");
      name.textContent = ctx.file?.name || "";

      const next = document.createElement("button");
      next.type = "button";
      next.textContent = "Next";
      next.disabled = !ctx.canNext;
      next.onclick = () => void ctx.next();

      const download = document.createElement("button");
      download.type = "button";
      download.textContent = "Download";
      download.onclick = ctx.download;

      bar.append(name, next, download);
      return bar;
    }
  },
  plugins
});
```

The `render(ctx)` context includes `file`, `index`, `length`, `previous()`, `next()`, `goToPage(page)`, `command()`, `download()`, `fullscreen()`, `print()`, `search()`, and `clearSearch()`. In core, `toolbar.render(ctx)` returns a DOM `HTMLElement | void`; React, Vue, and Svelte expose framework-native toolbar APIs.

### React Custom Toolbar

```tsx
<FileViewer
  files={files}
  plugins={plugins}
  renderToolbar={(ctx) => (
    <>
      <button disabled={!ctx.canPrevious} onClick={() => void ctx.previous()}>Previous</button>
      <span>{ctx.index + 1} / {ctx.length}</span>
      <button disabled={!ctx.canNext} onClick={() => void ctx.next()}>Next</button>
      <button onClick={ctx.download}>Download</button>
      <button onClick={() => openApprovalDialog(ctx.file)}>Approve</button>
    </>
  )}
/>
```

### Vue Custom Toolbar

```vue
<OpenFileViewer :files="files" :plugins="plugins">
  <template #toolbar="ctx">
    <button :disabled="!ctx.canPrevious" @click="ctx.previous()">Previous</button>
    <span>{{ ctx.index + 1 }} / {{ ctx.length }}</span>
    <button :disabled="!ctx.canNext" @click="ctx.next()">Next</button>
    <button @click="ctx.download()">Download</button>
    <button @click="openApprovalDialog(ctx.file)">Approve</button>
  </template>
</OpenFileViewer>
```

### Svelte Custom Toolbar

```svelte
<OpenFileViewer files={files} plugins={plugins}>
  <svelte:fragment slot="toolbar" let:ctx>
    {#if ctx}
      <button disabled={!ctx.canPrevious} on:click={() => void ctx.previous()}>Previous</button>
      <span>{ctx.index + 1} / {ctx.length}</span>
      <button disabled={!ctx.canNext} on:click={() => void ctx.next()}>Next</button>
      <button on:click={ctx.download}>Download</button>
      <button on:click={() => openApprovalDialog(ctx.file)}>Approve</button>
    {/if}
  </svelte:fragment>
</OpenFileViewer>
```

At the style layer, you can still override classes such as `.ofv-toolbar`, `.ofv-toolbar button`, and `.ofv-toolbar-search`. Custom icon buttons also generate `.ofv-toolbar-icon` and `.ofv-toolbar-label`, making alignment, spacing, and truncation easier to control.

### FileViewer

| Method | Description |
| --- | --- |
| `reload(file?)` | Reload the current file or a specified file |
| `next()` / `previous()` | Switch through the multi-file queue |
| `goTo(index)` | Jump to a specified file |
| `goToPage(page)` | Jump to a 1-based page in PDF, DOCX, OFD, XPS, TIFF, and other paginated previews |
| `getCurrentIndex()` | Get the current index |
| `resize()` | Manually trigger size recalculation |
| `destroy()` | Destroy the viewer and clean up resources |

## Plugin Development

Each format is integrated through a plugin. A plugin only needs to answer two questions: whether the file matches, and how to render into `ctx.viewport`.

```ts
import type { PreviewPlugin } from "@open-file-viewer/core";

export function customPlugin(): PreviewPlugin {
  return {
    name: "custom",
    match(file) {
      return file.extension === "custom";
    },
    async render(ctx) {
      const element = document.createElement("div");
      element.textContent = ctx.file.name;
      ctx.viewport.append(element);

      return {
        resize(size) {
          console.log("container resized", size);
        },
        destroy() {
          element.remove();
        }
      };
    }
  };
}
```

Plugin constraints:

- Render only into `ctx.viewport`.
- Do not open a new window by default.
- Implement `resize(size)` when the plugin needs to react to container size changes.
- Implement `destroy()` to clean up events, object URLs, timers, Canvas/WebGL resources, and other side effects.

## Package Structure

```txt
packages/
  core/      # Framework-agnostic preview core and plugins
  react/     # React adapter
  vue/       # Vue adapter
  svelte/    # Svelte adapter
examples/
  vanilla/   # Vanilla JavaScript example
  react/     # React example
  vue/       # Vue example
  svelte/    # Svelte example
doc/         # Website and online experience
```

## Local Development

```bash
pnpm install
pnpm check
```

Common commands:

```bash
pnpm dev:doc
pnpm dev:vanilla
pnpm dev:react
pnpm dev:vue
pnpm dev:svelte
pnpm test
pnpm typecheck
pnpm build
pnpm build:examples
pnpm build:doc
pnpm pack:check
```

`pnpm check` runs tests, type checks, package builds, example builds, website build, and package export validation in sequence.

## Roadmap

| Version | Focus |
| --- | --- |
| `0.1.x` | Core plugin system, in-container preview, React/Vue/Svelte/Vanilla integration, basic multi-format preview |
| `0.2.x` | Toolbar, themes, image interactions, PDF search, unified states, and fallback |
| `0.3.x` | Markdown/code reader, enhanced Office spreadsheets and document experience |
| `0.4.x` | OFD, email, archives, drawing files, and enhancements for high-frequency domestic business formats |
| `0.5.x` | CAD, 3D, GIS, dedicated parsers, and server-side conversion collaboration |
| `1.0.0` | Stable API, complete documentation site, visual regression tests, and plugin development guide |

## Community and Support

Open File Viewer will continue improving format preview, framework integration, and real business scenarios. Open source is not easy. If it saves you development time, a free GitHub star is a meaningful way to support future iteration.

- Feedback: use GitHub Issues to share file samples, layout problems, container adaptation issues, and new format requests.

## Links

- Website: https://open-file-viewer-workspace.void.app
- About: https://open-file-viewer-workspace.void.app/about.html
- GitHub: https://github.com/xushanpei/open-file-viewer
- NPM Core: https://www.npmjs.com/package/@open-file-viewer/core
- NPM React: https://www.npmjs.com/package/@open-file-viewer/react
- NPM Vue: https://www.npmjs.com/package/@open-file-viewer/vue
- NPM Svelte: https://www.npmjs.com/package/@open-file-viewer/svelte

## License

[MIT](./LICENSE)
