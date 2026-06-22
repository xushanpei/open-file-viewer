# @open-file-viewer/core

Framework-agnostic browser file preview core for Open File Viewer.

Open File Viewer renders files inside your own DOM container instead of opening a new window. It supports images, PDF, Office documents, audio, video, text/code, archives, email, drawings, CAD, 3D, GIS, data and design asset formats through a plugin-based pipeline.

DWG/DWF are proprietary binary CAD formats. `cadPlugin()` uses a two-layer model: it tries the built-in LibreDWG WASM DWG preview by default, then falls back to embedded thumbnails or metadata; applications can use `binaryRenderer` as the highest-priority override for custom renderers or server-side CAD conversion services.

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

DWG geometry preview uses optional LibreDWG WASM. The package can be installed by applications that want the default built-in DWG linework path:

```bash
npm install @mlightcad/libredwg-web
```

Copy `libredwg-web.wasm` to a public directory and point `cadPlugin` to it:

```ts
cadPlugin({ libreDwg: { wasmBaseUrl: "/vendor/libredwg-web" } });
```

Native browser video formats such as MP4, WebM and MOV do not need extra dependencies. HLS uses `hls.js`, which is bundled with the core package. FLV and MPEG-TS/M2TS playback is optional: install `mpegts.js` in your application only if you need those formats. If it is not installed, `videoPlugin()` shows the built-in download fallback for FLV/M2TS files.

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

## CAD Customization

`cadPlugin()` has two CAD preview layers:

1. Default built-in path: DWG automatically tries LibreDWG WASM. If linework cannot be produced but the file contains an embedded preview image, the plugin shows that thumbnail. If the engine is unavailable or parsing fails, it shows DWG/DWF metadata and conversion guidance.
2. External enhancement path: `binaryRenderer` can take over DWG/DWF completely for CADViewer, MxCAD, a custom WebGL/SVG renderer, or a backend PNG/PDF/SVG/DXF conversion service.

Use the built-in DWG preview for lightweight local rendering:

```ts
cadPlugin({ libreDwg: { wasmBaseUrl: "/vendor/libredwg-web" } });
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
      download: "下载",
      fullscreen: "全屏",
      search: "搜索"
    },
    order: ["search", "download", "approve", "fullscreen"],
    actions: [
      {
        id: "approve",
        label: "审批",
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

## License

MIT
