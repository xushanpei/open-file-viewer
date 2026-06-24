# Open File Viewer

<p align="right">
  <a href="./README.md">Simplified Chinese</a>
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
  cadPlugin,
  model3dPlugin,
  gisPlugin,
  fallbackPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

const viewer = createViewer({
  container: "#viewer",
  file: fileOrUrl,
  fileName: "contract.pdf",
  width: "100%",
  height: "70vh",
  fit: "contain",
  toolbar: true,
  theme: "auto",
  plugins: [
    imagePlugin(),
    videoPlugin(),
    audioPlugin(),
    textPlugin(),
    pdfPlugin({ workerSrc: pdfWorkerSrc }),
    officePlugin(),
    archivePlugin(),
    emailPlugin(),
    drawingPlugin(),
    cadPlugin(),
    model3dPlugin(),
    gisPlugin(),
    fallbackPlugin()
  ]
});

viewer.resize();
viewer.destroy();
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
| Text / code | `textPlugin()` | `txt`, `md`, `json`, `yaml`, `xml`, `csv`, `js`, `ts`, `tsx`, `vue`, `html`, `css`, `py`, `go`, `rs`, `sql`, `sh` |
| PDF / ebooks | `pdfPlugin()`, `epubPlugin()`, `xpsPlugin()` | `pdf`, `epub`, `xps`, `oxps` |
| Office | `officePlugin()` | `docx`, `rtf`, `odt`, `xlsx`, `csv`, `pptx`, `odp`, `wps`, `et`, `dps` |
| OFD | `ofdPlugin()` | `ofd` |
| Archives | `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| Email | `emailPlugin()` | `eml`, `msg`, `mbox` |
| Drawing / whiteboard | `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| CAD / engineering | `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs`, `ifc`, `skp`, `sldprt` |
| 3D models | `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf`, `usd`, `usdz` |
| GIS | `gisPlugin()` | `geojson`, `topojson`, `kml`, `kmz`, `gpx`, `shp` |
| Asset recognition | `assetPlugin()` | `ttf`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro` |

Preview quality for complex formats depends on browser capabilities, file structure, and the parser used by each plugin. The current version focuses on making every format enter a controlled preview path inside the container. High-fidelity Office, CAD, design, and proprietary binary formats can continue to integrate dedicated engines or server-side conversion.

Plugin order matters because the first matching plugin renders the file. For example, `csv` and `tsv` can match both `textPlugin()` and `officePlugin()`; place `officePlugin()` earlier if you want spreadsheet-style table preview.

### DWG / DWF Two-Layer Preview Model

DWG is AutoCAD's proprietary binary format. `cadPlugin()` uses a two-layer design: the default built-in path tries local preview first, while the external enhancement path lets applications provide high-fidelity rendering.

- **Default built-in path**: `cadPlugin()` automatically tries LibreDWG WASM for DWG model-space linework. If the linework looks unreliable but the file contains an embedded thumbnail, it shows the DWG thumbnail. If LibreDWG is not installed, the WASM path is not configured, or parsing fails, it falls back to DWG/DWF metadata, version hints, structure probes, and conversion guidance.
- **External enhancement path**: use `cadPlugin({ binaryRenderer })` to integrate your own frontend engine, CADViewer, MxCAD, or a backend service that converts to PNG/PDF/SVG/DXF. `binaryRenderer` has the highest priority and fully takes over DWG/DWF preview when it returns an instance.
- **High-fidelity commercial route**: for complex fonts, external references, paper-space layouts, large drawings, and professional CAD fidelity, integrate a mature CAD SDK or server-side conversion pipeline.

To enable the default LibreDWG linework path, place the WASM file in a public static directory:

```ts
cadPlugin({
  libreDwg: {
    wasmBaseUrl: "/vendor/libredwg-web"
  }
});
```

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
| `fileName` | `string` | Auto inferred | File name used for extension detection |
| `mimeType` | `string` | Auto inferred | MIME type |
| `width` | `number \| string` | Original container width | Preview container width |
| `height` | `number \| string` | Original container height | Preview container height |
| `zoom` | `number` | `1` | Initial zoom level, where `1` means 100% |
| `fit` | `contain \| cover \| width \| height \| actual \| scale-down` | `contain` | Content fitting mode |
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

The `render(ctx)` context includes `file`, `index`, `length`, `previous()`, `next()`, `command()`, `download()`, `fullscreen()`, `print()`, `search()`, and `clearSearch()`. In core, `toolbar.render(ctx)` returns a DOM `HTMLElement | void`; React, Vue, and Svelte expose framework-native toolbar APIs.

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

- Feedback: use GitHub Issues, the community group, or the author's WeChat to share file samples, layout problems, container adaptation issues, and new format requests.
- Learning and discussion: the official account "Frontend Development Enthusiasts" will continue sharing frontend engineering, component development, and open-source practice.
- Support the author: if you would like to buy the author a coffee, or even a bottle of mineral water, that encouragement is appreciated. Donation users are welcome to add the author's WeChat for future frontend discussions.

<table>
  <tr>
    <td align="center" width="20%">
      <img src="./doc/public/images/official-account-qr.jpg" width="140" alt="Official account QR code: Frontend Development Enthusiasts" />
      <br />
      <strong>Official Account</strong>
      <br />
      Frontend Development Enthusiasts
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/community-group-qr.png" width="140" alt="Community group QR code" />
      <br />
      <strong>Community Group</strong>
      <br />
      Frontend technology discussion
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/author-wechat-qr.png" width="140" alt="Author WeChat QR code" />
      <br />
      <strong>Author WeChat</strong>
      <br />
      Frontend discussion
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/wechat-donation-qr.png" width="140" alt="WeChat donation QR code" />
      <br />
      <strong>WeChat Donation</strong>
      <br />
      Buy the author a coffee
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/alipay-donation-qr.png" width="140" alt="Alipay donation QR code" />
      <br />
      <strong>Alipay Donation</strong>
      <br />
      Buy the author a bottle of water
    </td>
  </tr>
</table>

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
