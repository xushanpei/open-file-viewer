import {
  archivePlugin,
  audioPlugin,
  cadPlugin,
  drawingPlugin,
  emailPlugin,
  imagePlugin,
  model3dPlugin,
  officePlugin,
  ofdPlugin,
  pdfPlugin,
  textPlugin,
  videoPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import { FileViewer } from "@open-file-viewer/react";
import type { PreviewTheme } from "@open-file-viewer/react";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [files, setFiles] = useState<Array<File | Blob>>([
    new Blob(["React adapter demo\n\n选择本地文件后会在自定义容器内预览。"], {
      type: "text/plain"
    })
  ]);
  const plugins = useMemo(
    () => [
      imagePlugin(),
      videoPlugin(),
      audioPlugin(),
      pdfPlugin({ workerSrc: pdfWorkerSrc }),
      officePlugin(),
      ofdPlugin(),
      archivePlugin(),
      emailPlugin(),
      drawingPlugin(),
      cadPlugin(),
      model3dPlugin(),
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
        <select value={theme} onChange={(event) => setTheme(event.target.value as PreviewTheme)}>
          <option value="light">light</option>
          <option value="dark">dark</option>
          <option value="auto">auto</option>
        </select>
      </header>
      <FileViewer
        file={files[0]}
        files={files}
        fileName={files[0] instanceof File ? files[0].name : "welcome.txt"}
        height="70vh"
        plugins={plugins}
        theme={theme}
        toolbar
      />
    </main>
  );
}

createRoot(document.querySelector("#root")!).render(<App />);
