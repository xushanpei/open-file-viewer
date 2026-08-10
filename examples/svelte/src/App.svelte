<script lang="ts">
  import {
    archivePlugin,
    assetPlugin,
    audioPlugin,
    cadPlugin,
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
    xmindPlugin,
    xpsPlugin,
    type PreviewLocale,
    type PreviewTheme
  } from "@open-file-viewer/core";
  import "@open-file-viewer/core/style.css";
  import { OpenFileViewer } from "@open-file-viewer/svelte";
  import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

  let locale: PreviewLocale = "en-US";
  let theme: PreviewTheme = "light";
  let files: Array<File | Blob> = [
    new File(["Svelte adapter demo\n\nChoose a local file to preview it inside the custom container."], "welcome.txt", {
      type: "text/plain"
    })
  ];

  const plugins = [
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
    xmindPlugin(),
    cadPlugin(),
    model3dPlugin(),
    gisPlugin(),
    assetPlugin(),
    textPlugin()
  ];

  function chooseFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const next = Array.from(input.files || []);
    if (next.length > 0) {
      files = next;
    }
  }

  $: firstFile = files[0];
  $: fileName = firstFile instanceof File ? firstFile.name : "welcome.txt";
</script>

<main class="demo-shell">
  <header>
    <h1>Svelte File Viewer</h1>
    <input type="file" multiple on:change={chooseFiles} />
    <div class="demo-controls">
      <select aria-label="Locale" bind:value={locale}>
        <option value="en-US">en-US</option>
        <option value="zh-CN">zh-CN</option>
      </select>
      <select aria-label="Theme" bind:value={theme}>
        <option value="light">light</option>
        <option value="dark">dark</option>
        <option value="auto">auto</option>
      </select>
    </div>
  </header>

  <OpenFileViewer file={firstFile} {files} {fileName} height="70vh" {plugins} {locale} {theme} toolbar />
</main>
