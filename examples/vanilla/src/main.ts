import {
  audioPlugin,
  archivePlugin,
  assetPlugin,
  cadPlugin,
  createViewer,
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
  type FileViewer,
  type PreviewFit,
  type PreviewLocale,
  type PreviewTheme
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./style.css";

const container = document.querySelector<HTMLElement>("#viewer")!;
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const widthInput = document.querySelector<HTMLInputElement>("#width")!;
const heightInput = document.querySelector<HTMLInputElement>("#height")!;
const fitInput = document.querySelector<HTMLSelectElement>("#fit")!;
const localeInput = document.querySelector<HTMLSelectElement>("#locale")!;
const themeInput = document.querySelector<HTMLSelectElement>("#theme")!;
const applyButton = document.querySelector<HTMLButtonElement>("#apply")!;

let viewer: FileViewer | null = null;
let currentFiles: Array<File | Blob> = [
  new File(
    [
      `Open File Viewer\n\nChoose a local file.\n\nThe viewer stays inside the container on the right and never opens a new window.`
    ],
    "welcome.txt",
    { type: "text/plain" }
  )
];

function render() {
  viewer?.destroy();
  viewer = createViewer({
    container,
    file: currentFiles[0],
    files: currentFiles,
    fileName: currentFiles[0] instanceof File ? currentFiles[0].name : "welcome.txt",
    width: widthInput.value,
    height: heightInput.value,
    fit: fitInput.value as PreviewFit,
    theme: themeInput.value as PreviewTheme,
    locale: localeInput.value as PreviewLocale,
    toolbar: true,
    plugins: [
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
    onError(error) {
      console.error(error);
    }
  });
}

fileInput.addEventListener("change", () => {
  const files = Array.from(fileInput.files || []);
  if (!files.length) {
    return;
  }
  currentFiles = files;
  render();
});

applyButton.addEventListener("click", render);
localeInput.addEventListener("change", render);
themeInput.addEventListener("change", render);

render();
