# Open File Viewer

<p align="right">
  <a href="./README.md">简体中文</a>
  |
  <a href="./README.en.md">English</a>
  |
  <a href="./README.ja.md">日本語</a>
  |
  <strong>한국어</strong>
  |
  <a href="./README.es.md">Español</a>
  |
  <a href="./README.pt-BR.md">Português</a>
</p>

Open File Viewer는 현대적인 Web 제품을 위한 파일 미리보기 SDK입니다. PDF, Office 문서, 이미지, 오디오/비디오, 압축 파일, 이메일, 도면, 3D 파일, GIS 데이터, 소스 코드를 하나의 제어 가능한 컨테이너 안에서 다룰 수 있으며 Vanilla JavaScript, React, Vue, Svelte를 지원합니다.

<p>
  <a href="https://open-file-viewer-workspace.void.app">웹사이트</a>
  |
  <a href="https://open-file-viewer-workspace.void.app/about.html">About</a>
  |
  <a href="https://github.com/xushanpei/open-file-viewer">GitHub</a>
  |
  <a href="https://www.npmjs.com/package/@open-file-viewer/core">NPM Core</a>
  |
  <a href="https://www.npmjs.com/package/@open-file-viewer/react">React</a>
  |
  <a href="https://www.npmjs.com/package/@open-file-viewer/vue">Vue</a>
  |
  <a href="https://www.npmjs.com/package/@open-file-viewer/svelte">Svelte</a>
</p>

[![GitHub](https://img.shields.io/badge/GitHub-xushanpei%2Fopen--file--viewer-111827?logo=github)](https://github.com/xushanpei/open-file-viewer)
[![Core](https://img.shields.io/npm/v/@open-file-viewer/core?label=%40open-file-viewer%2Fcore&color=7c5cff)](https://www.npmjs.com/package/@open-file-viewer/core)
[![React](https://img.shields.io/npm/v/@open-file-viewer/react?label=react&color=149eca)](https://www.npmjs.com/package/@open-file-viewer/react)
[![Vue](https://img.shields.io/npm/v/@open-file-viewer/vue?label=vue&color=41b883)](https://www.npmjs.com/package/@open-file-viewer/vue)
[![Svelte](https://img.shields.io/npm/v/@open-file-viewer/svelte?label=svelte&color=ff3e00)](https://www.npmjs.com/package/@open-file-viewer/svelte)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## 선택 이유

대부분의 업무 시스템은 언젠가 첨부 파일 미리보기를 필요로 합니다. 계약서, 스프레드시트, 도면, 압축 파일, 이메일, 이미지, 비디오, 소스 파일이 모두 그 대상입니다. Open File Viewer는 PDF만 여는 데모가 아니라 실제 제품 요구에 맞춰 장기적으로 발전할 수 있는 파일 미리보기 기반입니다.

- **컨테이너 우선**: 모든 콘텐츠는 사용자가 전달한 DOM 컨테이너 안에 렌더링됩니다. 새 창을 열지 않고 업무 페이지의 흐름을 방해하지 않습니다.
- **여러 프레임워크 지원**: Vanilla JavaScript, React, Vue, Svelte가 동일한 core 기능을 공유합니다.
- **플러그인 기반 형식 처리**: 각 파일 형식은 독립 플러그인이 담당하므로 교체, 축소, 확장이 쉽습니다.
- **반응형 미리보기**: `px`, `%`, `vh`, `vw`, `rem`, `calc()` 같은 CSS 크기를 지원하고 컨테이너 변화에 자동으로 반응합니다.
- **애플리케이션용 기본 상태**: loading, error, unsupported, download fallback, toolbar, theme, multi-file queue를 제공합니다.
- **복잡한 형식의 점진적 강화**: 브라우저가 직접 미리볼 수 있는 형식은 우선 로컬에서 렌더링하고, 복잡한 형식은 WASM, 전용 파서, 서버 사이드 변환으로 단계적으로 강화할 수 있습니다.

## 설치

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

`pdfPlugin()`을 사용할 때 PDF 미리보기에는 `pdfjs-dist`가 필요합니다.

```bash
pnpm add pdfjs-dist
```

npm 또는 yarn도 사용할 수 있습니다.

```bash
npm install @open-file-viewer/core
yarn add @open-file-viewer/core
```

공유 스타일은 애플리케이션에서 한 번 import 하세요.

```ts
import "@open-file-viewer/core/style.css";
```

## 빠른 시작

### Vanilla JavaScript

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

## 사용 사례

| 시나리오 | Open File Viewer가 제공하는 것 |
| --- | --- |
| OA / ERP / CRM 첨부 파일 센터 | 계약서, 스프레드시트, 이미지, 이메일, 압축 파일을 하나의 컨테이너에서 미리보기 |
| 클라우드 드라이브 / 지식 베이스 / 문서 시스템 | 다중 파일 큐, 다운로드, 검색, 전체 화면, 테마 적응 |
| 로우코드 / 폼 시스템 | React, Vue, Svelte에 강하게 의존하지 않는 Vanilla JS 통합 |
| 엔지니어링 / 제조 / GIS 시스템 | CAD, 3D, GIS, 도면 파일 인식과 점진적 강화 |
| 개발자 플랫폼 / 로그 플랫폼 | 텍스트, 설정, Markdown, 코드 하이라이트, 대용량 파일 보호 |

## 기능 개요

| 기능 | 상태 |
| --- | --- |
| Vanilla JS / React / Vue / Svelte 통합 | 지원 |
| 사용자 지정 컨테이너, 너비, 높이, 반응형 크기 | 지원 |
| 다중 파일 큐, 전환, 현재 인덱스 | 지원 |
| 툴바, 다운로드, 전체 화면, 인쇄, 검색 | 지원 |
| light, dark, `auto` 테마 | 지원 |
| 로컬 `File` / `Blob` / URL / `ArrayBuffer` 입력 | 지원 |
| 플러그인 프로토콜과 사용자 지정 fallback | 지원 |
| PDF, 이미지, 오디오/비디오, 텍스트/코드 | 지원 |
| Office, OFD, EPUB, XPS, 이메일, 압축 파일 | 기본에서 향상된 미리보기까지 |
| CAD, 3D, GIS, 드로잉 보드, 디자인 자산 | 인식, 기본 미리보기, 지속적인 개선 |

## 형식 지원

| 분류 | 플러그인 | 대표 형식 |
| --- | --- | --- |
| 이미지 | `imagePlugin()` | `jpg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp`, `tiff`, `heic`, `heif` |
| 비디오 | `videoPlugin()` | `mp4`, `webm`, `mov`, `m4v`, `avi`, `mkv`, `flv`, `wmv`, `m3u8`, `m2ts` |
| 오디오 | `audioPlugin()` | `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`, `opus`, `mid`, `wma` |
| 텍스트 / 코드 | `textPlugin()` | `txt`, `md`, `json`, `yaml`, `xml`, `csv`, `js`, `ts`, `tsx`, `vue`, `html`, `css`, `py`, `go`, `rs`, `sql`, `sh` |
| PDF / 전자책 | `pdfPlugin()`, `epubPlugin()`, `xpsPlugin()` | `pdf`, `epub`, `xps`, `oxps` |
| Office | `officePlugin()` | `docx`, `rtf`, `odt`, `xlsx`, `csv`, `pptx`, `odp`, `wps`, `et`, `dps` |
| OFD | `ofdPlugin()` | `ofd` |
| 압축 파일 | `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| 이메일 | `emailPlugin()` | `eml`, `msg`, `mbox` |
| 드로잉 / 화이트보드 | `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| CAD / 엔지니어링 | `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs`, `ifc`, `skp`, `sldprt` |
| 3D 모델 | `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf`, `usd`, `usdz` |
| GIS | `gisPlugin()` | `geojson`, `topojson`, `kml`, `kmz`, `gpx`, `shp` |
| 자산 인식 | `assetPlugin()` | `ttf`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro` |

복잡한 형식의 미리보기 품질은 브라우저 기능, 파일 구조, 각 플러그인이 사용하는 파서에 따라 달라집니다. 현재 버전은 모든 형식이 컨테이너 안에서 제어 가능한 미리보기 경로로 들어가도록 하는 데 우선순위를 둡니다. 고충실도 Office, CAD, 디자인, 전용 바이너리 형식은 전용 엔진이나 서버 사이드 변환으로 계속 강화할 수 있습니다.

플러그인 순서는 중요합니다. 가장 먼저 일치한 플러그인이 파일을 렌더링합니다. 예를 들어 `csv`와 `tsv`는 `textPlugin()`과 `officePlugin()` 모두에 일치할 수 있으므로, 스프레드시트 스타일의 테이블 미리보기를 원한다면 `officePlugin()`을 앞에 배치하세요.

## Core API

```ts
createViewer(options: PreviewOptions): FileViewer;
```

### PreviewOptions

| 옵션 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | 필수 | 미리보기 컨테이너 |
| `file` | `File \| Blob \| string \| ArrayBuffer` | - | 단일 파일 미리보기 소스 |
| `files` | `(PreviewSource \| PreviewItem)[]` | - | 다중 파일 미리보기 큐 |
| `initialIndex` | `number` | `0` | 초기 파일 인덱스 |
| `fileName` | `string` | 자동 추론 | 확장자 감지에 사용하는 파일명 |
| `mimeType` | `string` | 자동 추론 | MIME 타입 |
| `width` | `number \| string` | 원래 컨테이너 너비 | 미리보기 컨테이너 너비 |
| `height` | `number \| string` | 원래 컨테이너 높이 | 미리보기 컨테이너 높이 |
| `fit` | `contain \| cover \| width \| height \| actual \| scale-down` | `contain` | 콘텐츠 맞춤 방식 |
| `plugins` | `PreviewPlugin[]` | `[]` | 순서대로 매칭되는 플러그인 목록 |
| `fallback` | `inline \| download \| custom` | `inline` | 지원되지 않는 형식의 fallback 전략 |
| `renderFallback` | `(ctx) => PreviewInstance` | - | 사용자 지정 fallback 렌더러 |
| `toolbar` | `boolean \| PreviewToolbarOptions` | `false` | 툴바 설정 |
| `theme` | `light \| dark \| auto` | `light` | 뷰어 테마 |
| `className` | `string` | - | 추가 컨테이너 클래스명 |
| `onLoad` | `(file) => void` | - | 로드 완료 콜백 |
| `onError` | `(error, file) => void` | - | 오류 콜백 |
| `onUnsupported` | `(file) => void` | - | 지원되지 않는 형식 콜백 |

## 툴바 사용자 지정

`toolbar: true`는 활성 플러그인이 지원하는 경우 다중 파일 탐색, 확대/축소, 회전, 다운로드, 전체 화면, 인쇄, 검색을 포함하는 기본 툴바를 활성화합니다. 전체 뷰어를 다시 작성하지 않고 업무 흐름에 맞게 확장할 수 있습니다.

### 라벨, 순서, 아이콘 사용자 지정

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
      download: "Download",
      fullscreen: "Fullscreen",
      search: "Search",
      "zoom-in": "Zoom in",
      "zoom-out": "Zoom out",
      "zoom-reset": "Actual size",
      "rotate-right": "Rotate"
    },
    titles: {
      download: "Download current file"
    },
    icons: {
      download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>'
    },
    order: ["search", "zoom-out", "zoom-in", "zoom-reset", "rotate-right", "download", "fullscreen"]
  },
  plugins
});
```

### 업무 액션 추가

```ts
createViewer({
  container: "#viewer",
  file,
  toolbar: {
    order: ["download", "favorite", "approve", "share", "fullscreen"],
    actions: [
      {
        id: "favorite",
        label: "Favorite",
        onClick(ctx) {
          favoriteFile(ctx.file);
        }
      },
      {
        id: "approve",
        label: "Approve",
        onClick(ctx) {
          openApprovalDialog(ctx.file);
        }
      },
      {
        id: "share",
        label: "Share",
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

### 툴바 완전 교체

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
      next.textContent = "Next";
      next.disabled = !ctx.canNext;
      next.onclick = () => void ctx.next();

      const download = document.createElement("button");
      download.type = "button";
      download.textContent = "Download";
      download.onclick = ctx.download;

      bar.append(name, next, download);
      return bar;
    }
  },
  plugins
});
```

`render(ctx)` 컨텍스트에는 `file`, `index`, `length`, `previous()`, `next()`, `command()`, `download()`, `fullscreen()`, `print()`, `search()`, `clearSearch()`가 포함됩니다. core에서 `toolbar.render(ctx)`는 DOM `HTMLElement | void`를 반환합니다. React, Vue, Svelte는 각 프레임워크에 맞는 툴바 API를 제공합니다.

### React 사용자 지정 툴바

```tsx
<FileViewer
  files={files}
  plugins={plugins}
  renderToolbar={(ctx) => (
    <>
      <button disabled={!ctx.canPrevious} onClick={() => void ctx.previous()}>Previous</button>
      <span>{ctx.index + 1} / {ctx.length}</span>
      <button disabled={!ctx.canNext} onClick={() => void ctx.next()}>Next</button>
      <button onClick={ctx.download}>Download</button>
      <button onClick={() => openApprovalDialog(ctx.file)}>Approve</button>
    </>
  )}
/>
```

### Vue 사용자 지정 툴바

```vue
<OpenFileViewer :files="files" :plugins="plugins">
  <template #toolbar="ctx">
    <button :disabled="!ctx.canPrevious" @click="ctx.previous()">Previous</button>
    <span>{{ ctx.index + 1 }} / {{ ctx.length }}</span>
    <button :disabled="!ctx.canNext" @click="ctx.next()">Next</button>
    <button @click="ctx.download()">Download</button>
    <button @click="openApprovalDialog(ctx.file)">Approve</button>
  </template>
</OpenFileViewer>
```

### Svelte 사용자 지정 툴바

```svelte
<OpenFileViewer files={files} plugins={plugins}>
  <svelte:fragment slot="toolbar" let:ctx>
    {#if ctx}
      <button disabled={!ctx.canPrevious} on:click={() => void ctx.previous()}>Previous</button>
      <span>{ctx.index + 1} / {ctx.length}</span>
      <button disabled={!ctx.canNext} on:click={() => void ctx.next()}>Next</button>
      <button on:click={ctx.download}>Download</button>
      <button on:click={() => openApprovalDialog(ctx.file)}>Approve</button>
    {/if}
  </svelte:fragment>
</OpenFileViewer>
```

스타일 레이어에서는 `.ofv-toolbar`, `.ofv-toolbar button`, `.ofv-toolbar-search` 같은 class를 계속 오버라이드할 수 있습니다. 사용자 지정 아이콘 버튼은 `.ofv-toolbar-icon`과 `.ofv-toolbar-label`도 생성하므로 정렬, 간격, 말줄임을 제어하기 쉽습니다.

### FileViewer

| 메서드 | 설명 |
| --- | --- |
| `reload(file?)` | 현재 파일 또는 지정 파일 다시 로드 |
| `next()` / `previous()` | 다중 파일 큐 전환 |
| `goTo(index)` | 지정 파일로 이동 |
| `getCurrentIndex()` | 현재 인덱스 가져오기 |
| `resize()` | 크기 재계산을 수동으로 트리거 |
| `destroy()` | 뷰어를 제거하고 리소스 정리 |

## 플러그인 개발

각 형식은 플러그인을 통해 통합됩니다. 플러그인은 이 파일이 매칭되는지, 그리고 `ctx.viewport`에 어떻게 렌더링할지만 결정하면 됩니다.

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

플러그인 제약:

- `ctx.viewport` 안에만 렌더링합니다.
- 기본적으로 새 창을 열지 않습니다.
- 컨테이너 크기 변화에 대응해야 하면 `resize(size)`를 구현합니다.
- 이벤트, Object URL, 타이머, Canvas/WebGL 리소스 같은 부작용을 정리하기 위해 `destroy()`를 구현합니다.

## 패키지 구조

```txt
packages/
  core/      # 프레임워크에 독립적인 미리보기 core와 플러그인
  react/     # React 어댑터
  vue/       # Vue 어댑터
  svelte/    # Svelte 어댑터
examples/
  vanilla/   # Vanilla JavaScript 예제
  react/     # React 예제
  vue/       # Vue 예제
  svelte/    # Svelte 예제
doc/         # 웹사이트와 온라인 경험
```

## 로컬 개발

```bash
pnpm install
pnpm check
```

자주 사용하는 명령:

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

`pnpm check`는 테스트, 타입 검사, packages 빌드, examples 빌드, 웹사이트 빌드, package exports 검증을 순서대로 실행합니다.

## 로드맵

| 버전 | 중점 |
| --- | --- |
| `0.1.x` | Core 플러그인 시스템, 컨테이너 내 미리보기, React/Vue/Svelte/Vanilla 통합, 기본 다중 형식 미리보기 |
| `0.2.x` | 툴바, 테마, 이미지 상호작용, PDF 검색, 통합 상태, fallback |
| `0.3.x` | Markdown/코드 리더, Office 스프레드시트와 문서 경험 강화 |
| `0.4.x` | OFD, 이메일, 압축 파일, 드로잉 파일, 중국 업무에서 자주 쓰이는 형식 강화 |
| `0.5.x` | CAD, 3D, GIS, 전용 파서, 서버 사이드 변환 협업 |
| `1.0.0` | 안정적인 API, 완전한 문서 사이트, 시각적 회귀 테스트, 플러그인 개발 가이드 |

## 커뮤니티와 지원

Open File Viewer는 더 많은 형식 미리보기, 프레임워크 통합, 실제 업무 시나리오를 계속 개선합니다. 오픈소스를 유지하는 일은 쉽지 않습니다. 개발 시간을 절약해 주었다면 GitHub Star는 앞으로의 개선에 큰 도움이 됩니다.

- 피드백: GitHub Issues, 커뮤니티 그룹, 작성자의 WeChat을 통해 파일 샘플, 레이아웃 문제, 컨테이너 적응 문제, 새로운 형식 요청을 공유해 주세요.
- 학습과 교류: 공식 계정 "Frontend Development Enthusiasts"는 프론트엔드 엔지니어링, 컴포넌트 개발, 오픈소스 실천을 계속 공유합니다.
- 작성자 지원: 작성자에게 커피나 생수를 사 주고 싶다면 큰 격려가 됩니다. 후원 사용자는 작성자의 WeChat을 추가해 이후 프론트엔드 관련 이야기를 나눌 수 있습니다.

<table>
  <tr>
    <td align="center" width="20%">
      <img src="./doc/public/images/official-account-qr.jpg" width="140" alt="Official account QR code: Frontend Development Enthusiasts" />
      <br />
      <strong>Official Account</strong>
      <br />
      Frontend Development Enthusiasts
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/community-group-qr.png" width="140" alt="Community group QR code" />
      <br />
      <strong>Community Group</strong>
      <br />
      Frontend technology discussion
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/author-wechat-qr.png" width="140" alt="Author WeChat QR code" />
      <br />
      <strong>Author WeChat</strong>
      <br />
      Frontend discussion
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/wechat-donation-qr.png" width="140" alt="WeChat donation QR code" />
      <br />
      <strong>WeChat Donation</strong>
      <br />
      Buy the author a coffee
    </td>
    <td align="center" width="20%">
      <img src="./doc/public/images/alipay-donation-qr.png" width="140" alt="Alipay donation QR code" />
      <br />
      <strong>Alipay Donation</strong>
      <br />
      Buy the author a bottle of water
    </td>
  </tr>
</table>

## 링크

- 웹사이트: https://open-file-viewer-workspace.void.app
- About: https://open-file-viewer-workspace.void.app/about.html
- GitHub: https://github.com/xushanpei/open-file-viewer
- NPM Core: https://www.npmjs.com/package/@open-file-viewer/core
- NPM React: https://www.npmjs.com/package/@open-file-viewer/react
- NPM Vue: https://www.npmjs.com/package/@open-file-viewer/vue
- NPM Svelte: https://www.npmjs.com/package/@open-file-viewer/svelte

## License

[MIT](./LICENSE)
