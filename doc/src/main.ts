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
    "playground.desc": "本地文件只在浏览器内读取，不会上传。你也可以用内置示例体验 Markdown、JSON、SVG 和 DXF。",
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
    "playground.desc": "Local files stay in your browser and are not uploaded. Built-in samples cover Markdown, JSON, SVG and DXF.",
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
  { name: "toolbar", type: "boolean | PreviewToolbarOptions", description: { zh: "下载、全屏、打印、搜索、缩放、旋转等工具栏能力。", en: "Toolbar controls for download, fullscreen, print, search, zoom and rotate." } },
  { name: "theme", type: "light | dark | auto", description: { zh: "预览器主题。", en: "Viewer theme." } },
  { name: "onLoad / onError", type: "callback", description: { zh: "加载完成和错误回调。", en: "Lifecycle callbacks for load and error states." } }
];

const formats = [
  { title: "PDF / Office", icon: "icon-file", level: { zh: "高频业务文档", en: "Business documents" }, items: "pdf docx docm doc dotx dotm rtf odt xlsx xls xlsm ods pptx pptm ppt odp ofd epub xps" },
  { title: "Image / Media", icon: "icon-image", level: { zh: "浏览器原生与增强", en: "Native and enhanced" }, items: "jpg jpeg png gif webp avif jxl svg bmp ico heic heif mp4 webm m3u8 mp3 wav flac midi" },
  { title: "Text / Code", icon: "icon-code", level: { zh: "高亮与编辑器模式", en: "Highlight and editor mode" }, items: "txt md json jsonc json5 ipynb yaml toml ini proto hcl tex gv http js ts vue react css html py go rs rb swift kt" },
  { title: "Engineering", icon: "icon-cube", level: { zh: "工程资料与结构预览", en: "Engineering and structure" }, items: "dxf dwg step ifc gltf glb obj stl fbx dae 3mf usdz geojson kml kmz gpx shp drawio excalidraw" },
  { title: "Archive / Email", icon: "icon-archive", level: { zh: "目录、正文与附件", en: "Structure, body and attachments" }, items: "zip rar 7z tar gz tgz bz2 xz eml msg mbox" },
  { title: "Assets / Data", icon: "icon-database", level: { zh: "识别与下载 fallback", en: "Recognition and fallback" }, items: "ttf otf woff woff2 psd ai eps sqlite wasm parquet avro webarchive" }
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
  for (const code of document.querySelectorAll<HTMLElement>("pre code:not(#codeSample):not(#pluginCode)")) {
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

setHighlightedCode(pluginCodeElement, pluginCode, "typescript");
highlightStaticCodeBlocks();
applySiteTheme(siteTheme);
applyLanguage(language);
setCodeSample("vanilla");
syncNavigationState();
updateFilePickerLabel();
syncResponsiveViewerHeight();
renderViewer();

window.addEventListener("DOMContentLoaded", () => {
  setHighlightedCode(pluginCodeElement, pluginCode, "typescript");
  highlightStaticCodeBlocks();
  setCodeSample(activeCodeTab);
  syncNavigationState();
});
