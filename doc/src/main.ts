import {
  archivePlugin,
  assetPlugin,
  audioPlugin,
  cadPlugin,
  createViewer,
  drawingPlugin,
  emailPlugin,
  epubPlugin,
  gisPlugin,
  imagePlugin,
  model3dPlugin,
  officePlugin,
  ofdPlugin,
  pdfPlugin,
  textPlugin,
  videoPlugin,
  type FileViewer,
  type PreviewFit,
  type PreviewTheme,
  xpsPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-markup";
import "./style.css";

Prism.manual = true;

type Language = "zh" | "en";
type SiteTheme = "dark" | "light";
type CodeTab = "vanilla" | "react" | "vue";

interface DemoFile {
  label: Record<Language, string>;
  file: File;
}

type ZipEntry = {
  path: string;
  content: string | Uint8Array;
};

interface ApiRow {
  name: string;
  type: string;
  description: Record<Language, string>;
}

const translations: Record<Language, Record<string, string>> = {
  zh: {
    "nav.docs": "文档",
    "nav.frameworks": "框架",
    "nav.formats": "格式",
    "nav.api": "API",
    "nav.playground": "在线使用",
    "hero.badge": "开源文件预览 SDK",
    "hero.title": "面向现代 Web 的文件预览基础设施",
    "hero.lede":
      "一个兼容原生 JavaScript、React 和 Vue 的嵌入式文件预览器。把 PDF、Office、图片、音视频、压缩包、邮件、图纸、3D、GIS 和工程文件放进同一个稳定容器。",
    "hero.primary": "开始集成",
    "hero.secondary": "在线体验",
    "hero.tertiary": "查看格式",
    "hero.works": "原生 JS、Vue、React 全兼容",
    "ways.eyebrow": "两种集成方式",
    "ways.title": "直接嵌入默认预览器，或基于插件构建自己的文件工作台。",
    "ways.dropin.label": "Drop-in",
    "ways.dropin.title": "OpenFileViewer Component",
    "ways.dropin.desc": "用内置 UI 快速上线，获得工具栏、主题、多文件队列、容器自适应和失败降级。",
    "ways.headless.label": "Composable",
    "ways.headless.title": "Plugin-first Core",
    "ways.headless.desc": "通过插件协议接入自定义渲染器、WASM 或服务端转换结果，React/Vue/原生 JS 共用同一核心。",
    "feature.one.title": "Batteries included",
    "feature.one.desc": "PDF、Office、OFD、EPUB、XPS、图片、音视频、压缩包、邮件、CAD、GIS、3D 和文本插件开箱可用。",
    "feature.two.title": "Framework agnostic",
    "feature.two.desc": "原生 JavaScript、React 和 Vue 使用同一套 core 能力，方便团队跨产品复用。",
    "feature.three.title": "Container-first",
    "feature.three.desc": "所有预览都在你的 DOM 容器内完成，支持尺寸变化、黑色模式、下载和错误边界。",
    "integration.eyebrow": "框架兼容",
    "integration.title": "Vanilla JS、React、Vue 都能快速接入。",
    "integration.desc": "选择 Vanilla JS、React 或 Vue。底层插件一致，UI 可以先用默认组件，再逐步定制。",
    "playground.eyebrow": "Try it live",
    "playground.title": "Drop files and preview them instantly.",
    "playground.desc": "本地文件只在浏览器内读取，不会上传。你也可以用内置示例体验 Markdown、JSON、Word、Excel、PowerPoint、SVG 和 DXF。",
    "playground.dropTitle": "Choose or drop files",
    "playground.dropDesc": "Multi-file preview queue supported",
    "playground.chooseFile": "选择文件",
    "playground.noFile": "未选择文件",
    "playground.sample": "Built-in sample",
    "playground.width": "Width",
    "playground.height": "Height",
    "playground.fit": "Fit",
    "playground.viewerTheme": "Theme",
    "playground.apply": "Apply settings",
    "playground.current": "Current file",
    "formats.eyebrow": "Format matrix",
    "formats.title": "Built for real product attachments.",
    "api.eyebrow": "API Reference",
    "api.title": "A small API surface with room to extend.",
    "api.desc": "核心 API 保持克制：容器、文件、插件、尺寸、主题和事件回调。复杂格式能力由插件扩展。",
    "toolbar.title": "工具栏自定义",
    "toolbar.desc": "支持自定义文案、顺序、图标、审批/收藏/分享等业务按钮，也可以完全替换工具栏。",
    "cta.title": "Ship file previews without building every renderer from scratch.",
    "cta.desc": "从一个稳定容器开始，让文件预览能力持续进化。",
    "cta.action": "Try the playground",
    "footer.text": "面向现代 Web 产品的文件预览 SDK。"
  },
  en: {
    "nav.docs": "Documentation",
    "nav.frameworks": "Frameworks",
    "nav.formats": "Formats",
    "nav.api": "API",
    "nav.playground": "Live Demo",
    "hero.badge": "Open source file preview SDK",
    "hero.title": "Preview any file without the pain",
    "hero.lede":
      "A framework-agnostic embedded file viewer for vanilla JavaScript, React and Vue. Put PDF, Office, images, media, archives, email, drawings, 3D, GIS and engineering files inside one stable container.",
    "hero.primary": "Get Started",
    "hero.secondary": "Live Demo",
    "hero.tertiary": "Formats",
    "hero.works": "Works seamlessly with",
    "ways.eyebrow": "Two ways to integrate",
    "ways.title": "Use the ready-made viewer, or build your own.",
    "ways.dropin.label": "Drop-in",
    "ways.dropin.title": "OpenFileViewer Component",
    "ways.dropin.desc": "Ship quickly with toolbar, themes, multi-file queues, responsive containers and tested fallbacks.",
    "ways.headless.label": "Composable",
    "ways.headless.title": "Plugin-first Core",
    "ways.headless.desc": "Attach custom renderers, WASM pipelines or server-converted output while React, Vue and vanilla JS share one core.",
    "feature.one.title": "Batteries included",
    "feature.one.desc": "PDF, Office, OFD, EPUB, XPS, image, media, archive, email, CAD, GIS, 3D and text plugins are ready to use.",
    "feature.two.title": "Framework agnostic",
    "feature.two.desc": "Vanilla JavaScript, React and Vue share the same core so teams can reuse one preview strategy across products.",
    "feature.three.title": "Container-first",
    "feature.three.desc": "Every preview stays inside your DOM container with resize handling, dark mode, downloads and error boundaries.",
    "integration.eyebrow": "Drop-in Integration",
    "integration.title": "Add a viewer in minutes.",
    "integration.desc": "Pick Vanilla JS, React or Vue. The plugin capability stays consistent, while the UI can start default and evolve later.",
    "playground.eyebrow": "Try it live",
    "playground.title": "Drop files and preview them instantly.",
    "playground.desc": "Local files stay in your browser and are not uploaded. Built-in samples cover Markdown, JSON, Word, Excel, PowerPoint, SVG and DXF.",
    "playground.dropTitle": "Choose or drop files",
    "playground.dropDesc": "Multi-file preview queue supported",
    "playground.chooseFile": "Choose files",
    "playground.noFile": "No file selected",
    "playground.sample": "Built-in sample",
    "playground.width": "Width",
    "playground.height": "Height",
    "playground.fit": "Fit",
    "playground.viewerTheme": "Theme",
    "playground.apply": "Apply settings",
    "playground.current": "Current file",
    "formats.eyebrow": "Format matrix",
    "formats.title": "Built for real product attachments.",
    "api.eyebrow": "API Reference",
    "api.title": "A small API surface with room to extend.",
    "api.desc": "The API stays focused: container, file, plugins, size, theme and lifecycle callbacks. Complex formats are extended through plugins.",
    "toolbar.title": "Toolbar Customization",
    "toolbar.desc": "Change labels, order, icons, approval/favorite/share actions or replace the toolbar completely.",
    "cta.title": "Ship file previews without building every renderer from scratch.",
    "cta.desc": "Start from a stable container and keep evolving preview capability.",
    "cta.action": "Try the playground",
    "footer.text": "Framework-agnostic file preview SDK for modern web products."
  }
};

const apiOptions: ApiRow[] = [
  { name: "container", type: "HTMLElement | string", description: { zh: "必填。预览挂载容器。", en: "Required. The container where the preview is mounted." } },
  { name: "file", type: "PreviewSource", description: { zh: "单文件预览源，支持 File、Blob、URL、ArrayBuffer。", en: "Single preview source: File, Blob, URL or ArrayBuffer." } },
  { name: "files", type: "(PreviewSource | PreviewItem)[]", description: { zh: "多文件预览队列，可配合工具栏切换。", en: "Multi-file queue, usable with toolbar navigation." } },
  { name: "plugins", type: "PreviewPlugin[]", description: { zh: "内置插件或自定义插件列表。", en: "Built-in or custom plugin list." } },
  { name: "fit", type: "PreviewFit", description: { zh: "内容适配策略：contain、cover、width、height、actual、scale-down。", en: "Content fit mode: contain, cover, width, height, actual or scale-down." } },
  { name: "toolbar", type: "boolean | PreviewToolbarOptions", description: { zh: "工具栏配置。支持开关、文案、顺序、图标、业务按钮和完全自定义渲染。", en: "Toolbar configuration with toggles, labels, order, icons, custom actions and full rendering." } },
  { name: "renderToolbar", type: "React prop", description: { zh: "React 适配器的自定义工具栏 render prop。", en: "Custom toolbar render prop for the React adapter." } },
  { name: "#toolbar", type: "Vue slot", description: { zh: "Vue 适配器的自定义工具栏插槽。", en: "Custom toolbar slot for the Vue adapter." } },
  { name: "theme", type: "light | dark | auto", description: { zh: "预览器主题。", en: "Viewer theme." } },
  { name: "onLoad / onError", type: "callback", description: { zh: "加载完成和错误回调。", en: "Lifecycle callbacks for load and error states." } }
];

const formats = [
  { title: "PDF / Office", icon: "icon-file", level: { zh: "高频业务文档", en: "Business documents" }, items: "pdf docx docm doc dotx dotm rtf odt xlsx xls xlsm ods pptx pptm ppt odp ofd epub xps" },
  { title: "Image / Media", icon: "icon-image", level: { zh: "浏览器原生与增强", en: "Native and enhanced" }, items: "jpg jpeg png gif webp avif jxl svg bmp ico heic heif mp4 webm m3u8 mp3 wav flac midi" },
  { title: "Text / Code", icon: "icon-code", level: { zh: "高亮与编辑器模式", en: "Highlight and editor mode" }, items: "txt md json jsonc json5 ipynb yaml toml ini proto hcl tex gv http js ts vue react css html py go rs rb swift kt" },
  { title: "Engineering", icon: "icon-cube", level: { zh: "工程资料与结构预览", en: "Engineering and structure" }, items: "dxf dwg step ifc gltf glb obj stl fbx dae 3mf usdz geojson kml kmz gpx shp drawio excalidraw" },
  { title: "Archive / Email", icon: "icon-archive", level: { zh: "目录、正文与附件", en: "Structure, body and attachments" }, items: "zip rar 7z tar gz tgz bz2 xz eml msg mbox" },
  { title: "Assets / Data", icon: "icon-database", level: { zh: "结构解析与安全摘要", en: "Structure parsing and safe summaries" }, items: "ttf otf woff woff2 psd ai eps sqlite wasm parquet avro webarchive" }
];

const frameworkCopy: Record<CodeTab, Record<Language, string>> = {
  vanilla: {
    zh: "适合任意 Web 项目、后台系统、低代码平台或不使用框架的页面。",
    en: "Ideal for any web product, admin console, low-code surface or framework-free page."
  },
  react: {
    zh: "适合附件卡片、详情页、审批弹窗等组件化场景。",
    en: "Great for attachment cards, detail pages and approval modals."
  },
  vue: {
    zh: "适合 Vue 业务系统和组合式项目，通过 props 传递文件、尺寸、插件和主题。",
    en: "Designed for Vue business apps and composition-friendly projects."
  }
};

const codeSamples: Record<CodeTab, string> = {
  vanilla: `import { createViewer, imagePlugin, pdfPlugin, officePlugin, textPlugin } from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";

createViewer({
  container: "#viewer",
  file,
  fileName: file.name,
  height: "70vh",
  theme: "auto",
  toolbar: true,
  plugins: [imagePlugin(), pdfPlugin({ workerSrc }), officePlugin(), textPlugin()]
});`,
  react: `import { FileViewer } from "@open-file-viewer/react";
import { imagePlugin, pdfPlugin, officePlugin, textPlugin } from "@open-file-viewer/core";

const plugins = [imagePlugin(), pdfPlugin({ workerSrc }), officePlugin(), textPlugin()];

export function AttachmentPreview({ file }) {
  return <FileViewer file={file} fileName={file.name} height="640px" toolbar plugins={plugins} />;
}`,
  vue: `<script setup lang="ts">
import { OpenFileViewer } from "@open-file-viewer/vue";
import { imagePlugin, pdfPlugin, officePlugin, textPlugin } from "@open-file-viewer/core";

defineProps<{ file: File }>();
const plugins = [imagePlugin(), pdfPlugin({ workerSrc }), officePlugin(), textPlugin()];
</script>

<template>
  <OpenFileViewer :file="file" :file-name="file.name" height="640px" toolbar :plugins="plugins" />
</template>`
};

const codeLanguages: Record<CodeTab, string> = {
  vanilla: "typescript",
  react: "tsx",
  vue: "markup"
};

const pluginCode = `import type { PreviewPlugin } from "@open-file-viewer/core";

export function customPlugin(): PreviewPlugin {
  return {
    name: "custom",
    match(file) {
      return file.extension === "custom";
    },
    render(ctx) {
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
}`;

const toolbarCode = `createViewer({
  container: "#viewer",
  file,
  toolbar: {
    labels: {
      download: "下载",
      fullscreen: "全屏",
      search: "搜索"
    },
    icons: {
      download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>'
    },
    order: ["search", "download", "favorite", "approve", "share", "fullscreen"],
    actions: [
      { id: "favorite", label: "收藏", onClick: (ctx) => favoriteFile(ctx.file) },
      { id: "approve", label: "审批", onClick: (ctx) => openApprovalDialog(ctx.file) },
      { id: "share", label: "分享", onClick: (ctx) => shareFile(ctx.file) }
    ]
  },
  plugins
});

// React: <FileViewer renderToolbar={(ctx) => <button onClick={ctx.download}>下载</button>} />
// Vue: <template #toolbar="ctx"><button @click="ctx.download()">下载</button></template>`;

const demoFiles: DemoFile[] = [
  {
    label: { zh: "欢迎 Markdown", en: "Welcome Markdown" },
    file: new File(
      [
        `# Open File Viewer

Embed file previews inside any product surface.

- Vanilla JavaScript, React and Vue
- Multi-format plugin architecture
- Responsive container-first preview

\`\`\`ts
createViewer({ container: "#viewer", file, plugins });
\`\`\`
`
      ],
      "welcome.md",
      { type: "text/markdown" }
    )
  },
  {
    label: { zh: "API JSON", en: "API JSON" },
    file: new File([JSON.stringify({ package: "@open-file-viewer/core", api: "createViewer", frameworks: ["vanilla", "react", "vue"] }, null, 2)], "api.json", {
      type: "application/json"
    })
  },
  {
    label: { zh: "CSV 表格", en: "CSV Table" },
    file: new File(
      [
        `Name,Format,Status
Contract,pdf,Stable
Report,docx,Enhanced
Map,geojson,Preview
Drawing,dxf,Preview
Archive,zip,Preview
`
      ],
      "formats.csv",
      { type: "text/csv" }
    )
  },
  {
    label: { zh: "Word 文档 DOCX", en: "Word DOCX" },
    file: createDocxSample()
  },
  {
    label: { zh: "Excel 表格 XLSX", en: "Excel XLSX" },
    file: createXlsxSample()
  },
  {
    label: { zh: "PowerPoint 演示 PPTX", en: "PowerPoint PPTX" },
    file: createPptxSample()
  },
  {
    label: { zh: "HTML 页面", en: "HTML Page" },
    file: new File(
      [
        `<!doctype html>
<html>
  <head><title>Open File Viewer</title></head>
  <body>
    <h1>Embedded preview</h1>
    <p>HTML, Markdown, code and data files render inside the same viewer container.</p>
  </body>
</html>
`
      ],
      "preview.html",
      { type: "text/html" }
    )
  },
  {
    label: { zh: "矢量 SVG", en: "Vector SVG" },
    file: new File(
      [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520">
  <rect width="900" height="520" rx="34" fill="#0b1220"/>
  <path d="M170 360 C260 140 430 430 540 180 S730 240 760 120" fill="none" stroke="#b8ff4d" stroke-width="28" stroke-linecap="round"/>
  <circle cx="230" cy="180" r="54" fill="#70e4ff" opacity=".9"/>
  <rect x="520" y="300" width="190" height="90" rx="22" fill="#d6ff87" opacity=".88"/>
  <text x="80" y="90" fill="#fff" font-size="44" font-family="Arial">Open File Viewer</text>
</svg>`
      ],
      "brand-preview.svg",
      { type: "image/svg+xml" }
    )
  },
  {
    label: { zh: "GeoJSON 地图", en: "GeoJSON Map" },
    file: new File(
      [
        JSON.stringify(
          {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { name: "Open File Viewer HQ" },
                geometry: { type: "Point", coordinates: [116.397, 39.908] }
              },
              {
                type: "Feature",
                properties: { name: "Preview Route" },
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [116.36, 39.9],
                    [116.397, 39.908],
                    [116.43, 39.92]
                  ]
                }
              }
            ]
          },
          null,
          2
        )
      ],
      "map.geojson",
      { type: "application/geo+json" }
    )
  },
  {
    label: { zh: "Excalidraw 白板", en: "Excalidraw Board" },
    file: new File(
      [
        JSON.stringify(
          {
            type: "excalidraw",
            version: 2,
            source: "https://open-file-viewer.dev",
            elements: [
              {
                id: "title",
                type: "text",
                x: 120,
                y: 90,
                width: 360,
                height: 48,
                angle: 0,
                strokeColor: "#111827",
                backgroundColor: "transparent",
                fillStyle: "solid",
                strokeWidth: 1,
                strokeStyle: "solid",
                roughness: 1,
                opacity: 100,
                text: "Open File Viewer",
                fontSize: 32,
                fontFamily: 1,
                textAlign: "left",
                verticalAlign: "top",
                baseline: 36,
                version: 1,
                versionNonce: 1,
                isDeleted: false,
                seed: 1,
                groupIds: [],
                frameId: null,
                roundness: null,
                boundElements: null,
                updated: 1,
                link: null,
                locked: false
              },
              {
                id: "box",
                type: "rectangle",
                x: 110,
                y: 165,
                width: 390,
                height: 150,
                angle: 0,
                strokeColor: "#7c5cff",
                backgroundColor: "#f1eaff",
                fillStyle: "solid",
                strokeWidth: 2,
                strokeStyle: "solid",
                roughness: 1,
                opacity: 100,
                version: 1,
                versionNonce: 2,
                isDeleted: false,
                seed: 2,
                groupIds: [],
                frameId: null,
                roundness: { type: 3 },
                boundElements: null,
                updated: 1,
                link: null,
                locked: false
              }
            ],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {}
          },
          null,
          2
        )
      ],
      "board.excalidraw",
      { type: "application/vnd.excalidraw+json" }
    )
  },
  {
    label: { zh: "DXF 图纸", en: "DXF Drawing" },
    file: new File(
      [
        `0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
11
120
21
80
0
CIRCLE
8
0
10
180
20
120
40
48
0
ENDSEC
0
EOF`
      ],
      "drawing.dxf",
      { type: "application/dxf" }
    )
  }
];

function createDocxSample(): File {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>Open File Viewer Office Preview Report</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="360"/></w:pPr>
      <w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="22"/></w:rPr><w:t>Generated built-in DOCX sample for layout, wrapping, and table preview checks.</w:t></w:r>
    </w:p>
    <w:p><w:pPr><w:spacing w:before="120" w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Executive summary</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:t>Open File Viewer renders Office documents inside the same responsive preview shell used by images, PDFs, text, spreadsheets, and presentations. This document includes headings, paragraphs, long business copy, checklist rows, and a simple table so the playground feels closer to a real attachment.</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:after="320"/></w:pPr><w:r><w:t>Key checks: toolbar spacing, document width constraints, long-line wrapping, local scroll regions, and readable typography across desktop and mobile containers.</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:before="120" w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>Preview checklist</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:t>1. Confirm the page stays inside the viewer container without horizontal overflow.</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:t>2. Confirm long product names and operational notes wrap cleanly on narrow screens.</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:t>3. Confirm tables keep their content readable and do not push the whole application wider.</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblCellMar>
          <w:top w:w="120" w:type="dxa"/>
          <w:left w:w="120" w:type="dxa"/>
          <w:bottom w:w="120" w:type="dxa"/>
          <w:right w:w="120" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Area</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Status</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4600" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Notes</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Word preview</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Ready</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Paragraphs, headings, and table cells render as readable document content.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Responsive shell</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Verified</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>The sample includes longer copy to exercise wrapping and local scrolling behavior.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Fallback path</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Covered</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>If an Office renderer cannot preserve full layout, users still see structured document text.</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:spacing w:before="320" w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>Implementation notes</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:t>The built-in sample is generated entirely in the browser. It does not upload files, and it keeps the demo self-contained for documentation, examples, and offline preview testing.</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  return createZipFile(
    "sample-word.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    [
      { path: "[Content_Types].xml", content: contentTypes },
      { path: "_rels/.rels", content: rels },
      { path: "word/document.xml", content: documentXml }
    ]
  );
}

function createXlsxSample(): File {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
</Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Overview" sheetId="1" r:id="rId1"/>
    <sheet name="Quarterly Revenue" sheetId="2" r:id="rId2"/>
    <sheet name="File QA Matrix" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`;
  const overviewSheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Metric</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Value</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Owner</t></is></c>
      <c r="D1" t="inlineStr"><is><t>Notes</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Supported demo formats</t></is></c>
      <c r="B2"><v>11</v></c>
      <c r="C2" t="inlineStr"><is><t>Documentation</t></is></c>
      <c r="D2" t="inlineStr"><is><t>Markdown, JSON, CSV, DOCX, XLSX, PPTX, HTML, SVG, GeoJSON, Excalidraw, DXF</t></is></c>
    </row>
    <row r="3">
      <c r="A3" t="inlineStr"><is><t>Office samples</t></is></c>
      <c r="B3"><v>3</v></c>
      <c r="C3" t="inlineStr"><is><t>Core preview</t></is></c>
      <c r="D3" t="inlineStr"><is><t>Word, Excel, and PowerPoint samples are generated as real files in-browser.</t></is></c>
    </row>
    <row r="4">
      <c r="A4" t="inlineStr"><is><t>Responsive checks</t></is></c>
      <c r="B4"><v>8</v></c>
      <c r="C4" t="inlineStr"><is><t>QA</t></is></c>
      <c r="D4" t="inlineStr"><is><t>Toolbar wrapping, sheet tabs, long cells, slide bounds, and document width constraints.</t></is></c>
    </row>
    <row r="5">
      <c r="A5" t="inlineStr"><is><t>Deployment target</t></is></c>
      <c r="B5" t="inlineStr"><is><t>Void static SPA</t></is></c>
      <c r="C5" t="inlineStr"><is><t>Website</t></is></c>
      <c r="D5" t="inlineStr"><is><t>https://open-file-viewer-workspace.void.app</t></is></c>
    </row>
    <row r="6">
      <c r="A6" t="inlineStr"><is><t>Total checks</t></is></c>
      <c r="B6"><f>SUM(B2:B4)</f><v>22</v></c>
      <c r="C6" t="inlineStr"><is><t>Formula</t></is></c>
      <c r="D6" t="inlineStr"><is><t>This row exercises simple formula metadata in the workbook preview.</t></is></c>
    </row>
  </sheetData>
</worksheet>`;
  const revenueSheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Quarter</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Product</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Region</t></is></c>
      <c r="D1" t="inlineStr"><is><t>Files Previewed</t></is></c>
      <c r="E1" t="inlineStr"><is><t>Success Rate</t></is></c>
      <c r="F1" t="inlineStr"><is><t>Revenue</t></is></c>
      <c r="G1" t="inlineStr"><is><t>Long Note</t></is></c>
    </row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Q1</t></is></c><c r="B2" t="inlineStr"><is><t>Document Workspace</t></is></c><c r="C2" t="inlineStr"><is><t>North America</t></is></c><c r="D2"><v>18240</v></c><c r="E2"><v>0.982</v></c><c r="F2"><v>128000</v></c><c r="G2" t="inlineStr"><is><t>Preview traffic grew after enabling Office attachments in the customer portal.</t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Q1</t></is></c><c r="B3" t="inlineStr"><is><t>Operations Desk</t></is></c><c r="C3" t="inlineStr"><is><t>Europe</t></is></c><c r="D3"><v>14320</v></c><c r="E3"><v>0.971</v></c><c r="F3"><v>96000</v></c><c r="G3" t="inlineStr"><is><t>Spreadsheet tabs and wide tables should remain inside the local scroll area.</t></is></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>Q2</t></is></c><c r="B4" t="inlineStr"><is><t>Partner Review</t></is></c><c r="C4" t="inlineStr"><is><t>Asia Pacific</t></is></c><c r="D4"><v>22105</v></c><c r="E4"><v>0.989</v></c><c r="F4"><v>174500</v></c><c r="G4" t="inlineStr"><is><t>PowerPoint sample is used by sales and enablement teams for demo decks.</t></is></c></row>
    <row r="5"><c r="A5" t="inlineStr"><is><t>Q2</t></is></c><c r="B5" t="inlineStr"><is><t>Claims Archive</t></is></c><c r="C5" t="inlineStr"><is><t>Global</t></is></c><c r="D5"><v>19880</v></c><c r="E5"><v>0.964</v></c><c r="F5"><v>141250</v></c><c r="G5" t="inlineStr"><is><t>Long file names and metadata-heavy cells test ellipsis and wrapping behavior.</t></is></c></row>
    <row r="6"><c r="A6" t="inlineStr"><is><t>Q3 Forecast</t></is></c><c r="B6" t="inlineStr"><is><t>Total</t></is></c><c r="C6" t="inlineStr"><is><t>All regions</t></is></c><c r="D6"><f>SUM(D2:D5)</f><v>74545</v></c><c r="E6"><v>0.9765</v></c><c r="F6"><f>SUM(F2:F5)</f><v>539750</v></c><c r="G6" t="inlineStr"><is><t>Formula cells are included so the preview can surface workbook metadata.</t></is></c></row>
  </sheetData>
</worksheet>`;
  const qaSheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>File Type</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Scenario</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Expected Preview</t></is></c>
      <c r="D1" t="inlineStr"><is><t>Status</t></is></c>
      <c r="E1" t="inlineStr"><is><t>Viewport</t></is></c>
      <c r="F1" t="inlineStr"><is><t>Owner</t></is></c>
    </row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>DOCX</t></is></c><c r="B2" t="inlineStr"><is><t>Report with title, paragraphs, table, and checklist content</t></is></c><c r="C2" t="inlineStr"><is><t>Readable document page inside preview shell</t></is></c><c r="D2" t="inlineStr"><is><t>Pass</t></is></c><c r="E2" t="inlineStr"><is><t>Desktop and mobile</t></is></c><c r="F2" t="inlineStr"><is><t>Docs</t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>XLSX</t></is></c><c r="B3" t="inlineStr"><is><t>Multiple tabs, formulas, long cells, and wide columns</t></is></c><c r="C3" t="inlineStr"><is><t>Sheet tabs and table scroll independently</t></is></c><c r="D3" t="inlineStr"><is><t>Pass</t></is></c><c r="E3" t="inlineStr"><is><t>Narrow host</t></is></c><c r="F3" t="inlineStr"><is><t>Core</t></is></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>PPTX</t></is></c><c r="B4" t="inlineStr"><is><t>Three slides with summary, workflow, and launch checklist text</t></is></c><c r="C4" t="inlineStr"><is><t>Slide canvas stays below toolbar without structure headers</t></is></c><c r="D4" t="inlineStr"><is><t>Pass</t></is></c><c r="E4" t="inlineStr"><is><t>Responsive viewer</t></is></c><c r="F4" t="inlineStr"><is><t>QA</t></is></c></row>
    <row r="5"><c r="A5" t="inlineStr"><is><t>Images</t></is></c><c r="B5" t="inlineStr"><is><t>Zoom controls and metadata strip</t></is></c><c r="C5" t="inlineStr"><is><t>Image remains centered and constrained</t></is></c><c r="D5" t="inlineStr"><is><t>Pass</t></is></c><c r="E5" t="inlineStr"><is><t>Large files</t></is></c><c r="F5" t="inlineStr"><is><t>Media</t></is></c></row>
    <row r="6"><c r="A6" t="inlineStr"><is><t>Fallback</t></is></c><c r="B6" t="inlineStr"><is><t>Unknown or partially supported formats</t></is></c><c r="C6" t="inlineStr"><is><t>Safe metadata summary with download action</t></is></c><c r="D6" t="inlineStr"><is><t>Pass</t></is></c><c r="E6" t="inlineStr"><is><t>Any container</t></is></c><c r="F6" t="inlineStr"><is><t>Platform</t></is></c></row>
  </sheetData>
</worksheet>`;
  return createZipFile("sample-excel.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [
    { path: "[Content_Types].xml", content: contentTypes },
    { path: "_rels/.rels", content: rootRels },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { path: "xl/workbook.xml", content: workbook },
    { path: "xl/worksheets/sheet1.xml", content: overviewSheet },
    { path: "xl/worksheets/sheet2.xml", content: revenueSheet },
    { path: "xl/worksheets/sheet3.xml", content: qaSheet }
  ]);
}

function createPptxSample(): File {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
  const presentationRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
</Relationships>`;
  const presentation = `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
    <p:sldId id="258" r:id="rId3"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
  const slide1 = createPptxSlide("Open File Viewer", [
    "Office Preview Readiness Deck",
    "Built-in PowerPoint sample for slide rendering, text wrapping, and responsive container checks.",
    "Includes three slides: overview, workflow, and launch checklist."
  ]);
  const slide2 = createPptxSlide("Preview workflow", [
    "1. User selects a local attachment or built-in sample from the playground.",
    "2. The viewer detects file type, picks the matching plugin, and mounts it inside the same shell.",
    "3. Toolbar actions, search, fullscreen, download, and responsive resize behavior remain consistent.",
    "4. Unsupported details fall back to safe structured summaries instead of breaking the page."
  ]);
  const slide3 = createPptxSlide("Launch checklist", [
    "DOCX: headings, paragraphs, tables, and long copy stay readable.",
    "XLSX: multiple sheets, formulas, wide rows, and long cells stay inside local scroll regions.",
    "PPTX: slides render below the toolbar without exposing internal structure headers.",
    "Result: the built-in sample menu now feels like a useful regression test, not a tiny placeholder."
  ]);
  return createZipFile(
    "sample-powerpoint.pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    [
      { path: "[Content_Types].xml", content: contentTypes },
      { path: "_rels/.rels", content: rootRels },
      { path: "ppt/_rels/presentation.xml.rels", content: presentationRels },
      { path: "ppt/presentation.xml", content: presentation },
      { path: "ppt/slides/slide1.xml", content: slide1 },
      { path: "ppt/slides/slide2.xml", content: slide2 },
      { path: "ppt/slides/slide3.xml", content: slide3 }
    ]
  );
}

function createPptxSlide(title: string, lines: string[]): string {
  const titleBox = createPptxTextBox({
    id: 2,
    name: "Title",
    x: 685800,
    y: 548640,
    cx: 7772400,
    cy: 914400,
    fontSize: 3600,
    bold: true,
    color: "0F172A",
    lines: [title]
  });
  const subtitleBox = createPptxTextBox({
    id: 3,
    name: "Body",
    x: 822960,
    y: 1645920,
    cx: 7498080,
    cy: 2743200,
    fontSize: 2100,
    bold: false,
    color: "334155",
    lines
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:bg>
      <p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      ${titleBox}
      ${subtitleBox}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function createPptxTextBox(options: {
  id: number;
  name: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  fontSize: number;
  bold: boolean;
  color: string;
  lines: string[];
}): string {
  const paragraphs = options.lines
    .map(
      (line) => `<a:p>
          <a:pPr marL="0" indent="0"/>
          <a:r>
            <a:rPr lang="en-US" sz="${options.fontSize}"${options.bold ? ' b="1"' : ""}>
              <a:solidFill><a:srgbClr val="${options.color}"/></a:solidFill>
            </a:rPr>
            <a:t>${escapeXml(line)}</a:t>
          </a:r>
          <a:endParaRPr lang="en-US" sz="${options.fontSize}"/>
        </a:p>`
    )
    .join("");
  return `<p:sp>
        <p:nvSpPr>
          <p:cNvPr id="${options.id}" name="${options.name}"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="${options.x}" y="${options.y}"/>
            <a:ext cx="${options.cx}" cy="${options.cy}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:noFill/>
          <a:ln><a:noFill/></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" rtlCol="0">
            <a:spAutoFit/>
          </a:bodyPr>
          <a:lstStyle/>
          ${paragraphs}
        </p:txBody>
      </p:sp>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createZipFile(name: string, type: string, entries: ZipEntry[]): File {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = typeof entry.content === "string" ? encoder.encode(entry.content) : entry.content;
    const crc = crc32(data);
    const local = concatBytes(
      uint32Le(0x04034b50),
      uint16Le(20),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint32Le(crc),
      uint32Le(data.length),
      uint32Le(data.length),
      uint16Le(nameBytes.length),
      uint16Le(0),
      nameBytes,
      data
    );
    const central = concatBytes(
      uint32Le(0x02014b50),
      uint16Le(20),
      uint16Le(20),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint32Le(crc),
      uint32Le(data.length),
      uint32Le(data.length),
      uint16Le(nameBytes.length),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint16Le(0),
      uint32Le(0),
      uint32Le(offset),
      nameBytes
    );
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDirectory = concatBytes(...centralParts);
  const end = concatBytes(
    uint32Le(0x06054b50),
    uint16Le(0),
    uint16Le(0),
    uint16Le(entries.length),
    uint16Le(entries.length),
    uint32Le(centralDirectory.length),
    uint32Le(offset),
    uint16Le(0)
  );
  return new File([...localParts, centralDirectory, end].map(toArrayBuffer), name, { type });
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function uint16Le(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >> 8) & 0xff]);
}

function uint32Le(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const container = requiredElement<HTMLElement>("#viewer");
const fileInput = requiredElement<HTMLInputElement>("#file");
const sampleInput = requiredElement<HTMLSelectElement>("#sample");
const widthInput = requiredElement<HTMLInputElement>("#width");
const heightInput = requiredElement<HTMLInputElement>("#height");
const fitInput = requiredElement<HTMLSelectElement>("#fit");
const themeInput = requiredElement<HTMLSelectElement>("#theme");
const applyButton = requiredElement<HTMLButtonElement>("#apply");
const currentFileLabel = requiredElement<HTMLElement>("#currentFile");
const filePickerName = requiredElement<HTMLElement>("#filePickerName");
const languageToggle = requiredElement<HTMLButtonElement>("#languageToggle");
const themeToggle = requiredElement<HTMLButtonElement>("#themeToggle");
const codeSample = requiredElement<HTMLElement>("#codeSample");
const pluginCodeElement = requiredElement<HTMLElement>("#pluginCode");
const toolbarCodeElement = requiredElement<HTMLElement>("#toolbarCode");
const formatGrid = requiredElement<HTMLElement>("#formatGrid");
const apiOptionsElement = requiredElement<HTMLElement>("#apiOptions");
const frameworkCopyElement = requiredElement<HTMLElement>("#frameworkCopy");
const desktopViewerHeight = "680px";
const tabletViewerHeight = "min(560px, 62vh)";
const phoneViewerHeight = "min(520px, 60vh)";

let viewer: FileViewer | null = null;
let currentFiles: Array<File | Blob> = [demoFiles[0].file];
let language: Language = readStorage("ofv-language") === "en" ? "en" : "zh";
let siteTheme: SiteTheme = readStorage("ofv-site-theme") === "dark" ? "dark" : "light";
let activeCodeTab: CodeTab = "vanilla";
let viewerHeightIsResponsive = true;

function createPlugins() {
  return [
    imagePlugin(),
    videoPlugin(),
    audioPlugin(),
    pdfPlugin({ workerSrc: pdfWorkerSrc }),
    epubPlugin(),
    xpsPlugin(),
    officePlugin(),
    ofdPlugin(),
    archivePlugin(),
    emailPlugin(),
    drawingPlugin(),
    cadPlugin(),
    model3dPlugin(),
    gisPlugin(),
    assetPlugin(),
    textPlugin()
  ];
}

function renderViewer() {
  const firstFile = currentFiles[0];
  viewer?.destroy();
  viewer = createViewer({
    container,
    file: firstFile,
    files: currentFiles,
    fileName: firstFile instanceof File ? firstFile.name : "preview.bin",
    width: widthInput.value,
    height: heightInput.value,
    fit: fitInput.value as PreviewFit,
    theme: themeInput.value as PreviewTheme,
    toolbar: true,
    plugins: createPlugins(),
    onLoad(file) {
      currentFileLabel.textContent = file.name;
    },
    onError(error) {
      console.error(error);
    }
  });
}

function getResponsiveViewerHeight() {
  if (window.matchMedia("(max-width: 430px)").matches) {
    return phoneViewerHeight;
  }

  if (window.matchMedia("(max-width: 720px)").matches) {
    return tabletViewerHeight;
  }

  return desktopViewerHeight;
}

function syncResponsiveViewerHeight(options: { rerender?: boolean } = {}) {
  if (!viewerHeightIsResponsive) {
    return;
  }

  const nextHeight = getResponsiveViewerHeight();
  if (heightInput.value === nextHeight) {
    return;
  }

  heightInput.value = nextHeight;
  if (options.rerender && viewer) {
    renderViewer();
  }
}

function applyLanguage(nextLanguage: Language) {
  language = nextLanguage;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key && translations[language][key]) {
      element.textContent = translations[language][key];
    }
  }
  languageToggle.textContent = language === "zh" ? "EN" : "中文";
  writeStorage("ofv-language", language);
  populateSamples();
  populateApiTable();
  populateFormats();
  updateFilePickerLabel();
  setCodeSample(activeCodeTab);
}

function applySiteTheme(nextTheme: SiteTheme) {
  siteTheme = nextTheme;
  document.documentElement.dataset.siteTheme = siteTheme;
  themeToggle.innerHTML = iconSvg(siteTheme === "dark" ? "icon-sun" : "icon-moon");
  themeToggle.setAttribute("aria-label", siteTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  writeStorage("ofv-site-theme", siteTheme);
}

function populateApiTable() {
  apiOptionsElement.replaceChildren(
    ...apiOptions.map((row, index) => {
      const item = document.createElement("div");
      item.className = "api-row";
      const icon = document.createElement("span");
      icon.className = "api-icon";
      icon.innerHTML = iconSvg(index === 0 ? "icon-resize" : index === 3 ? "icon-puzzle" : index === 5 ? "icon-eye" : "icon-api");
      const main = document.createElement("div");
      main.className = "api-main";
      const header = document.createElement("div");
      header.className = "api-row-header";
      const name = document.createElement("strong");
      name.textContent = row.name;
      const type = document.createElement("code");
      type.textContent = row.type;
      const desc = document.createElement("span");
      desc.textContent = row.description[language];
      header.append(name, type);
      main.append(header, desc);
      item.append(icon, main);
      return item;
    })
  );
}

function populateFormats() {
  formatGrid.replaceChildren(
    ...formats.map((format) => {
      const card = document.createElement("article");
      const icon = document.createElement("div");
      icon.className = "format-icon";
      icon.innerHTML = iconSvg(format.icon);
      const title = document.createElement("h3");
      title.textContent = format.title;
      const level = document.createElement("p");
      level.textContent = format.level[language];
      const tags = document.createElement("div");
      tags.className = "tag-list";
      for (const item of format.items.split(" ")) {
        const tag = document.createElement("span");
        tag.textContent = item;
        tags.append(tag);
      }
      card.append(icon, title, level, tags);
      return card;
    })
  );
}

function iconSvg(id: string): string {
  return `<svg aria-hidden="true" focusable="false"><use href="#${id}"></use></svg>`;
}

function populateSamples() {
  const selected = sampleInput.value || "0";
  sampleInput.replaceChildren(
    ...demoFiles.map((demo, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = demo.label[language];
      return option;
    })
  );
  sampleInput.value = selected;
}

function setCodeSample(key: CodeTab) {
  activeCodeTab = key;
  setHighlightedCode(codeSample, codeSamples[key], codeLanguages[key]);
  frameworkCopyElement.textContent = frameworkCopy[key][language];
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-code-tab]")) {
    button.classList.toggle("active", button.dataset.codeTab === key);
  }
}

function setHighlightedCode(element: HTMLElement, source: string, languageName: string) {
  const grammar = Prism.languages[languageName] || Prism.languages.markup || Prism.languages.plain;
  element.className = `language-${languageName}`;
  element.parentElement?.classList.add(`language-${languageName}`);
  const highlighted = Prism.highlight(source, grammar, languageName);
  element.innerHTML = highlighted
    .split("\n")
    .map((line: string) => `<span class="code-line">${line || "&nbsp;"}</span>`)
    .join("");
}

function highlightStaticCodeBlocks() {
  for (const code of document.querySelectorAll<HTMLElement>("pre code:not(#codeSample):not(#pluginCode):not(#toolbarCode)")) {
    const text = code.textContent || "";
    const languageName = text.trim().startsWith("npm ") ? "bash" : "typescript";
    setHighlightedCode(code, text, languageName);
  }
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required docs element: ${selector}`);
  }
  return element;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Local preferences are optional.
  }
}

function syncNavigationState(): void {
  document.documentElement.dataset.navState = window.scrollY > 36 ? "scrolled" : "top";
}

function updateFilePickerLabel(): void {
  const files = Array.from(fileInput.files || []);
  if (!files.length) {
    filePickerName.textContent = translations[language]["playground.noFile"];
    return;
  }

  filePickerName.textContent =
    files.length === 1
      ? files[0].name
      : language === "zh"
        ? `已选择 ${files.length} 个文件`
        : `${files.length} files selected`;
}

fileInput.addEventListener("change", () => {
  const files = Array.from(fileInput.files || []);
  if (!files.length) {
    updateFilePickerLabel();
    return;
  }
  currentFiles = files;
  updateFilePickerLabel();
  renderViewer();
});

sampleInput.addEventListener("change", () => {
  const demo = demoFiles[Number(sampleInput.value)] || demoFiles[0];
  currentFiles = [demo.file];
  renderViewer();
});

heightInput.addEventListener("input", () => {
  viewerHeightIsResponsive = false;
});

applyButton.addEventListener("click", () => {
  viewerHeightIsResponsive = false;
  renderViewer();
});
themeInput.addEventListener("change", renderViewer);

languageToggle.addEventListener("click", () => {
  applyLanguage(language === "zh" ? "en" : "zh");
});

themeToggle.addEventListener("click", () => {
  applySiteTheme(siteTheme === "dark" ? "light" : "dark");
});

window.addEventListener("scroll", syncNavigationState, { passive: true });
window.addEventListener(
  "resize",
  () => {
    syncResponsiveViewerHeight({ rerender: true });
  },
  { passive: true }
);

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-code-tab]")) {
  button.addEventListener("click", () => {
    setCodeSample((button.dataset.codeTab || "vanilla") as CodeTab);
  });
}

applySiteTheme(siteTheme);
applyLanguage(language);
setHighlightedCode(pluginCodeElement, pluginCode, "typescript");
setHighlightedCode(toolbarCodeElement, toolbarCode, "typescript");
highlightStaticCodeBlocks();
syncNavigationState();
updateFilePickerLabel();
syncResponsiveViewerHeight();
renderViewer();
requestAnimationFrame(() => {
  document.documentElement.dataset.siteReady = "true";
  document.documentElement.dataset.siteBoot = "ready";
});
