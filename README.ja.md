# Open File Viewer

<p align="right">
  <a href="./README.md">简体中文</a>
  |
  <a href="./README.en.md">English</a>
  |
  <strong>日本語</strong>
  |
  <a href="./README.ko.md">한국어</a>
  |
  <a href="./README.es.md">Español</a>
  |
  <a href="./README.pt-BR.md">Português</a>
</p>

Open File Viewer は、モダンな Web プロダクト向けのファイルプレビュー SDK です。PDF、Office ドキュメント、画像、音声・動画、アーカイブ、メール、図面、3D ファイル、GIS データ、ソースコードを、1 つの制御可能なコンテナ内で扱えます。Vanilla JavaScript、React、Vue、Svelte を同時にサポートします。

<p>
  <a href="https://open-file-viewer-workspace.void.app">Web サイト</a>
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

## 選ばれる理由

多くの業務システムでは、契約書、表計算、図面、アーカイブ、メール、画像、動画、ソースファイルなど、添付ファイルのプレビューが必要になります。Open File Viewer は PDF だけを開くデモではなく、実際のプロダクト要件に合わせて長期的に進化できるファイルプレビューの基盤です。

- **コンテナ優先**: すべての内容は、指定した DOM コンテナ内にレンダリングされます。新しいウィンドウを開かず、業務ページを中断しません。
- **複数フレームワーク対応**: Vanilla JavaScript、React、Vue、Svelte が同じ core 機能を共有します。
- **プラグインベースの形式対応**: 各ファイル形式は独立したプラグインが担当するため、置き換え、削減、拡張がしやすくなります。
- **レスポンシブプレビュー**: `px`、`%`、`vh`、`vw`、`rem`、`calc()` などの CSS サイズをサポートし、コンテナの変化に自動で追従します。
- **アプリケーション向けの状態管理**: loading、error、unsupported、download fallback、ツールバー、テーマ、複数ファイルキューを備えています。
- **複雑な形式の段階的強化**: ブラウザで直接プレビューできる形式はローカルで優先的にレンダリングし、複雑な形式は WASM、専用パーサー、サーバーサイド変換を段階的に組み込めます。

## インストール

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

`pdfPlugin()` を使用する場合、PDF プレビューには `pdfjs-dist` が必要です。

```bash
pnpm add pdfjs-dist
```

npm または yarn も利用できます。

```bash
npm install @open-file-viewer/core
yarn add @open-file-viewer/core
```

共有スタイルはアプリケーション内で一度だけ import してください。

```ts
import "@open-file-viewer/core/style.css";
```

## クイックスタート

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

## 利用シーン

| シーン | Open File Viewer が提供するもの |
| --- | --- |
| OA / ERP / CRM の添付ファイルセンター | 契約書、表計算、画像、メール、アーカイブを統一コンテナでプレビュー |
| クラウドドライブ / ナレッジベース / 文書システム | 複数ファイルキュー、ダウンロード、検索、全画面、テーマ適応 |
| ローコード / フォームシステム | React、Vue、Svelte を強制しない Vanilla JS 統合 |
| エンジニアリング / 製造 / GIS システム | CAD、3D、GIS、図面系ファイルの認識と段階的強化 |
| 開発者プラットフォーム / ログプラットフォーム | テキスト、設定、Markdown、コードハイライト、大容量ファイル保護 |

## 機能概要

| 機能 | 状態 |
| --- | --- |
| Vanilla JS / React / Vue / Svelte 統合 | 対応済み |
| カスタムコンテナ、幅、高さ、レスポンシブサイズ | 対応済み |
| 複数ファイルキュー、切り替え、現在インデックス | 対応済み |
| ツールバー、ダウンロード、全画面、印刷、検索 | 対応済み |
| light、dark、`auto` テーマ | 対応済み |
| ローカル `File` / `Blob` / URL / `ArrayBuffer` 入力 | 対応済み |
| プラグインプロトコルとカスタム fallback | 対応済み |
| PDF、画像、音声・動画、テキスト/コード | 対応済み |
| Office、OFD、EPUB、XPS、メール、アーカイブ | 基本から拡張プレビューまで |
| CAD、3D、GIS、描画ボード、デザイン資産 | 認識、基本プレビュー、継続的な強化 |

## 形式カバレッジ

| カテゴリ | プラグイン | 代表的な形式 |
| --- | --- | --- |
| 画像 | `imagePlugin()` | `jpg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp`, `tiff`, `heic`, `heif` |
| 動画 | `videoPlugin()` | `mp4`, `webm`, `mov`, `m4v`, `avi`, `mkv`, `flv`, `wmv`, `m3u8`, `m2ts` |
| 音声 | `audioPlugin()` | `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`, `opus`, `mid`, `wma` |
| テキスト / コード | `textPlugin()` | `txt`, `md`, `json`, `yaml`, `xml`, `csv`, `js`, `ts`, `tsx`, `vue`, `html`, `css`, `py`, `go`, `rs`, `sql`, `sh` |
| PDF / 電子書籍 | `pdfPlugin()`, `epubPlugin()`, `xpsPlugin()` | `pdf`, `epub`, `xps`, `oxps` |
| Office | `officePlugin()` | `docx`, `rtf`, `odt`, `xlsx`, `csv`, `pptx`, `odp`, `wps`, `et`, `dps` |
| OFD | `ofdPlugin()` | `ofd` |
| アーカイブ | `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| メール | `emailPlugin()` | `eml`, `msg`, `mbox` |
| 描画 / ホワイトボード | `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| CAD / エンジニアリング | `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs`, `ifc`, `skp`, `sldprt` |
| 3D モデル | `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf`, `usd`, `usdz` |
| GIS | `gisPlugin()` | `geojson`, `topojson`, `kml`, `kmz`, `gpx`, `shp` |
| アセット認識 | `assetPlugin()` | `ttf`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro` |

複雑な形式のプレビュー品質は、ブラウザの能力、ファイル構造、各プラグインで使用するパーサーに依存します。現在のバージョンは、すべての形式をコンテナ内の制御可能なプレビュー経路に入れることを優先しています。高忠実度の Office、CAD、デザイン、専有バイナリ形式は、専用エンジンやサーバーサイド変換で継続的に強化できます。

プラグインの順序は重要です。最初に一致したプラグインがファイルをレンダリングします。たとえば `csv` と `tsv` は `textPlugin()` と `officePlugin()` の両方に一致するため、表計算形式のテーブルプレビューを優先したい場合は `officePlugin()` を前に配置してください。

## Core API

```ts
createViewer(options: PreviewOptions): FileViewer;
```

### PreviewOptions

| オプション | 型 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | 必須 | プレビューコンテナ |
| `file` | `File \| Blob \| string \| ArrayBuffer` | - | 単一ファイルのプレビューソース |
| `files` | `(PreviewSource \| PreviewItem)[]` | - | 複数ファイルのプレビューキュー |
| `initialIndex` | `number` | `0` | 初期ファイルインデックス |
| `fileName` | `string` | 自動推論 | 拡張子検出に使うファイル名 |
| `mimeType` | `string` | 自動推論 | MIME タイプ |
| `width` | `number \| string` | 元のコンテナ幅 | プレビューコンテナの幅 |
| `height` | `number \| string` | 元のコンテナ高さ | プレビューコンテナの高さ |
| `fit` | `contain \| cover \| width \| height \| actual \| scale-down` | `contain` | コンテンツのフィット方式 |
| `plugins` | `PreviewPlugin[]` | `[]` | 順番にマッチするプラグインリスト |
| `fallback` | `inline \| download \| custom` | `inline` | 非対応形式の fallback 戦略 |
| `renderFallback` | `(ctx) => PreviewInstance` | - | カスタム fallback レンダラー |
| `toolbar` | `boolean \| PreviewToolbarOptions` | `false` | ツールバー設定 |
| `theme` | `light \| dark \| auto` | `light` | ビューアテーマ |
| `className` | `string` | - | 追加コンテナクラス名 |
| `onLoad` | `(file) => void` | - | 読み込み完了コールバック |
| `onError` | `(error, file) => void` | - | エラーコールバック |
| `onUnsupported` | `(file) => void` | - | 非対応形式コールバック |

## ツールバーのカスタマイズ

`toolbar: true` は、アクティブなプラグインが対応している場合に、複数ファイルナビゲーション、ズーム、回転、ダウンロード、全画面、印刷、検索を含むデフォルトツールバーを有効にします。業務フローに合わせて、ビューア全体を書き直さずに拡張できます。

### ラベル、順序、アイコンのカスタマイズ

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

### 業務アクションの追加

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

### ツールバーを完全に置き換える

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

`render(ctx)` のコンテキストには、`file`、`index`、`length`、`previous()`、`next()`、`command()`、`download()`、`fullscreen()`、`print()`、`search()`、`clearSearch()` が含まれます。core では `toolbar.render(ctx)` は DOM の `HTMLElement | void` を返します。React、Vue、Svelte では、それぞれのフレームワークに合ったツールバー API が提供されます。

### React カスタムツールバー

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

### Vue カスタムツールバー

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

### Svelte カスタムツールバー

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

スタイル層では、`.ofv-toolbar`、`.ofv-toolbar button`、`.ofv-toolbar-search` などの class を引き続き上書きできます。カスタムアイコンボタンは `.ofv-toolbar-icon` と `.ofv-toolbar-label` も生成するため、配置、余白、省略表示を制御しやすくなります。

### FileViewer

| メソッド | 説明 |
| --- | --- |
| `reload(file?)` | 現在のファイルまたは指定ファイルを再読み込み |
| `next()` / `previous()` | 複数ファイルキューを切り替え |
| `goTo(index)` | 指定ファイルへ移動 |
| `getCurrentIndex()` | 現在のインデックスを取得 |
| `resize()` | サイズ再計算を手動で実行 |
| `destroy()` | ビューアを破棄し、リソースを解放 |

## プラグイン開発

各形式はプラグインとして統合されます。プラグインが答える必要があるのは、このファイルが一致するか、そして `ctx.viewport` にどうレンダリングするか、という 2 点です。

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

プラグインの制約:

- `ctx.viewport` の中だけにレンダリングする。
- デフォルトでは新しいウィンドウを開かない。
- コンテナサイズの変化に反応する必要がある場合は `resize(size)` を実装する。
- イベント、Object URL、タイマー、Canvas/WebGL リソースなどの副作用を解放するために `destroy()` を実装する。

## パッケージ構成

```txt
packages/
  core/      # フレームワーク非依存のプレビュー core とプラグイン
  react/     # React アダプター
  vue/       # Vue アダプター
  svelte/    # Svelte アダプター
examples/
  vanilla/   # Vanilla JavaScript の例
  react/     # React の例
  vue/       # Vue の例
  svelte/    # Svelte の例
doc/         # Web サイトとオンライン体験
```

## ローカル開発

```bash
pnpm install
pnpm check
```

よく使うコマンド:

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

`pnpm check` は、テスト、型チェック、packages ビルド、examples ビルド、Web サイトビルド、package exports 検証を順番に実行します。

## ロードマップ

| バージョン | フォーカス |
| --- | --- |
| `0.1.x` | Core プラグインシステム、コンテナ内プレビュー、React/Vue/Svelte/Vanilla 統合、基本的な複数形式プレビュー |
| `0.2.x` | ツールバー、テーマ、画像操作、PDF 検索、統一状態、fallback |
| `0.3.x` | Markdown/コードリーダー、Office 表計算と文書体験の強化 |
| `0.4.x` | OFD、メール、アーカイブ、描画ファイル、中国国内業務で頻出する形式の強化 |
| `0.5.x` | CAD、3D、GIS、専用パーサー、サーバーサイド変換との連携 |
| `1.0.0` | 安定 API、完全なドキュメントサイト、ビジュアル回帰テスト、プラグイン開発ガイド |

## コミュニティとサポート

Open File Viewer は、より多くの形式プレビュー、フレームワーク統合、実際の業務シーンを継続的に改善します。オープンソースの継続は簡単ではありません。開発時間の節約に役立った場合は、無料の GitHub Star が今後の改善を支える大きな助けになります。

- フィードバック: GitHub Issues、コミュニティグループ、作者の WeChat を通じて、ファイルサンプル、レイアウト問題、コンテナ適応問題、新しい形式の要望を共有してください。
- 学習と交流: 公式アカウント "Frontend Development Enthusiasts" では、フロントエンドエンジニアリング、コンポーネント開発、オープンソース実践を継続的に共有します。
- 作者のサポート: 作者にコーヒーやミネラルウォーターをごちそうしたい場合、その応援はとても励みになります。寄付ユーザーは作者の WeChat を追加して、今後フロントエンド関連の話題を交流できます。

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

## リンク

- Web サイト: https://open-file-viewer-workspace.void.app
- About: https://open-file-viewer-workspace.void.app/about.html
- GitHub: https://github.com/xushanpei/open-file-viewer
- NPM Core: https://www.npmjs.com/package/@open-file-viewer/core
- NPM React: https://www.npmjs.com/package/@open-file-viewer/react
- NPM Vue: https://www.npmjs.com/package/@open-file-viewer/vue
- NPM Svelte: https://www.npmjs.com/package/@open-file-viewer/svelte

## License

[MIT](./LICENSE)
