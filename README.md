# Open File Viewer

<p align="right">
  <strong>简体中文</strong>
  |
  <a href="./README.en.md">English</a>
  |
  <a href="./README.ja.md">日本語</a>
  |
  <a href="./README.ko.md">한국어</a>
  |
  <a href="./README.es.md">Español</a>
  |
  <a href="./README.pt-BR.md">Português</a>
</p>

Open File Viewer 是一个面向现代 Web 产品的文件预览 SDK。它把 PDF、Office、图片、音视频、压缩包、邮件、图纸、3D、GIS 和代码文件放进同一个可控容器里，并同时支持原生 JavaScript、React、Vue 和 Svelte。

<p>
  <a href="https://open-file-viewer-workspace.void.app">官网</a>
  ·
  <a href="https://open-file-viewer-workspace.void.app/about.html">关于我们</a>
  ·
  <a href="https://github.com/xushanpei/open-file-viewer">GitHub</a>
  ·
  <a href="https://www.npmjs.com/package/@open-file-viewer/core">NPM Core</a>
  ·
  <a href="https://www.npmjs.com/package/@open-file-viewer/react">React</a>
  ·
  <a href="https://www.npmjs.com/package/@open-file-viewer/vue">Vue</a>
  ·
  <a href="https://www.npmjs.com/package/@open-file-viewer/svelte">Svelte</a>
</p>

[![GitHub](https://img.shields.io/badge/GitHub-xushanpei%2Fopen--file--viewer-111827?logo=github)](https://github.com/xushanpei/open-file-viewer)
[![Core](https://img.shields.io/npm/v/@open-file-viewer/core?label=%40open-file-viewer%2Fcore&color=7c5cff)](https://www.npmjs.com/package/@open-file-viewer/core)
[![React](https://img.shields.io/npm/v/@open-file-viewer/react?label=react&color=149eca)](https://www.npmjs.com/package/@open-file-viewer/react)
[![Vue](https://img.shields.io/npm/v/@open-file-viewer/vue?label=vue&color=41b883)](https://www.npmjs.com/package/@open-file-viewer/vue)
[![Svelte](https://img.shields.io/npm/v/@open-file-viewer/svelte?label=svelte&color=ff3e00)](https://www.npmjs.com/package/@open-file-viewer/svelte)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## 为什么选择它

多数业务系统都会遇到附件预览：合同、表格、图纸、压缩包、邮件、图片、视频、代码文件。Open File Viewer 的目标不是做一个只能打开 PDF 的 demo，而是提供一套可以长期演进的文件预览基础设施。

- **容器优先**：所有内容渲染在你传入的 DOM 容器内，不跳窗口，不打断业务页面。
- **多框架兼容**：原生 JavaScript、React、Vue、Svelte 共用同一套 core 能力。
- **格式插件化**：不同文件格式由独立插件负责，方便替换、裁剪和扩展。
- **响应式预览**：支持 `px`、`%`、`vh`、`vw`、`rem`、`calc()` 等 CSS 尺寸，自动响应容器变化。
- **产品级状态**：内置 loading、error、unsupported、download fallback、工具栏、主题和多文件队列。
- **复杂格式可进化**：浏览器能直接预览的格式优先本地渲染，复杂格式可以逐步接入 WASM、专用解析器或服务端转换。

## 安装

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

PDF 预览需要安装 `pdfjs-dist`：

```bash
pnpm add pdfjs-dist
```

也可以使用 npm 或 yarn：

```bash
npm install @open-file-viewer/core
yarn add @open-file-viewer/core
```

## 快速开始

### 原生 JavaScript

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

## 适合的场景

| 场景 | Open File Viewer 提供什么 |
| --- | --- |
| OA / ERP / CRM 附件中心 | 合同、表格、图片、邮件、压缩包统一容器预览 |
| 网盘 / 知识库 / 文档系统 | 多文件队列、下载、搜索、全屏、主题适配 |
| 低代码 / 表单系统 | 原生 JS 接入，不强依赖 React、Vue 或 Svelte |
| 工程 / 制造 / GIS 系统 | CAD、3D、GIS、图纸类文件识别和渐进增强 |
| 开发者平台 / 日志平台 | 文本、配置、Markdown、代码高亮和大文件保护 |

## 能力概览

| 能力 | 状态 |
| --- | --- |
| 原生 JS / React / Vue / Svelte 接入 | 已支持 |
| 自定义容器、宽高和响应式尺寸 | 已支持 |
| 多文件队列、切换、当前索引 | 已支持 |
| 工具栏、下载、全屏、打印、搜索 | 已支持 |
| 明暗主题和 `auto` 主题 | 已支持 |
| 本地 `File` / `Blob` / URL / `ArrayBuffer` | 已支持 |
| 插件协议和自定义 fallback | 已支持 |
| PDF、图片、音视频、文本/代码 | 已支持 |
| Office、OFD、EPUB、XPS、邮件、压缩包 | 基础到增强预览 |
| CAD、3D、GIS、绘图白板、设计资产 | 识别、基础预览和增强中 |

## 格式覆盖

| 类别 | 插件 | 代表格式 |
| --- | --- | --- |
| 图片 | `imagePlugin()` | `jpg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp`, `tiff`, `heic`, `heif` |
| 视频 | `videoPlugin()` | `mp4`, `webm`, `mov`, `m4v`, `avi`, `mkv`, `flv`, `wmv`, `m3u8`, `m2ts` |
| 音频 | `audioPlugin()` | `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`, `opus`, `mid`, `wma` |
| 文本 / 代码 | `textPlugin()` | `txt`, `md`, `json`, `yaml`, `xml`, `csv`, `js`, `ts`, `tsx`, `vue`, `html`, `css`, `py`, `go`, `rs`, `sql`, `sh` |
| PDF / 电子书 | `pdfPlugin()`, `epubPlugin()`, `xpsPlugin()` | `pdf`, `epub`, `xps`, `oxps` |
| Office | `officePlugin()` | `docx`, `rtf`, `odt`, `xlsx`, `csv`, `pptx`, `odp`, `wps`, `et`, `dps` |
| OFD | `ofdPlugin()` | `ofd` |
| 压缩包 | `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| 邮件 | `emailPlugin()` | `eml`, `msg`, `mbox` |
| 绘图 / 白板 | `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| CAD / 工程 | `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs`, `ifc`, `skp`, `sldprt` |
| 3D 模型 | `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf`, `usd`, `usdz` |
| GIS | `gisPlugin()` | `geojson`, `topojson`, `kml`, `kmz`, `gpx`, `shp` |
| 资产识别 | `assetPlugin()` | `ttf`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro` |

复杂格式的预览质量会受浏览器能力、文件结构和依赖解析器影响。当前版本优先保证所有格式都在容器内走可控预览路径；高保真 Office、CAD、设计稿和专有二进制格式可以继续接入专用引擎或服务端转换。

## 核心 API

```ts
createViewer(options: PreviewOptions): FileViewer;
```

### PreviewOptions

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | 必填 | 预览容器 |
| `file` | `File \| Blob \| string \| ArrayBuffer` | - | 单文件预览源 |
| `files` | `(PreviewSource \| PreviewItem)[]` | - | 多文件预览队列 |
| `initialIndex` | `number` | `0` | 初始文件索引 |
| `fileName` | `string` | 自动推断 | 文件名，用于扩展名识别 |
| `mimeType` | `string` | 自动推断 | MIME 类型 |
| `width` | `number \| string` | 容器原始宽度 | 预览容器宽度 |
| `height` | `number \| string` | 容器原始高度 | 预览容器高度 |
| `fit` | `contain \| cover \| width \| height \| actual \| scale-down` | `contain` | 内容适配方式 |
| `plugins` | `PreviewPlugin[]` | `[]` | 插件列表，按顺序匹配 |
| `fallback` | `inline \| download \| custom` | `inline` | 不支持时的兜底策略 |
| `renderFallback` | `(ctx) => PreviewInstance` | - | 自定义 fallback 渲染器 |
| `toolbar` | `boolean \| PreviewToolbarOptions` | `false` | 工具栏配置 |
| `theme` | `light \| dark \| auto` | `light` | 预览器主题 |
| `className` | `string` | - | 容器附加类名 |
| `onLoad` | `(file) => void` | - | 加载完成回调 |
| `onError` | `(error, file) => void` | - | 错误回调 |
| `onUnsupported` | `(file) => void` | - | 不支持格式回调 |

## 工具栏自定义

`toolbar: true` 会启用默认工具栏。需要业务化时可以逐步扩展，不必重写整套预览器。

### 自定义文案、顺序和图标

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
      download: "下载",
      fullscreen: "全屏",
      search: "搜索",
      "zoom-in": "放大",
      "zoom-out": "缩小",
      "zoom-reset": "原始比例",
      "rotate-right": "旋转"
    },
    titles: {
      download: "下载当前文件"
    },
    icons: {
      download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>'
    },
    order: ["search", "zoom-out", "zoom-in", "zoom-reset", "rotate-right", "download", "fullscreen"]
  },
  plugins
});
```

### 增加业务按钮

```ts
createViewer({
  container: "#viewer",
  file,
  toolbar: {
    order: ["download", "favorite", "approve", "share", "fullscreen"],
    actions: [
      {
        id: "favorite",
        label: "收藏",
        onClick(ctx) {
          favoriteFile(ctx.file);
        }
      },
      {
        id: "approve",
        label: "审批",
        onClick(ctx) {
          openApprovalDialog(ctx.file);
        }
      },
      {
        id: "share",
        label: "分享",
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

### 完全替换工具栏

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
      next.textContent = "下一份";
      next.disabled = !ctx.canNext;
      next.onclick = () => void ctx.next();

      const download = document.createElement("button");
      download.type = "button";
      download.textContent = "下载";
      download.onclick = ctx.download;

      bar.append(name, next, download);
      return bar;
    }
  },
  plugins
});
```

`render(ctx)` 的上下文包含 `file`、`index`、`length`、`previous()`、`next()`、`command()`、`download()`、`fullscreen()`、`print()`、`search()` 和 `clearSearch()`。

### React 自定义工具栏

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

### Vue 自定义工具栏

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

### Svelte 自定义工具栏

```svelte
<OpenFileViewer files={files} plugins={plugins}>
  <svelte:fragment slot="toolbar" let:ctx>
    {#if ctx}
      <button disabled={!ctx.canPrevious} on:click={() => void ctx.previous()}>上一份</button>
      <span>{ctx.index + 1} / {ctx.length}</span>
      <button disabled={!ctx.canNext} on:click={() => void ctx.next()}>下一份</button>
      <button on:click={ctx.download}>下载</button>
      <button on:click={() => openApprovalDialog(ctx.file)}>审批</button>
    {/if}
  </svelte:fragment>
</OpenFileViewer>
```

样式层面仍然可以覆盖 `.ofv-toolbar`、`.ofv-toolbar button`、`.ofv-toolbar-search` 等 class。自定义图标按钮会额外生成 `.ofv-toolbar-icon` 和 `.ofv-toolbar-label`，方便控制对齐、间距和省略。

### FileViewer

| 方法 | 说明 |
| --- | --- |
| `reload(file?)` | 重新加载当前文件或指定文件 |
| `next()` / `previous()` | 多文件队列切换 |
| `goTo(index)` | 跳转到指定文件 |
| `getCurrentIndex()` | 获取当前索引 |
| `resize()` | 主动触发尺寸重算 |
| `destroy()` | 销毁预览器并清理资源 |

## 插件开发

每一种格式都通过插件接入。插件只需要回答两个问题：这个文件是否匹配，以及如何渲染到 `ctx.viewport`。

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

插件约束：

- 只渲染到 `ctx.viewport` 中。
- 不默认打开新窗口。
- 需要响应容器变化时实现 `resize(size)`。
- 需要清理事件、Object URL、定时器、Canvas/WebGL 资源时实现 `destroy()`。

## 包结构

```txt
packages/
  core/      # 框架无关的预览核心和插件
  react/     # React 适配层
  vue/       # Vue 适配层
  svelte/    # Svelte 适配层
examples/
  vanilla/   # 原生 JavaScript 示例
  react/     # React 示例
  vue/       # Vue 示例
  svelte/    # Svelte 示例
doc/         # 官网和在线体验
```

## 本地开发

```bash
pnpm install
pnpm check
```

常用命令：

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

`pnpm check` 会依次执行测试、类型检查、packages 构建、examples 构建、官网构建和 package exports 校验。

## 路线图

| 版本 | 重点 |
| --- | --- |
| `0.1.x` | Core 插件系统、容器内预览、React/Vue/Svelte/Vanilla 接入、多格式基础预览 |
| `0.2.x` | 工具栏、主题、图片交互、PDF 搜索、统一状态和 fallback |
| `0.3.x` | Markdown/代码阅读器、Office 表格和文档体验增强 |
| `0.4.x` | OFD、邮件、压缩包、绘图和国内业务高频格式增强 |
| `0.5.x` | CAD、3D、GIS、专用解析器和服务端转换协作 |
| `1.0.0` | API 稳定、完整文档站、视觉回归测试和插件开发指南 |

## 社区与支持

Open File Viewer 会持续完善更多格式预览、框架接入和真实业务场景。开源项目不容易，如果它帮你节省了开发时间，欢迎给项目点一个免费的 Star，这对项目后续迭代非常重要。

- 反馈问题：欢迎通过 GitHub Issue、交流群或作者微信反馈文件样例、排版问题、容器适配问题和新的格式诉求。
- 交流学习：公众号「前端开发爱好者」会持续分享前端工程、组件开发和开源实践。
- 支持作者：如果你愿意请作者喝杯咖啡，哪怕喝瓶娃哈哈矿泉水，也是非常真诚的鼓励。打赏用户欢迎添加作者微信，后续交流前端相关问题。

<table>
  <tr>
    <td align="center" width="20%">
      <img src="./doc/public/images/official-account-qr.jpg" width="140" alt="公众号二维码：前端开发爱好者" />
      <br />
      <strong>公众号</strong>
      <br />
      前端开发爱好者
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/community-group-qr.png" width="140" alt="交流群二维码" />
      <br />
      <strong>交流群</strong>
      <br />
      前端技术交流
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/author-wechat-qr.png" width="140" alt="作者微信二维码" />
      <br />
      <strong>作者微信</strong>
      <br />
      交流前端问题
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/wechat-donation-qr.png" width="140" alt="微信打赏二维码" />
      <br />
      <strong>微信打赏</strong>
      <br />
      请作者喝杯咖啡
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/alipay-donation-qr.png" width="140" alt="支付宝打赏二维码" />
      <br />
      <strong>支付宝打赏</strong>
      <br />
      请作者喝瓶水
    </td>
  </tr>
</table>

## 链接

- 官网：https://open-file-viewer-workspace.void.app
- 关于我们：https://open-file-viewer-workspace.void.app/about.html
- GitHub：https://github.com/xushanpei/open-file-viewer
- NPM Core：https://www.npmjs.com/package/@open-file-viewer/core
- NPM React：https://www.npmjs.com/package/@open-file-viewer/react
- NPM Vue：https://www.npmjs.com/package/@open-file-viewer/vue
- NPM Svelte：https://www.npmjs.com/package/@open-file-viewer/svelte

## License

[MIT](./LICENSE)
