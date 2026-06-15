# @open-file-viewer/react

React adapter for Open File Viewer.

This package wraps `@open-file-viewer/core` as a React component while keeping the same plugin system, toolbar, theme and responsive container behavior.

- Website: https://open-file-viewer-workspace.void.app
- GitHub: https://github.com/xushanpei/open-file-viewer
- npm: https://www.npmjs.com/package/@open-file-viewer/react

## Install

```bash
npm install @open-file-viewer/core @open-file-viewer/react
```

PDF preview requires `pdfjs-dist`:

```bash
npm install pdfjs-dist
```

## Quick Start

```tsx
import { FileViewer } from "@open-file-viewer/react";
import {
  imagePlugin,
  officePlugin,
  pdfPlugin,
  textPlugin
} from "@open-file-viewer/core";
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

## Props

The component accepts the same preview options as `createViewer`, including:

- `file` / `files`
- `fileName`
- `width` / `height`
- `fit`
- `toolbar`
- `theme`
- `plugins`
- `onLoad`
- `onError`
- `onUnsupported`

## Custom Toolbar

Use `renderToolbar` when the toolbar needs product-specific controls:

```tsx
<FileViewer
  files={files}
  plugins={plugins}
  renderToolbar={(ctx) => (
    <>
      <button disabled={!ctx.canPrevious} onClick={() => void ctx.previous()}>上一份</button>
      <span>{ctx.index + 1} / {ctx.length}</span>
      <button disabled={!ctx.canNext} onClick={() => void ctx.next()}>下一份</button>
      <button onClick={ctx.download}>下载</button>
      <button onClick={() => openApprovalDialog(ctx.file)}>审批</button>
    </>
  )}
/>
```

For lighter customization, pass `toolbar.labels`, `toolbar.icons`, `toolbar.order` and `toolbar.actions`.

## License

MIT
