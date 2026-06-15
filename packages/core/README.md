# @open-file-viewer/core

Framework-agnostic browser file preview core for Open File Viewer.

Open File Viewer renders files inside your own DOM container instead of opening a new window. It supports images, PDF, Office documents, audio, video, text/code, archives, email, drawings, CAD, 3D and GIS formats through a plugin-based pipeline.

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

React and Vue adapters are available as separate packages:

```bash
npm install @open-file-viewer/react
npm install @open-file-viewer/vue
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
