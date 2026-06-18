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

## Ant Design Modal

When previewing PDFs inside `Modal`, import the PDF worker with your bundler instead of hard-coding `/pdf.worker.min.mjs`. A hard-coded root path only works if that worker file is actually copied to your app's public root.

```tsx
import { FileViewer } from "@open-file-viewer/react";
import { imagePlugin, officePlugin, pdfPlugin, textPlugin } from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Modal } from "antd";
import { useMemo } from "react";

export function AttachmentModal({ open, file, onClose }: { open: boolean; file?: File; onClose: () => void }) {
  const plugins = useMemo(
    () => [imagePlugin(), pdfPlugin({ workerSrc: pdfWorkerSrc }), officePlugin(), textPlugin()],
    []
  );

  return (
    <Modal open={open} onCancel={onClose} width="80vw" destroyOnHidden footer={null}>
      {open && file ? (
        <FileViewer
          file={file}
          fileName={file.name}
          width="100%"
          height="calc(75vh - 48px)"
          fit="contain"
          toolbar
          plugins={plugins}
        />
      ) : null}
    </Modal>
  );
}
```

For remote PDFs, make sure the file URL is readable by the browser and has the right CORS headers. If it is a private file, sign a temporary URL on your backend or fetch it as a `Blob` first.

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
