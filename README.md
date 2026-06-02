# Open File Viewer

一个面向浏览器的文件预览库，支持原生 JavaScript、React 和 Vue。核心目标是把文件预览嵌入到你自己的页面容器里，而不是跳转到新窗口。

## 设计目标

- 容器优先：所有预览都渲染在用户传入的 DOM 容器内。
- 宽高可控：容器宽高支持 `px`、`%`、`vh`、`vw`、`rem`、`calc()` 等 CSS 尺寸。
- 自适应：图片、视频、PDF、文本等内容会根据容器尺寸自动缩放、滚动或重排。
- 多框架：核心包不绑定框架，同时提供 React 和 Vue 适配层。
- 插件化：每一种文件能力都通过插件接入，主包保持轻量。
- 前端优先：浏览器原生支持的格式直接预览，复杂格式通过解析库、WASM 或服务端转换插件扩展。

## 项目状态

当前是可迭代的 MVP 骨架，已经包含：

- `@open-file-viewer/core`
- `@open-file-viewer/react`
- `@open-file-viewer/vue`
- Vanilla 示例
- React 示例
- Vue 示例
- 图片、视频、音频、文本、PDF、fallback 插件

## 安装

```bash
pnpm add @open-file-viewer/core
```

React：

```bash
pnpm add @open-file-viewer/core @open-file-viewer/react
```

Vue：

```bash
pnpm add @open-file-viewer/core @open-file-viewer/vue
```

PDF 预览依赖 `pdfjs-dist`：

```bash
pnpm add pdfjs-dist
```

## 原生 JavaScript 使用

```ts
import {
  createViewer,
  imagePlugin,
  videoPlugin,
  audioPlugin,
  textPlugin,
  pdfPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

const viewer = createViewer({
  container: document.querySelector("#viewer"),
  file: fileOrUrl,
  fileName: "demo.pdf",
  width: "100%",
  height: "70vh",
  fit: "contain",
  plugins: [
    imagePlugin(),
    videoPlugin(),
    audioPlugin(),
    textPlugin(),
    pdfPlugin({ workerSrc: pdfWorkerSrc })
  ]
});

viewer.resize();
viewer.destroy();
```

## React 使用

```tsx
import {
  imagePlugin,
  videoPlugin,
  audioPlugin,
  textPlugin,
  pdfPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import { FileViewer } from "@open-file-viewer/react";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

const plugins = [
  imagePlugin(),
  videoPlugin(),
  audioPlugin(),
  textPlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc })
];

export function AttachmentPreview({ file }: { file: File }) {
  return (
    <FileViewer
      file={file}
      fileName={file.name}
      width="100%"
      height="640px"
      fit="contain"
      plugins={plugins}
    />
  );
}
```

## Vue 使用

```vue
<script setup lang="ts">
import {
  imagePlugin,
  videoPlugin,
  audioPlugin,
  textPlugin,
  pdfPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import { OpenFileViewer } from "@open-file-viewer/vue";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

defineProps<{
  file: File
}>();

const plugins = [
  imagePlugin(),
  videoPlugin(),
  audioPlugin(),
  textPlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc })
];
</script>

<template>
  <OpenFileViewer
    :file="file"
    :file-name="file.name"
    width="100%"
    height="640px"
    fit="contain"
    :plugins="plugins"
  />
</template>
```

## 核心 API

```ts
createViewer(options: PreviewOptions): FileViewer
```

### PreviewOptions

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | 必填 | 预览容器 |
| `file` | `File \| Blob \| string \| ArrayBuffer` | 单文件必填 | 文件对象、Blob、URL 或 ArrayBuffer |
| `files` | `(PreviewSource \| PreviewItem)[]` | - | 多文件预览队列 |
| `initialIndex` | `number` | `0` | 多文件队列初始预览索引 |
| `fileName` | `string` | 自动推断 | 文件名，用于识别扩展名 |
| `mimeType` | `string` | 自动推断 | MIME 类型 |
| `width` | `number \| string` | 容器原始宽度 | 预览容器宽度 |
| `height` | `number \| string` | 容器原始高度 | 预览容器高度 |
| `fit` | `PreviewFit` | `contain` | 内容适配方式 |
| `plugins` | `PreviewPlugin[]` | `[]` | 预览插件列表 |
| `fallback` | `inline \| download \| custom` | `inline` | 不支持时的兜底策略 |
| `renderFallback` | `(ctx) => PreviewInstance` | - | `fallback: "custom"` 时的自定义兜底渲染 |
| `toolbar` | `boolean \| PreviewToolbarOptions` | `false` | 显示下载、全屏、打印等基础工具栏 |
| `theme` | `light \| dark \| auto` | `light` | 预览器主题 |
| `onLoad` | `(file) => void` | - | 预览加载完成 |
| `onError` | `(error, file) => void` | - | 预览失败 |
| `onUnsupported` | `(file) => void` | - | 文件不支持 |

### fit 适配模式

| 值 | 说明 |
| --- | --- |
| `contain` | 完整显示，保持比例，默认推荐 |
| `cover` | 填满容器，可能裁切 |
| `width` | 按容器宽度适配，适合 PDF 和文档 |
| `height` | 按容器高度适配 |
| `actual` | 原始尺寸 |
| `scale-down` | 小文件原始显示，大文件缩小 |

## 插件协议

每一种格式都通过插件接入：

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

插件必须做到：

- 只渲染到 `ctx.viewport` 中。
- 不默认打开新窗口。
- 需要响应容器变化时实现 `resize(size)`。
- 需要清理事件、Object URL、定时器、Canvas/WebGL 资源时实现 `destroy()`。

## 当前内置插件

| 插件 | 格式 |
| --- | --- |
| `imagePlugin()` | `jpg`, `jpeg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp`, `ico`, `tif`, `tiff`, `apng`, `heic`, `heif` |
| `videoPlugin()` | `mp4`, `webm`, `ogg`, `ogv`, `mov`, `m4v`, `avi`, `mkv`, `flv`, `wmv`, `3gp`, `ts`, `m3u8` |
| `audioPlugin()` | `mp3`, `wav`, `ogg`, `oga`, `aac`, `m4a`, `flac`, `opus`, `weba`, `amr`, `wma` |
| `textPlugin()` | `txt`, `log`, `json`, `xml`, `yaml`, `yml`, `csv`, `md`, `markdown`, `js`, `ts`, `tsx`, `jsx`, `vue`, `css`, `html`, `java`, `py`, `go`, `rs`, `php`, `c`, `cpp`, `h`, `hpp`, `cs`, `sql`, `sh`, `diff`, `patch` |
| `pdfPlugin()` | `pdf` |
| `officePlugin()` | `docx`, `doc`, `dotx`, `dot`, `rtf`, `odt`, `fodt`, `wps`, `xlsx`, `xls`, `xlsm`, `xlsb`, `csv`, `tsv`, `ods`, `fods`, `numbers`, `et`, `pptx`, `ppt`, `pps`, `ppsx`, `odp`, `fodp`, `key`, `dps` |
| `ofdPlugin()` | `ofd` |
| `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| `emailPlugin()` | `eml`, `msg`, `mbox` |
| `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs` |
| `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf` |
| `fallbackPlugin()` | 所有未匹配格式 |

注意：扩展名在列表里不代表所有格式都已经高保真还原。当前版本已经让这些格式进入容器内对应插件路径，但复杂格式会分为不同能力级别：

- 原生预览：图片、视频、音频、文本、PDF。
- 基础解析预览：`docx`、`rtf`、`odt/fodt`、`xlsx/xls/csv/ods`、`pptx/ppsx`、`odp/fodp`、`ofd`、`zip`、`eml`、`drawio`、`excalidraw`、`dxf`、`gltf/glb/obj/stl`。
- 已识别但需要增强：`doc`、`ppt`、`dwg`、`msg`、`rar/7z`、`numbers/key`、`wps/et/dps`、`fbx/dae/ply/3mf` 等建议后续接入 WASM、专用解析器或服务端转换。

视频、音频能否播放还取决于浏览器支持的容器和编码格式。`heic/heif`、`avi/mkv/flv/wmv` 等格式通常需要浏览器支持、转码或后续插件增强。

## 实现清单

勾选表示当前代码已经有对应预览实现，并且会在自定义容器内完成渲染。未勾选表示已经列入规划，或当前仅能识别格式并显示提示，还没有达到真正可用的预览能力。

### 基础能力

- [x] 自定义容器内预览
- [x] 容器宽高自定义
- [x] 容器尺寸变化后自适应
- [x] 原生 JavaScript 接入
- [x] React 组件接入
- [x] Vue 组件接入
- [x] 插件化预览协议
- [x] 加载状态
- [x] 错误状态
- [x] 不支持格式的容器内 fallback
- [x] 文件 URL 预览
- [x] 本地 File/Blob 预览
- [x] ArrayBuffer 预览
- [x] 基础工具栏
- [x] 主题系统
- [x] 全屏预览
- [x] 打印
- [x] 搜索
- [x] 多文件预览队列

### 图片

- [x] `jpg`
- [x] `jpeg`
- [x] `png`
- [x] `gif`
- [x] `webp`
- [x] `avif`
- [x] `svg`
- [x] `bmp`
- [x] `ico`
- [x] `tif`
- [x] `tiff`
- [x] `apng`
- [ ] `heic`
- [ ] `heif`
- [x] 图片缩放工具栏
- [x] 图片旋转
- [x] 图片拖拽平移

### 视频

- [x] `mp4`
- [x] `webm`
- [x] `ogg`
- [x] `ogv`
- [x] `mov`
- [x] `m4v`
- [ ] `avi`
- [ ] `mkv`
- [ ] `flv`
- [ ] `wmv`
- [ ] `3gp`
- [ ] `ts`
- [ ] `m3u8`
- [ ] HLS 播放增强
- [ ] 视频转码 fallback

### 音频

- [x] `mp3`
- [x] `wav`
- [x] `ogg`
- [x] `oga`
- [x] `aac`
- [x] `m4a`
- [x] `flac`
- [x] `opus`
- [x] `weba`
- [ ] `amr`
- [ ] `wma`

### PDF / 版式文档

- [x] `pdf`
- [x] PDF.js worker 配置
- [x] PDF 按容器宽度自适应渲染
- [ ] PDF 分页虚拟滚动
- [ ] PDF 文本层
- [ ] PDF 搜索
- [ ] PDF 选择复制
- [x] `ofd` 基础文本和结构预览
- [ ] `ofd` 版式渲染
- [ ] `xps`
- [ ] `epub`

### Word 文档

- [x] `docx` 基础 HTML 预览
- [x] `dotx` 基础 HTML 预览
- [ ] `doc`
- [ ] `dot`
- [x] `rtf`
- [x] `odt`
- [x] `fodt`
- [ ] `wps`
- [x] Word 图片基础预览
- [ ] Word 复杂样式高保真
- [x] Word 页眉页脚
- [x] Word 批注

### 表格

- [x] `xlsx`
- [x] `xls`
- [x] `xlsm`
- [x] `xlsb`
- [x] `csv`
- [x] `tsv`
- [x] `ods`
- [ ] `fods`
- [ ] `numbers`
- [ ] `et`
- [ ] 表格冻结行列
- [ ] 表格公式展示
- [ ] 表格图表预览
- [ ] 大表格虚拟滚动

### 演示文稿

- [x] `pptx` 文本提取预览
- [x] `ppsx` 文本提取预览
- [ ] `ppt`
- [ ] `pps`
- [x] `odp`
- [x] `fodp`
- [ ] `key`
- [ ] `dps`
- [x] PPT 图片预览
- [ ] PPT 布局还原
- [ ] PPT 动画预览

### 文本 / 代码

- [x] `txt`
- [x] `log`
- [x] `json`
- [x] `xml`
- [x] `yaml`
- [x] `yml`
- [x] `csv`
- [x] `md`
- [x] `markdown`
- [x] `js`
- [x] `mjs`
- [x] `cjs`
- [x] `ts`
- [x] `tsx`
- [x] `jsx`
- [x] `vue`
- [x] `css`
- [x] `html`
- [x] `htm`
- [x] `java`
- [x] `py`
- [x] `go`
- [x] `rs`
- [x] `php`
- [x] `c`
- [x] `cpp`
- [x] `h`
- [x] `hpp`
- [x] `cs`
- [x] `sql`
- [x] `sh`
- [x] `diff`
- [x] `patch`
- [ ] Markdown 渲染增强
- [ ] 代码高亮
- [ ] Monaco 代码预览

### CAD / 图纸

- [x] `dxf` 的 `LINE` / `CIRCLE` 基础 SVG 渲染
- [ ] `dwg`
- [ ] `dwf`
- [ ] `step`
- [ ] `stp`
- [ ] `iges`
- [ ] `igs`
- [ ] DXF 更多图元
- [ ] 图纸缩放和平移工具
- [ ] 图层开关

### 3D 模型

- [x] `gltf`
- [x] `glb`
- [x] `obj`
- [x] `stl`
- [ ] `fbx`
- [ ] `dae`
- [ ] `ply`
- [ ] `3mf`
- [x] OrbitControls 旋转缩放
- [ ] 模型材质贴图增强
- [ ] 模型测量工具

### 邮件

- [x] `eml` 邮件头和正文基础预览
- [x] `mbox` 基础文本预览
- [ ] `msg`
- [ ] 邮件 HTML 正文解析
- [ ] 邮件附件列表
- [ ] 邮件内嵌图片

### 绘图 / 白板

- [x] `excalidraw` 基础 SVG 预览
- [x] `drawio` 内容提取预览
- [x] `dio` 内容提取预览
- [ ] `tldraw`
- [ ] Draw.io 图形还原
- [ ] Excalidraw 完整样式还原

### 压缩包

- [x] `zip` 目录预览
- [ ] `rar`
- [ ] `7z`
- [ ] `tar`
- [ ] `gz`
- [ ] `tgz`
- [ ] `bz2`
- [ ] `xz`
- [ ] 压缩包内文件联动预览
- [ ] 加密压缩包提示

### GIS / 地图数据

- [ ] `geojson`
- [ ] `topojson`
- [ ] `kml`
- [ ] `kmz`
- [ ] `gpx`
- [ ] `shp`

## 建议支持范围

### 第一阶段：纯前端稳定支持

```txt
jpg jpeg png gif webp avif svg bmp ico
mp4 webm ogg ogv mov m4v
mp3 wav ogg aac m4a flac opus
pdf
txt log json xml yaml yml toml ini csv tsv md markdown
js ts jsx tsx vue html css scss less java py go rs php c cpp h hpp cs sql sh diff patch
```

### 第二阶段：已进入基础解析预览

```txt
docx xlsx xlsm xlsb ods pptx
ofd epub zip eml drawio excalidraw
gltf glb obj stl geojson kml gpx
```

### 第三阶段：已识别，建议服务端转换或专用引擎增强

```txt
doc xls ppt
dwg
wps et dps
numbers key
msg
heic heif
avi mkv flv wmv 3gp
rar 7z
```

## 迭代路线

### 0.1.0：MVP

- Core 插件系统
- 容器内预览
- 自定义宽高
- ResizeObserver 自适应
- 图片、视频、音频、文本、PDF
- Office/OFD/CAD/压缩包/邮件/绘图/3D 基础插件
- React/Vue/Vanilla 示例

### 0.2.0：体验增强

- 图片缩放、旋转、拖拽、重置
- PDF 工具栏
- 统一 loading、error、unsupported 状态
- 下载、全屏、打印
- 深色/浅色主题

### 0.3.0：业务高频格式增强

- Markdown 渲染
- 代码高亮
- DOCX 样式保真增强
- XLSX/CSV 表格交互增强
- PPTX 图片和布局增强

### 0.4.0：国内业务格式增强

- OFD 版式渲染
- DXF 更多图元
- EML 附件和 HTML 正文
- ZIP 内文件联动预览

### 0.5.0：高级格式

- 3D：`gltf`, `glb`, `obj`, `stl`
- 绘图：`drawio`, `excalidraw`
- GIS：`geojson`, `kml`, `gpx`

### 1.0.0：稳定版

- API 冻结
- 完整文档站
- 完整 Demo 站
- 核心路径单元测试
- Playwright 截图测试
- 插件开发指南
- 浏览器兼容说明

## 本地开发

```bash
pnpm install
pnpm build
pnpm dev:vanilla
```

React 示例：

```bash
pnpm dev:react
```

Vue 示例：

```bash
pnpm dev:vue
```

## 目录结构

```txt
packages/
  core/
    src/
      plugins/
      detect.ts
      dom.ts
      types.ts
      viewer.ts
  react/
  vue/
examples/
  vanilla/
  react/
  vue/
```

## 重要约束

- 不要把 React/Vue 逻辑写进 core。
- 不要在插件里直接操作用户页面中不属于 viewer 的 DOM。
- 不要默认打开新窗口。
- 不要把重型解析库放进主包。
- 对 Office、CAD、WPS、邮件等复杂格式要明确“基础预览”和“高保真预览”的边界。

## License

MIT
