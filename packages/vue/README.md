# @open-file-viewer/vue

Vue adapter for Open File Viewer.

This package wraps `@open-file-viewer/core` as a Vue component while keeping the same plugin system, toolbar, theme and responsive container behavior.

- Website: https://open-file-viewer-workspace.void.app
- GitHub: https://github.com/xushanpei/open-file-viewer
- npm: https://www.npmjs.com/package/@open-file-viewer/vue

## Install

```bash
npm install @open-file-viewer/core @open-file-viewer/vue
```

PDF preview requires `pdfjs-dist`:

```bash
npm install pdfjs-dist
```

## Quick Start

```vue
<script setup lang="ts">
import { OpenFileViewer } from "@open-file-viewer/vue";
import {
  imagePlugin,
  officePlugin,
  pdfPlugin,
  textPlugin
} from "@open-file-viewer/core";
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

## Props

The component accepts the same preview options as `createViewer`, including:

- `file` / `files`
- `file-name`
- `width` / `height`
- `fit`
- `toolbar`
- `theme`
- `plugins`
- `on-load`
- `on-error`
- `on-unsupported`

## Custom Toolbar

Use the `toolbar` slot when the toolbar needs product-specific controls:

```vue
<OpenFileViewer :files="files" :plugins="plugins">
  <template #toolbar="ctx">
    <button :disabled="!ctx.canPrevious" @click="ctx.previous()">上一份</button>
    <span>{{ ctx.index + 1 }} / {{ ctx.length }}</span>
    <button :disabled="!ctx.canNext" @click="ctx.next()">下一份</button>
    <button @click="ctx.download()">下载</button>
    <button @click="openApprovalDialog(ctx.file)">审批</button>
  </template>
</OpenFileViewer>
```

For lighter customization, pass `toolbar.labels`, `toolbar.icons`, `toolbar.order` and `toolbar.actions`.

## License

MIT
