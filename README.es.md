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
  <strong>Español</strong>
  |
  <a href="./README.pt-BR.md">Português</a>
</p>

Open File Viewer es un SDK de vista previa de archivos para aplicaciones web modernas. Permite mostrar PDF, documentos de Office, imágenes, audio y video, archivos comprimidos, correos, planos, archivos 3D, datos GIS y código fuente dentro de un único contenedor controlado, con soporte para JavaScript nativo, React, Vue y Svelte.

<p>
  <a href="https://open-file-viewer-workspace.void.app">Sitio web</a>
  |
  <a href="https://open-file-viewer-workspace.void.app/about.html">Acerca de</a>
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

## Por Que Elegirlo

La mayoría de los sistemas empresariales terminan necesitando vista previa de adjuntos: contratos, hojas de cálculo, planos, archivos comprimidos, correos, imágenes, videos y archivos fuente. Open File Viewer no es una demo que solo abre PDF; es una base de vista previa de archivos que puede evolucionar con necesidades reales de producto.

- **Contenedor primero**: todo el contenido se renderiza dentro del contenedor DOM que proporcionas. No abre una nueva ventana ni interrumpe la página de negocio.
- **Compatibilidad con varios frameworks**: JavaScript nativo, React, Vue y Svelte comparten las mismas capacidades del core.
- **Formatos basados en plugins**: cada formato de archivo lo maneja un plugin independiente, lo que facilita reemplazar, recortar y extender comportamiento.
- **Vista previa responsiva**: admite tamaños CSS como `px`, `%`, `vh`, `vw`, `rem` y `calc()`, y responde automáticamente a cambios del contenedor.
- **Estados listos para aplicaciones**: incluye loading, error, unsupported, download fallback, toolbar, theme y cola de múltiples archivos.
- **Mejora progresiva para formatos complejos**: los formatos que el navegador puede previsualizar directamente se renderizan localmente primero; los formatos complejos pueden integrar gradualmente WASM, parsers dedicados o conversión del lado del servidor.

## Instalación

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

La vista previa de PDF requiere `pdfjs-dist` cuando usas `pdfPlugin()`:

```bash
pnpm add pdfjs-dist
```

También puedes usar npm o yarn:

```bash
npm install @open-file-viewer/core
yarn add @open-file-viewer/core
```

Importa la hoja de estilos compartida una vez en tu aplicación:

```ts
import "@open-file-viewer/core/style.css";
```

## Inicio Rápido

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

| Escenario | Qué Proporciona Open File Viewer |
| --- | --- |
| Centros de adjuntos OA / ERP / CRM | Vista previa unificada en contenedor para contratos, hojas de cálculo, imágenes, correos y archivos comprimidos |
| Unidades en la nube / bases de conocimiento / sistemas documentales | Cola de múltiples archivos, descarga, búsqueda, pantalla completa y adaptación de tema |
| Sistemas low-code / formularios | Integración con JavaScript nativo sin depender obligatoriamente de React, Vue o Svelte |
| Ingeniería / manufactura / sistemas GIS | Reconocimiento y mejora progresiva para archivos CAD, 3D, GIS y planos |
| Plataformas de desarrollo / logs | Texto, configuración, Markdown, resaltado de código y protección para archivos grandes |

## Resumen de Capacidades

| Capacidad | Estado |
| --- | --- |
| Integración con JS nativo / React / Vue / Svelte | Soportado |
| Contenedor, ancho, alto y tamaño responsivo personalizados | Soportado |
| Cola de múltiples archivos, cambio e índice actual | Soportado |
| Toolbar, descarga, pantalla completa, impresión y búsqueda | Soportado |
| Temas light, dark y `auto` | Soportado |
| Fuentes locales `File` / `Blob` / URL / `ArrayBuffer` | Soportado |
| Protocolo de plugins y fallback personalizado | Soportado |
| PDF, imágenes, audio/video, texto/código | Soportado |
| Office, OFD, EPUB, XPS, correo y archivos comprimidos | Vista previa básica a mejorada |
| CAD, 3D, GIS, tableros de dibujo y activos de diseño | Reconocimiento, vista previa básica y mejoras continuas |

## Cobertura de Formatos

| Categoría | Plugin | Formatos Representativos |
| --- | --- | --- |
| Imágenes | `imagePlugin()` | `jpg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp`, `tiff`, `heic`, `heif` |
| Video | `videoPlugin()` | `mp4`, `webm`, `mov`, `m4v`, `avi`, `mkv`, `flv`, `wmv`, `m3u8`, `m2ts` |
| Audio | `audioPlugin()` | `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`, `opus`, `mid`, `wma` |
| Texto / código | `textPlugin()` | `txt`, `md`, `json`, `yaml`, `xml`, `csv`, `js`, `ts`, `tsx`, `vue`, `html`, `css`, `py`, `go`, `rs`, `sql`, `sh` |
| PDF / ebooks | `pdfPlugin()`, `epubPlugin()`, `xpsPlugin()` | `pdf`, `epub`, `xps`, `oxps` |
| Office | `officePlugin()` | `docx`, `rtf`, `odt`, `xlsx`, `csv`, `pptx`, `odp`, `wps`, `et`, `dps` |
| OFD | `ofdPlugin()` | `ofd` |
| Archivos comprimidos | `archivePlugin()` | `zip`, `rar`, `7z`, `tar`, `gz`, `tgz`, `bz2`, `xz` |
| Email | `emailPlugin()` | `eml`, `msg`, `mbox` |
| Dibujo / pizarra | `drawingPlugin()` | `drawio`, `dio`, `excalidraw`, `tldraw` |
| CAD / ingeniería | `cadPlugin()` | `dxf`, `dwg`, `dwf`, `step`, `stp`, `iges`, `igs`, `ifc`, `skp`, `sldprt` |
| Modelos 3D | `model3dPlugin()` | `gltf`, `glb`, `obj`, `stl`, `fbx`, `dae`, `ply`, `3mf`, `usd`, `usdz` |
| GIS | `gisPlugin()` | `geojson`, `topojson`, `kml`, `kmz`, `gpx`, `shp` |
| Reconocimiento de activos | `assetPlugin()` | `ttf`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro` |

La calidad de vista previa para formatos complejos depende de las capacidades del navegador, la estructura del archivo y el parser usado por cada plugin. La versión actual prioriza que todos los formatos entren en una ruta de vista previa controlada dentro del contenedor. Los formatos Office, CAD, de diseño y binarios propietarios de alta fidelidad pueden seguir mejorándose con motores dedicados o conversión del lado del servidor.

El orden de los plugins importa porque el primer plugin que coincide renderiza el archivo. Por ejemplo, `csv` y `tsv` pueden coincidir tanto con `textPlugin()` como con `officePlugin()`; coloca `officePlugin()` antes si quieres una vista previa de tabla tipo hoja de cálculo.

## Core API

```ts
createViewer(options: PreviewOptions): FileViewer;
```

### PreviewOptions

| Opción | Tipo | Valor por Defecto | Descripción |
| --- | --- | --- | --- |
| `container` | `HTMLElement \| string` | Requerido | Contenedor de vista previa |
| `file` | `File \| Blob \| string \| ArrayBuffer` | - | Fuente de vista previa de un solo archivo |
| `files` | `(PreviewSource \| PreviewItem)[]` | - | Cola de vista previa de múltiples archivos |
| `initialIndex` | `number` | `0` | Índice inicial del archivo |
| `fileName` | `string` | Inferido automáticamente | Nombre usado para detectar extensión |
| `mimeType` | `string` | Inferido automáticamente | Tipo MIME |
| `width` | `number \| string` | Ancho original del contenedor | Ancho del contenedor |
| `height` | `number \| string` | Alto original del contenedor | Alto del contenedor |
| `fit` | `contain \| cover \| width \| height \| actual \| scale-down` | `contain` | Modo de ajuste del contenido |
| `plugins` | `PreviewPlugin[]` | `[]` | Lista de plugins, evaluada en orden |
| `fallback` | `inline \| download \| custom` | `inline` | Estrategia fallback para formatos no soportados |
| `renderFallback` | `(ctx) => PreviewInstance` | - | Renderer fallback personalizado |
| `toolbar` | `boolean \| PreviewToolbarOptions` | `false` | Configuración de toolbar |
| `theme` | `light \| dark \| auto` | `light` | Tema del viewer |
| `className` | `string` | - | Clase extra para el contenedor |
| `onLoad` | `(file) => void` | - | Callback al completar carga |
| `onError` | `(error, file) => void` | - | Callback de error |
| `onUnsupported` | `(file) => void` | - | Callback para formato no soportado |

## Personalización de Toolbar

`toolbar: true` habilita la toolbar predeterminada, incluyendo navegación de múltiples archivos, zoom, rotación, descarga, pantalla completa, impresión y búsqueda cuando el plugin activo lo soporta. Puedes extenderla para flujos de negocio sin reescribir todo el viewer.

### Labels, Orden e Iconos Personalizados

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

### Agregar Acciones de Negocio

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

### Reemplazar Completamente la Toolbar

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

El contexto `render(ctx)` incluye `file`, `index`, `length`, `previous()`, `next()`, `command()`, `download()`, `fullscreen()`, `print()`, `search()` y `clearSearch()`. En core, `toolbar.render(ctx)` devuelve un DOM `HTMLElement | void`; React, Vue y Svelte exponen APIs de toolbar nativas para cada framework.

### Toolbar Personalizada en React

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

### Toolbar Personalizada en Vue

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

### Toolbar Personalizada en Svelte

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

En la capa de estilos, puedes seguir sobrescribiendo clases como `.ofv-toolbar`, `.ofv-toolbar button` y `.ofv-toolbar-search`. Los botones con iconos personalizados también generan `.ofv-toolbar-icon` y `.ofv-toolbar-label`, lo que facilita controlar alineación, espaciado y truncado.

### FileViewer

| Método | Descripción |
| --- | --- |
| `reload(file?)` | Recarga el archivo actual o uno especificado |
| `next()` / `previous()` | Cambia dentro de la cola de múltiples archivos |
| `goTo(index)` | Salta a un archivo específico |
| `getCurrentIndex()` | Obtiene el índice actual |
| `resize()` | Dispara manualmente el recálculo de tamaño |
| `destroy()` | Destruye el viewer y limpia recursos |

## Desarrollo de Plugins

Cada formato se integra mediante un plugin. Un plugin solo necesita responder dos preguntas: si el archivo coincide y cómo renderizar en `ctx.viewport`.

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

Restricciones de plugins:

- Renderizar solo dentro de `ctx.viewport`.
- No abrir una nueva ventana por defecto.
- Implementar `resize(size)` cuando el plugin necesite reaccionar a cambios de tamaño del contenedor.
- Implementar `destroy()` para limpiar eventos, Object URLs, temporizadores, recursos Canvas/WebGL y otros efectos secundarios.

## Estructura de Paquetes

```txt
packages/
  core/      # Core de vista previa y plugins independientes del framework
  react/     # Adaptador React
  vue/       # Adaptador Vue
  svelte/    # Adaptador Svelte
examples/
  vanilla/   # Ejemplo con JavaScript nativo
  react/     # Ejemplo React
  vue/       # Ejemplo Vue
  svelte/    # Ejemplo Svelte
doc/         # Sitio web y experiencia online
```

## Desarrollo Local

```bash
pnpm install
pnpm check
```

Comandos comunes:

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

`pnpm check` ejecuta en secuencia pruebas, type checks, builds de packages, builds de examples, build del sitio web y validación de package exports.

## Roadmap

| Versión | Foco |
| --- | --- |
| `0.1.x` | Sistema de plugins core, vista previa dentro del contenedor, integración React/Vue/Svelte/Vanilla, vista previa básica multiformato |
| `0.2.x` | Toolbar, temas, interacción con imágenes, búsqueda en PDF, estados unificados y fallback |
| `0.3.x` | Lector Markdown/código, mejora de hojas de cálculo y documentos Office |
| `0.4.x` | OFD, correo, archivos comprimidos, dibujos y mejoras para formatos frecuentes en negocios domésticos chinos |
| `0.5.x` | CAD, 3D, GIS, parsers dedicados y colaboración con conversión del lado del servidor |
| `1.0.0` | API estable, sitio de documentación completo, pruebas visuales de regresión y guía de desarrollo de plugins |

## Comunidad y Soporte

Open File Viewer seguirá mejorando la vista previa de más formatos, la integración con frameworks y escenarios reales de negocio. Mantener código abierto no es fácil. Si te ahorra tiempo de integración, una estrella en GitHub ayuda mucho a que el proyecto siga avanzando.

- Feedback: usa GitHub Issues, el grupo de comunidad o el WeChat del autor para compartir muestras de archivos, problemas de layout, adaptación de contenedor y solicitudes de nuevos formatos.
- Aprendizaje y discusión: la cuenta oficial "Frontend Development Enthusiasts" seguirá compartiendo ingeniería frontend, desarrollo de componentes y práctica open source.
- Apoyo al autor: si quieres invitar al autor a un café o incluso una botella de agua mineral, ese apoyo se agradece. Los usuarios que donen pueden agregar el WeChat del autor para futuras conversaciones sobre frontend.

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

## Enlaces

- Sitio web: https://open-file-viewer-workspace.void.app
- Acerca de: https://open-file-viewer-workspace.void.app/about.html
- GitHub: https://github.com/xushanpei/open-file-viewer
- NPM Core: https://www.npmjs.com/package/@open-file-viewer/core
- NPM React: https://www.npmjs.com/package/@open-file-viewer/react
- NPM Vue: https://www.npmjs.com/package/@open-file-viewer/vue
- NPM Svelte: https://www.npmjs.com/package/@open-file-viewer/svelte

## License

[MIT](./LICENSE)
