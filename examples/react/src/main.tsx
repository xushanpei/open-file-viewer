import {
  archivePlugin,
  assetPlugin,
  audioPlugin,
  cadPlugin,
  drawingPlugin,
  emailPlugin,
  epubPlugin,
  imagePlugin,
  model3dPlugin,
  gisPlugin,
  officePlugin,
  ofdPlugin,
  pdfPlugin,
  textPlugin,
  videoPlugin,
  xmindPlugin,
  xpsPlugin,
  type PreviewLocale
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import { FileViewer } from "@open-file-viewer/react";
import type { PreviewTheme } from "@open-file-viewer/react";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [locale, setLocale] = useState<PreviewLocale>("en-US");
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [files, setFiles] = useState<Array<File | Blob>>([
    new File(["React adapter demo\n\nChoose a local file to preview it inside the custom container."], "welcome.txt", {
      type: "text/plain"
    })
  ]);
  const plugins = useMemo(
    () => [
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
    ],
    []
  );

  return (
    <main className="demo-shell">
      <header>
        <h1>React File Viewer</h1>
        <input
          type="file"
          multiple
          onChange={(event) => {
            const next = Array.from(event.target.files || []);
            if (next.length > 0) {
              setFiles(next);
            }
          }}
        />
        <div className="demo-controls">
          <select
            aria-label="Locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value as PreviewLocale)}
          >
            <option value="en-US">en-US</option>
            <option value="zh-CN">zh-CN</option>
          </select>
          <select
            aria-label="Theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value as PreviewTheme)}
          >
            <option value="light">light</option>
            <option value="dark">dark</option>
            <option value="auto">auto</option>
          </select>
        </div>
      </header>
      <FileViewer
        file={files[0]}
        files={files}
        fileName={files[0] instanceof File ? files[0].name : "welcome.txt"}
        height="70vh"
        plugins={plugins}
        locale={locale}
        theme={theme}
        toolbar
      />
    </main>
  );
}

createRoot(document.querySelector("#root")!).render(<App />);
