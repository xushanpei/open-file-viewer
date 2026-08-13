# Open File Viewer

<p align="right">
  <strong>简体中文</strong>
  |
  <a href="./README.md">English</a>
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

### Vite / Rollup 依赖分包

文本语法、Markdown 和邮件解析依赖会在对应插件首次使用时异步加载。Prism 语言组件会按照依赖关系
顺序加载（例如 `java` 完成后才执行 `scala`），不需要在业务入口手工预加载全部语言。

如果 monorepo 或组件库中存在多份 Prism，可以在 Vite 中启用依赖去重。不要把全部 Prism 语言
组件手工合并到同一个 vendor chunk；保留默认拆分才能让依赖按照异步调用顺序执行。邮件解析器可以
按需单独分包：

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    dedupe: ["prismjs"]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/postal-mime/") || id.includes("/@kenjiuno/msgreader/")) return "ofv-email";
        }
      }
    }
  }
});
```

`manualChunks` 不是必需配置。如果项目已有统一的 vendor 分包函数，请让 `/prismjs/components/`
返回 `undefined`，避免把所有带副作用的语言组件折叠到同一个 chunk。

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

使用同一组插件，可在挂载预览器前判断文件是否有可用预览路径：

```ts
import { isPreviewSupported } from "@open-file-viewer/core";

const supported = await isPreviewSupported(fileOrUrl, plugins, {
  fileName: "contract.pdf",
  mimeType: "application/pdf"
});
```

该函数与 `createViewer()` 共用文件规范化逻辑，并按顺序调用
`plugin.match()`；它不会挂载 DOM，也不会调用 `plugin.render()`，且不会把
`fallbackPlugin()` 计为原生预览支持。判断时请保持与 viewer 相同的插件顺序；
匹配到 `fallbackPlugin()` 后会终止判断，不应将它放在原生插件前。

### Umi / utoo 中 PDF 预览失败

如果在 Umi Max、utoo pack 等环境中看到 PDF fallback，并且控制台里有 pdf.js 的
`Cannot set properties of undefined (setting 'onPull')`，通常是构建器和 pdf.js worker
的流式读取通道不兼容。可以开启 `useFetchData`，由主线程先把 PDF 拉成字节后再交给
pdf.js 渲染：

```ts
pdfPlugin({
  workerSrc,
  useFetchData: true
});
```

这个选项会多占用一份 PDF 文件内存，建议只在遇到上述兼容问题时开启。

### 360 浏览器 PDF 兼容

`pdfPlugin()` 默认使用 `compatibilityMode: "auto"`。当检测到 360 浏览器标识，或当前 Chromium
缺少 PDF.js 4 依赖的 `Promise.withResolvers` 时，会自动补齐兼容实现并切换到 PDF.js legacy worker。
如果企业环境修改了浏览器 UA，无法被自动识别，可以显式开启：

```ts
pdfPlugin({
  compatibilityMode: "legacy"
});
```

需要自行托管 worker 时，请让 `workerSrc` 指向同版本的
`pdfjs-dist/legacy/build/pdf.worker.min.mjs`。确认只面向现代 Chrome、Edge 时，也可以设置
`compatibilityMode: "modern"`。

### 远程 PDF fallback 的跨浏览器兼容

当 PDF.js 无法解析或加载远程 PDF URL 时，PDF 插件会使用浏览器内置的 PDF 阅读器作为
iframe fallback。不同 Chromium 浏览器对沙箱 iframe 内置阅读器的脚本权限要求并不完全一致，
因此 `webFallbackScripts` 默认使用 `"auto"`：

- 跨域 PDF URL 会在保留 sandbox 的同时加入 `allow-scripts`，兼容 Edge、360 等内置阅读器；
- 同源 URL 默认仍禁止脚本，避免同时开放脚本执行和同源权限。

业务方可以收紧策略，或只在完全可信的同源 PDF 服务中主动放开：

```ts
pdfPlugin({ webFallbackScripts: "never" });  // 始终使用严格沙箱
pdfPlugin({ webFallbackScripts: "always" }); // 仅用于可信 PDF 地址
```

该配置只影响远程 iframe fallback，不改变正常 PDF.js 渲染，也不会强制设置
`referrerpolicy`。

### qiankun / micro-app 子应用中 Office 预览一直加载

在 qiankun、micro-app 等微前端沙箱里，jszip 依赖的 `setImmediate` polyfill 基于
window `message` 事件监听器实现，而沙箱会在子应用卸载时移除这些监听器，导致
`JSZip.loadAsync` 永远不返回——docx / xlsx / pptx / epub / ofd 等所有 zip 类预览会
一直停留在"正在加载"（参见 [qiankun#2589](https://github.com/umijs/qiankun/issues/2589)）。

`createViewer()` 检测到 `__POWERED_BY_QIANKUN__`、`__MICRO_APP_ENVIRONMENT__` 等
标志时，会自动换成基于 MessageChannel 的安全调度器，无需额外配置。如果使用的是
0.1.27 及更早版本，可以在子应用入口的所有 import 之前手动补丁：

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
| Office、OFD、EPUB、XPS、邮件、压缩包 | 基础到增强预览，XPS 含轻量 FixedPage SVG 版式 |
| CAD、3D、GIS、绘图白板、设计资产、数据文件 | 识别、基础预览和增强中，SQLite/PSD/PDF-compatible AI 已内置前端内容预览 |

## 格式覆盖

| 类别 | 插件 | 代表格式 |
| --- | --- | --- |
| 图片 | `imagePlugin()` | `jpg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp`, `tiff`, `heic`, `heif` |
| 视频 | `videoPlugin()` | `mp4`, `webm`, `mov`, `m4v`, `avi`, `mkv`, `flv`, `wmv`, `m3u8`, `m2ts` |
| 音频 | `audioPlugin()` | `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`, `opus`, `mid`, `wma` |
| 文本 / 代码 | `textPlugin()` | `txt`, `lrc`, `md`, `json`, `yaml`, `xml`, `csv`, `js`, `ts`, `tsx`, `vue`, `html`, `css`, `py`, `go`, `rs`, `sql`, `sh` |
| PDF / 电子书 | `pdfPlugin()`, `epubPlugin()`, `xpsPlugin()` | `pdf`, `epub`, `xps`, `oxps` |
| Office | `officePlugin()` | `doc`, `docx`, `docm`, `dot`, `rtf`, `odt`, `xls`, `xlsx`, `xlsm`, `xlsb`, `csv`, `ppt`, `pps`, `pptx`, `pptm`, `odp`, `wps`, `et`, `dps` |
| OFD | `ofdPlugin()` | `ofd` |
| 压缩包 | `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| 数据 / 资产 | `assetPlugin()` | `sqlite`, `db`, `parquet`, `avro`, `wasm`, `psd`, `psb`, `ai`, `eps`, `ps`, `webarchive`, `ttf`, `otf`, `woff`, `woff2` |
| 邮件 | `emailPlugin()` | `eml`, `msg`, `mbox` |
| 绘图 / 白板 | `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| 思维导图 | `xmindPlugin()` | `xmind` |
| CAD / 工程 / 芯片版图 | `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs`, `ifc`, `skp`, `sldprt`, `gds`, `gdsii`, `oas`, `oasis` |
| 3D 模型 | `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf`, `usd`, `usdz` |
| GIS | `gisPlugin()` | `geojson`, `topojson`, `kml`, `kmz`, `gpx`, `shp` |
| 资产识别 | `assetPlugin()` | `ttf`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro` |

复杂格式的预览质量会受浏览器能力、文件结构和依赖解析器影响。当前版本优先保证所有格式都在容器内走可控预览路径；高保真 Office、CAD、设计稿和专有二进制格式可以继续接入专用引擎或服务端转换。

旧版 `ppt` / `pps` 默认走本地 OLE 与 PowerPoint 二进制格式解析，可还原幻灯片尺寸、定位文本、母版位图、JPEG/PNG/TIFF 图片以及常见的压缩 EMF/WMF 图形，文件不会被自动上传。不支持的绘图记录会安全降级；如果业务要求与 Office 像素级一致，仍建议配置 `officePlugin({ convert })`。

### 高保真 Office 转 PDF

浏览器端 DOCX/PPTX/XLSX 解析无法完全复刻 Word/WPS 的排版引擎。带有文本框、绝对定位、复杂字体、页眉页脚或旧版二进制格式的 Office 文件，建议在业务服务端用 LibreOffice、OnlyOffice 或 Microsoft Graph 转成 PDF，再交给内置 PDF 预览渲染。

`officePlugin` 提供可选的 `convert` 钩子。默认不会上传文件；只有业务显式配置这个钩子时，复杂 DOCX 和旧版 Office 才会走转换链路：

```ts
officePlugin({
  pdf: {
    workerSrc: pdfWorkerSrc
  },
  async convert({ file, arrayBuffer, reason }) {
    const form = new FormData();
    form.append("file", new Blob([arrayBuffer]), file.name);
    form.append("reason", reason);

    const response = await fetch("/api/office/convert-to-pdf", {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      throw new Error("Office 转 PDF 失败");
    }

    return {
      blob: await response.blob(),
      fileName: file.name.replace(/\.[^.]+$/, ".pdf"),
      mimeType: "application/pdf"
    };
  }
});
```

`reason` 目前会标记为 `complex-docx` 或 `legacy-office`。如果转换接口返回的是可访问的 PDF URL，也可以直接 `return { url, fileName: "preview.pdf", mimeType: "application/pdf" }`。

视频预览中，MP4、WebM、MOV 等浏览器原生格式不需要额外依赖；HLS 由内置的 `hls.js` 处理；FLV 和 MPEG-TS/M2TS 属于可选增强能力，需要业务项目自行安装 `mpegts.js`。未安装时会展示下载 fallback，避免安装 `@open-file-viewer/core` 时被 `mpegts.js` 的 git 子依赖影响。

如果业务确实需要 FLV/M2TS，并且 pnpm 11 开启了 `blockExoticSubdeps`，可以在业务项目中覆盖 `mpegts.js` 的传递依赖：

```json
{
  "pnpm": {
    "overrides": {
      "webworkify-webpack": "2.1.5"
    }
  }
}
```

### DWG / DWF 预览模型

DWG 是 AutoCAD 专有二进制格式，`cadPlugin()` 可以使用高保真 WebGL 场景、内置轻量 SVG 链路或业务自定义渲染器。

- **高保真 WebGL 能力**：配置 `webglDwg` 后，DWG 会在 Worker 中解析，并在可交互 CAD Canvas 中绘制图层、块、填充、线型和文字。配置后若渲染失败会直接抛出错误，不会静默切回 SVG。
- **默认内置能力**：`cadPlugin()` 会自动尝试 LibreDWG WASM 渲染 DWG 模型空间线稿；如果线稿不可靠但文件包含内置缩略图，会展示 DWG 缩略图；如果 LibreDWG 未安装、WASM 未配置或解析失败，则展示 DWG/DWF 元信息、版本、结构线索和转换建议。
- **外部增强能力**：通过 `cadPlugin({ binaryRenderer })` 接入自己的前端引擎、CADViewer、MxCAD、后端转换 PNG/PDF/SVG/DXF 等。`binaryRenderer` 优先级最高，返回实例后会完全接管 DWG/DWF 预览。
- **高保真商用链路**：复杂字体、外部参照、布局/打印空间、大图纸和专业 CAD 效果，建议接入成熟 CAD SDK 或服务端转换。

推荐按下面的方式接入高保真渲染：

```bash
npm install @mlightcad/cad-simple-viewer@1.5.9 @mlightcad/data-model@1.12.3 lodash-es@4.17.21
```

将已安装的 `@mlightcad/cad-simple-viewer/dist/` 目录中的
`libredwg-parser-worker.js` 和 `mtext-renderer-worker.js` 复制到业务的公开静态目录，
然后配置对应目录：

```ts
cadPlugin({
  webglDwg: {
    engineLoader: () => import("@mlightcad/cad-simple-viewer"),
    workerBaseUrl: "/vendor/cad-engine"
  }
});
```

显式传入 `engineLoader` 可以让未配置 WebGL DWG 预览的构建不包含这个可选引擎，
也让严格的 esbuild 依赖解析能够在业务侧解析该包。

WebGL 包使用 MIT 许可；其发布的 DWG 解析 Worker 基于 LibreDWG，业务仍需检查该
Worker 的许可证要求。可通过 `webglDwg.baseUrl` 配置 CAD 字体资源，只有确认拥有
分发权的字体才应自行托管。

轻量 LibreDWG SVG 链路可按下面方式接入：

1. 安装可选依赖。固定版本可以保证每次复制出的浏览器资源一致。

```bash
npm install @mlightcad/libredwg-web@0.7.4
```

2. 在业务项目中新增 `scripts/copy-libredwg-assets.mjs`。下面以 Vite、Next.js
   常用的 `public/` 静态目录为例；其他框架只需修改 `targetRoot`。

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

3. 在本地开发和生产构建之前执行复制脚本：

```json
{
  "scripts": {
    "assets:dwg": "node scripts/copy-libredwg-assets.mjs",
    "predev": "npm run assets:dwg",
    "prebuild": "npm run assets:dwg"
  }
}
```

如果项目已经有 `predev` 或 `prebuild`，把资源复制命令追加到原脚本中，不要直接
覆盖原有命令。

4. 保留 LibreDWG 包内的 `dist/`、`wasm/` 目录结构，并配置浏览器可直接加载的
   ESM 入口。推荐开启 Worker，避免大 DWG 在主线程解析时卡住界面：

```ts
cadPlugin({
  libreDwg: {
    wasmBaseUrl: "/vendor/libredwg-web/wasm",
    workerModuleUrl: "/vendor/libredwg-web/dist/libredwg-web.js",
    workerTimeoutMs: 120_000
  }
});
```

启动项目后，确认下面两个地址都能返回 `200`：

```text
/vendor/libredwg-web/dist/libredwg-web.js
/vendor/libredwg-web/wasm/libredwg-web.wasm
```

如果应用部署在二级路径下，需要给两个配置地址都加上应用的公共基础路径；服务器
应使用 `application/wasm` 作为 `.wasm` 文件的 MIME 类型。

这里配置的是业务自行托管的静态资源，并不是运行时从外部 CDN 加载。文档站会在
`predev` 和 `prebuild` 阶段执行 `doc/scripts/copy-libredwg-assets.mjs`，把锁定版本
的 npm 包中的 `dist/`、`wasm/` 复制到
`doc/public/vendor/libredwg-web/`。这两个目录可以由依赖稳定重建，并且包含约 6 MB
的 WASM 文件，因此仓库通过 `.gitignore` 排除生成结果。业务项目也应在自己的构建
或部署流程中增加同等的复制步骤；如果部署平台无法执行构建脚本，则需要预先发布
复制后的静态资源。

`@mlightcad/libredwg-web` 是可选的 GPL-3.0 依赖，因此不会直接打包进 MIT 许可的
core 包。启用该能力的业务需要结合自己的分发方式确认上游许可证要求。

配置后，DWG 副本会作为 transferable 传入独立 Worker；切换文件、销毁 viewer
或解析超时都会终止该 Worker。ESM 与 WASM 需要同源部署，或者返回正确的 CORS
响应头；CSP 还需要在 `worker-src` 中允许模块 Worker 与 `blob:`。不能允许
`blob:` 时可通过 `workerFactory` 提供自托管 Worker。未配置 Worker 地址或显式
设置 `useWorker: false` 时，会保留原来的主线程 SVG/缩略图回退链路。

```ts
cadPlugin({
  async binaryRenderer({ panel, extension, arrayBuffer, fileName }) {
    if (extension !== "dwg") return;

    const stage = document.createElement("div");
    stage.className = "my-dwg-stage";
    panel.append(stage);

    // 在这里按需加载你的 DWG 引擎、worker、字体和资源包。
    // 例如：await renderDwgWithYourEngine(stage, arrayBuffer, { fileName });

    return {
      destroy() {
        stage.remove();
      }
    };
  }
});
```

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
| `initialPage` | `number` | `1` | 分页预览的初始页码，从 1 开始 |
| `fileName` | `string` | 自动推断 | 文件名，用于扩展名识别 |
| `mimeType` | `string` | 自动推断 | MIME 类型 |
| `width` | `number \| string` | 容器原始宽度 | 预览容器宽度 |
| `height` | `number \| string` | 容器原始高度 | 预览容器高度 |
| `zoom` | `number` | `1` | 初始缩放比例，`1` 表示 100% |
| `fit` | `contain \| cover \| width \| height \| actual \| scale-down` | `contain` | 内容适配方式。直接预览 PDF 且未传该参数时，连续阅读器默认按 `width` 适宽；显式传 `contain` 时仍同时适配宽高。 |
| `plugins` | `PreviewPlugin[]` | `[]` | 插件列表，按顺序匹配 |
| `fallback` | `inline \| download \| custom` | `inline` | 不支持时的兜底策略 |
| `locale` | `zh-CN \| en-US` | `en-US` | 内置状态、fallback、工具栏及插件文案语言 |
| `messages` | `Partial<PreviewMessages>` | - | 覆盖基础文案及 PDF、图片、文本、Office 等插件文案，也允许自定义 key |
| `renderFallback` | `(ctx) => PreviewInstance` | - | 自定义 fallback 渲染器 |
| `toolbar` | `boolean \| PreviewToolbarOptions` | `false` | 工具栏配置 |
| `theme` | `light \| dark \| auto` | `light` | 预览器主题 |
| `className` | `string` | - | 容器附加类名 |
| `onLoad` | `(file) => void` | - | 加载完成回调 |
| `onError` | `(error, file) => void` | - | 错误回调 |
| `onUnsupported` | `(file) => void` | - | 不支持格式回调 |

### 多语言和 fallback 文案

内置状态、fallback、默认工具栏和插件提示文案均为英文。中文产品可以设置 `locale: "zh-CN"`；`messages` 可覆盖 PDF、图片、文本、Office 等插件的单条文案，也允许为自定义插件增加任意字符串 key。工具栏仍可通过 `toolbar.labels` / `toolbar.titles` 进一步定制：

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

PDF 预览会显示当前页码、总页数以及上一页/下一页按钮。可以直接在页码输入框中输入目标页并按 Enter 跳转，滚动文档时页码也会自动同步。

## 工具栏自定义

`toolbar: true` 会启用默认工具栏，其文案自动跟随顶层 `locale`。需要业务化时可以逐步扩展，不必重写整套预览器。

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

`render(ctx)` 的上下文包含 `file`、`index`、`length`、`previous()`、`next()`、`goToPage(page)`、`command()`、`download()`、`fullscreen()`、`print()`、`search()` 和 `clearSearch()`。

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
| `goToPage(page)` | 跳转到 PDF、DOCX、OFD、XPS、TIFF 等分页预览的指定页码（从 1 开始） |
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

- 反馈问题：欢迎通过 GitHub Issue 反馈文件样例、排版问题、容器适配问题和新的格式诉求。

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
