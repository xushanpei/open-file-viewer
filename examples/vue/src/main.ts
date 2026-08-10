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
  xmindPlugin,
  xpsPlugin,
  type PreviewLocale
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
      new File(["Vue adapter demo\n\nChoose a local file to preview it inside the custom container."], "welcome.txt", {
        type: "text/plain"
      })
    ]);
    const locale = ref<PreviewLocale>("en-US");
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
      xmindPlugin(),
      cadPlugin(),
      model3dPlugin(),
      gisPlugin(),
      assetPlugin(),
      textPlugin()
    ];

    return { files, locale, plugins, theme };
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
        h("div", { class: "demo-controls" }, [
          h(
            "select",
            {
              "aria-label": "Locale",
              value: this.locale,
              onChange: (event: Event) => {
                this.locale = (event.target as HTMLSelectElement).value as PreviewLocale;
              }
            },
            [h("option", { value: "en-US" }, "en-US"), h("option", { value: "zh-CN" }, "zh-CN")]
          ),
          h(
            "select",
            {
              "aria-label": "Theme",
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
        ])
      ]),
      h(OpenFileViewer, {
        file: firstFile,
        files: this.files,
        fileName: firstFile instanceof File ? firstFile.name : "welcome.txt",
        height: "70vh",
        plugins: this.plugins,
        locale: this.locale,
        theme: this.theme,
        toolbar: true
      })
    ]);
  }
};

createApp(App).mount("#app");
