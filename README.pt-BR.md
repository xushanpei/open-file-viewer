# Open File Viewer

<p align="right">
  <a href="./README.md">简体中文</a>
  |
  <a href="./README.en.md">English</a>
  |
  <a href="./README.ja.md">日本語</a>
  |
  <a href="./README.ko.md">한국어</a>
  |
  <a href="./README.es.md">Español</a>
  |
  <strong>Português</strong>
</p>

Open File Viewer é um SDK de visualização de arquivos para aplicações web modernas. Ele coloca PDFs, documentos Office, imagens, áudio e vídeo, arquivos compactados, emails, desenhos, arquivos 3D, dados GIS e código-fonte dentro de um único contêiner controlado, com suporte a JavaScript nativo, React, Vue e Svelte.

<p>
  <a href="https://open-file-viewer-workspace.void.app">Site</a>
  |
  <a href="https://open-file-viewer-workspace.void.app/about.html">Sobre</a>
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

## Por Que Escolher

A maioria dos sistemas de negócio acaba precisando visualizar anexos: contratos, planilhas, desenhos, arquivos compactados, emails, imagens, vídeos e arquivos de código. Open File Viewer não é uma demonstração apenas para PDF; é uma base de visualização de arquivos que pode evoluir com necessidades reais de produto.

- **Contêiner em primeiro lugar**: todo o conteúdo é renderizado dentro do contêiner DOM que você fornece. Ele não abre uma nova janela nem interrompe a página de negócio.
- **Compatibilidade com vários frameworks**: JavaScript nativo, React, Vue e Svelte compartilham as mesmas capacidades do core.
- **Formatos baseados em plugins**: cada formato de arquivo é tratado por um plugin independente, facilitando substituição, recorte e extensão.
- **Visualização responsiva**: suporta tamanhos CSS como `px`, `%`, `vh`, `vw`, `rem` e `calc()`, respondendo automaticamente às mudanças do contêiner.
- **Estados prontos para aplicação**: inclui loading, error, unsupported, download fallback, toolbar, theme e fila de múltiplos arquivos.
- **Aprimoramento progressivo para formatos complexos**: formatos que o navegador consegue visualizar diretamente são renderizados localmente primeiro; formatos complexos podem integrar gradualmente WASM, parsers dedicados ou conversão no servidor.

## Instalação

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

A visualização de PDF requer `pdfjs-dist` quando você usa `pdfPlugin()`:

```bash
pnpm add pdfjs-dist
```

Você também pode usar npm ou yarn:

```bash
npm install @open-file-viewer/core
yarn add @open-file-viewer/core
```

Importe a folha de estilos compartilhada uma vez na aplicação:

```ts
import "@open-file-viewer/core/style.css";
```

## Início Rápido

### JavaScript Nativo

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

## Casos de Uso

| Cenário | O Que o Open File Viewer Fornece |
| --- | --- |
| Centros de anexos OA / ERP / CRM | Visualização unificada em contêiner para contratos, planilhas, imagens, emails e arquivos compactados |
| Drives em nuvem / bases de conhecimento / sistemas documentais | Fila de múltiplos arquivos, download, busca, tela cheia e adaptação de tema |
| Sistemas low-code / formulários | Integração com JavaScript nativo sem exigir React, Vue ou Svelte |
| Engenharia / manufatura / sistemas GIS | Reconhecimento e aprimoramento progressivo para arquivos CAD, 3D, GIS e desenhos |
| Plataformas de desenvolvimento / logs | Texto, configuração, Markdown, destaque de código e proteção para arquivos grandes |

## Visão Geral de Recursos

| Recurso | Status |
| --- | --- |
| Integração com JS nativo / React / Vue / Svelte | Suportado |
| Contêiner, largura, altura e tamanho responsivo personalizados | Suportado |
| Fila de múltiplos arquivos, troca e índice atual | Suportado |
| Toolbar, download, tela cheia, impressão e busca | Suportado |
| Temas light, dark e `auto` | Suportado |
| Fontes locais `File` / `Blob` / URL / `ArrayBuffer` | Suportado |
| Protocolo de plugins e fallback personalizado | Suportado |
| PDF, imagens, áudio/vídeo, texto/código | Suportado |
| Office, OFD, EPUB, XPS, email e arquivos compactados | Visualização básica a aprimorada |
| CAD, 3D, GIS, quadros de desenho e ativos de design | Reconhecimento, visualização básica e melhorias contínuas |

## Cobertura de Formatos

| Categoria | Plugin | Formatos Representativos |
| --- | --- | --- |
| Imagens | `imagePlugin()` | `jpg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp`, `tiff`, `heic`, `heif` |
| Vídeo | `videoPlugin()` | `mp4`, `webm`, `mov`, `m4v`, `avi`, `mkv`, `flv`, `wmv`, `m3u8`, `m2ts` |
| Áudio | `audioPlugin()` | `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`, `opus`, `mid`, `wma` |
| Texto / código | `textPlugin()` | `txt`, `md`, `json`, `yaml`, `xml`, `csv`, `js`, `ts`, `tsx`, `vue`, `html`, `css`, `py`, `go`, `rs`, `sql`, `sh` |
| PDF / ebooks | `pdfPlugin()`, `epubPlugin()`, `xpsPlugin()` | `pdf`, `epub`, `xps`, `oxps` |
| Office | `officePlugin()` | `docx`, `rtf`, `odt`, `xlsx`, `csv`, `pptx`, `odp`, `wps`, `et`, `dps` |
| OFD | `ofdPlugin()` | `ofd` |
| Arquivos compactados | `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| Email | `emailPlugin()` | `eml`, `msg`, `mbox` |
| Desenho / quadro branco | `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| CAD / engenharia | `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs`, `ifc`, `skp`, `sldprt` |
| Modelos 3D | `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf`, `usd`, `usdz` |
| GIS | `gisPlugin()` | `geojson`, `topojson`, `kml`, `kmz`, `gpx`, `shp` |
| Reconhecimento de ativos | `assetPlugin()` | `ttf`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro` |

A qualidade da visualização para formatos complexos depende das capacidades do navegador, da estrutura do arquivo e do parser usado por cada plugin. A versão atual prioriza colocar todos os formatos em um caminho de visualização controlado dentro do contêiner. Formatos Office, CAD, de design e binários proprietários de alta fidelidade podem continuar sendo aprimorados com motores dedicados ou conversão no servidor.

A ordem dos plugins importa porque o primeiro plugin correspondente renderiza o arquivo. Por exemplo, `csv` e `tsv` podem corresponder tanto a `textPlugin()` quanto a `officePlugin()`; coloque `officePlugin()` antes se quiser visualização em tabela no estilo planilha.

## Core API

```ts
createViewer(options: PreviewOptions): FileViewer;
```

### PreviewOptions

| Opção | Tipo | Padrão | Descrição |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | Obrigatório | Contêiner de visualização |
| `file` | `File \| Blob \| string \| ArrayBuffer` | - | Fonte de visualização de arquivo único |
| `files` | `(PreviewSource \| PreviewItem)[]` | - | Fila de visualização de múltiplos arquivos |
| `initialIndex` | `number` | `0` | Índice inicial do arquivo |
| `fileName` | `string` | Inferido automaticamente | Nome usado para detectar extensão |
| `mimeType` | `string` | Inferido automaticamente | Tipo MIME |
| `width` | `number \| string` | Largura original do contêiner | Largura do contêiner |
| `height` | `number \| string` | Altura original do contêiner | Altura do contêiner |
| `fit` | `contain \| cover \| width \| height \| actual \| scale-down` | `contain` | Modo de ajuste do conteúdo |
| `plugins` | `PreviewPlugin[]` | `[]` | Lista de plugins, avaliada em ordem |
| `fallback` | `inline \| download \| custom` | `inline` | Estratégia fallback para formatos não suportados |
| `renderFallback` | `(ctx) => PreviewInstance` | - | Renderer fallback personalizado |
| `toolbar` | `boolean \| PreviewToolbarOptions` | `false` | Configuração da toolbar |
| `theme` | `light \| dark \| auto` | `light` | Tema do viewer |
| `className` | `string` | - | Classe extra para o contêiner |
| `onLoad` | `(file) => void` | - | Callback após carregamento |
| `onError` | `(error, file) => void` | - | Callback de erro |
| `onUnsupported` | `(file) => void` | - | Callback para formato não suportado |

## Personalização da Toolbar

`toolbar: true` habilita a toolbar padrão, incluindo navegação de múltiplos arquivos, zoom, rotação, download, tela cheia, impressão e busca quando suportados pelo plugin ativo. Você pode estendê-la para fluxos de negócio sem reescrever todo o viewer.

### Labels, Ordem e Ícones Personalizados

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

### Adicionar Ações de Negócio

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

### Substituir Completamente a Toolbar

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

O contexto `render(ctx)` inclui `file`, `index`, `length`, `previous()`, `next()`, `command()`, `download()`, `fullscreen()`, `print()`, `search()` e `clearSearch()`. No core, `toolbar.render(ctx)` retorna um DOM `HTMLElement | void`; React, Vue e Svelte expõem APIs de toolbar próprias de cada framework.

### Toolbar Personalizada no React

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

### Toolbar Personalizada no Vue

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

### Toolbar Personalizada no Svelte

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

Na camada de estilos, você ainda pode sobrescrever classes como `.ofv-toolbar`, `.ofv-toolbar button` e `.ofv-toolbar-search`. Botões com ícones personalizados também geram `.ofv-toolbar-icon` e `.ofv-toolbar-label`, facilitando controlar alinhamento, espaçamento e truncamento.

### FileViewer

| Método | Descrição |
| --- | --- |
| `reload(file?)` | Recarrega o arquivo atual ou um arquivo especificado |
| `next()` / `previous()` | Alterna dentro da fila de múltiplos arquivos |
| `goTo(index)` | Vai para um arquivo específico |
| `getCurrentIndex()` | Obtém o índice atual |
| `resize()` | Dispara manualmente o recálculo de tamanho |
| `destroy()` | Destrói o viewer e limpa recursos |

## Desenvolvimento de Plugins

Cada formato é integrado por meio de um plugin. Um plugin só precisa responder a duas perguntas: se o arquivo corresponde e como renderizar em `ctx.viewport`.

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

Restrições de plugins:

- Renderizar apenas dentro de `ctx.viewport`.
- Não abrir uma nova janela por padrão.
- Implementar `resize(size)` quando o plugin precisar reagir a mudanças de tamanho do contêiner.
- Implementar `destroy()` para limpar eventos, Object URLs, temporizadores, recursos Canvas/WebGL e outros efeitos colaterais.

## Estrutura de Pacotes

```txt
packages/
  core/      # Core de visualização e plugins independentes de framework
  react/     # Adaptador React
  vue/       # Adaptador Vue
  svelte/    # Adaptador Svelte
examples/
  vanilla/   # Exemplo com JavaScript nativo
  react/     # Exemplo React
  vue/       # Exemplo Vue
  svelte/    # Exemplo Svelte
doc/         # Site e experiência online
```

## Desenvolvimento Local

```bash
pnpm install
pnpm check
```

Comandos comuns:

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

`pnpm check` executa testes, type checks, builds dos packages, builds dos examples, build do site e validação de package exports em sequência.

## Roadmap

| Versão | Foco |
| --- | --- |
| `0.1.x` | Sistema de plugins core, visualização dentro do contêiner, integração React/Vue/Svelte/Vanilla, visualização básica de múltiplos formatos |
| `0.2.x` | Toolbar, temas, interações de imagem, busca em PDF, estados unificados e fallback |
| `0.3.x` | Leitor Markdown/código, melhorias em planilhas e documentos Office |
| `0.4.x` | OFD, email, arquivos compactados, desenhos e melhorias para formatos frequentes em negócios domésticos chineses |
| `0.5.x` | CAD, 3D, GIS, parsers dedicados e colaboração com conversão no servidor |
| `1.0.0` | API estável, site de documentação completo, testes visuais de regressão e guia de desenvolvimento de plugins |

## Comunidade e Suporte

Open File Viewer continuará melhorando a visualização de mais formatos, integrações com frameworks e cenários reais de negócio. Manter open source não é fácil. Se ele economizar seu tempo de integração, uma estrela no GitHub ajuda o projeto a continuar evoluindo.

- Feedback: use GitHub Issues, o grupo da comunidade ou o WeChat do autor para compartilhar amostras de arquivos, problemas de layout, adaptação de contêiner e pedidos de novos formatos.
- Aprendizado e discussão: a conta oficial "Frontend Development Enthusiasts" continuará compartilhando engenharia frontend, desenvolvimento de componentes e prática open source.
- Apoie o autor: se quiser pagar um café ao autor, ou até uma garrafa de água mineral, esse apoio é muito bem-vindo. Usuários que doarem podem adicionar o WeChat do autor para futuras conversas sobre frontend.

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

## Links

- Site: https://open-file-viewer-workspace.void.app
- Sobre: https://open-file-viewer-workspace.void.app/about.html
- GitHub: https://github.com/xushanpei/open-file-viewer
- NPM Core: https://www.npmjs.com/package/@open-file-viewer/core
- NPM React: https://www.npmjs.com/package/@open-file-viewer/react
- NPM Vue: https://www.npmjs.com/package/@open-file-viewer/vue
- NPM Svelte: https://www.npmjs.com/package/@open-file-viewer/svelte

## License

[MIT](./LICENSE)
