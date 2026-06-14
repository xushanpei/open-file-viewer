import { createApp, h, ref } from "vue";
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
  xpsPlugin
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import { OpenFileViewer } from "@open-file-viewer/vue";
import type { PreviewTheme } from "@open-file-viewer/vue";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./style.css";

const App = {
  components: { OpenFileViewer },
  setup() {
    const files = ref<Array<File | Blob>>([
      new File(["Vue adapter demo\n\n选择本地文件后会在自定义容器内预览。"], "welcome.txt", {
        type: "text/plain"
      })
    ]);
    const theme = ref<PreviewTheme>("light");
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
      cadPlugin(),
      model3dPlugin(),
      gisPlugin(),
      assetPlugin(),
      textPlugin()
    ];

    return { files, plugins, theme };
  },
  render() {
    const firstFile = this.files[0];
    return h("main", { class: "demo-shell" }, [
      h("header", [
        h("h1", "Vue File Viewer"),
        h("input", {
          type: "file",
          multiple: true,
          onChange: (event: Event) => {
            const input = event.target as HTMLInputElement;
            const next = Array.from(input.files || []);
            if (next.length > 0) {
              this.files = next;
            }
          }
        }),
        h(
          "select",
          {
            "aria-label": "主题",
            value: this.theme,
            onChange: (event: Event) => {
              this.theme = (event.target as HTMLSelectElement).value as PreviewTheme;
            }
          },
          [
            h("option", { value: "light" }, "light"),
            h("option", { value: "dark" }, "dark"),
            h("option", { value: "auto" }, "auto")
          ]
        )
      ]),
      h(OpenFileViewer, {
        file: firstFile,
        files: this.files,
        fileName: firstFile instanceof File ? firstFile.name : "welcome.txt",
        height: "70vh",
        plugins: this.plugins,
        theme: this.theme,
        toolbar: true
      })
    ]);
  }
};

createApp(App).mount("#app");
