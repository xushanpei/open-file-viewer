import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import type { PreviewPlugin, PreviewSource } from "../types";
import { archivePlugin } from "./archive";
import { assetPlugin } from "./asset";
import { audioPlugin } from "./audio";
import { cadPlugin } from "./cad";
import { drawingPlugin } from "./drawing";
import { emailPlugin } from "./email";
import { epubPlugin } from "./epub";
import { fallbackPlugin } from "./fallback";
import { gisPlugin } from "./gis";
import { imagePlugin } from "./image";
import { model3dPlugin } from "./model3d";
import { officePlugin } from "./office";
import { ofdPlugin } from "./ofd";
import { pdfPlugin } from "./pdf";
import { textPlugin } from "./text";
import { videoPlugin } from "./video";
import { xpsPlugin } from "./xps";

type SmokeCase = {
  name: string;
  file: PreviewSource | (() => Promise<PreviewSource> | PreviewSource);
  fileName: string;
  mimeType?: string;
  plugins: PreviewPlugin[];
  selector: string;
  text?: string;
};

vi.mock("leaflet", () => ({
  default: {
    icon: vi.fn((options) => options),
    Marker: { prototype: { options: {} } },
    map: vi.fn(() => ({
      setView: vi.fn().mockReturnThis(),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      remove: vi.fn()
    })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    circleMarker: vi.fn(() => ({})),
    geoJSON: vi.fn(() => ({
      addTo: vi.fn().mockReturnThis(),
      getBounds: vi.fn(() => ({ isValid: () => false }))
    }))
  }
}));

vi.mock("topojson-client", () => ({
  default: { feature: vi.fn() }
}));

vi.mock("@mapbox/togeojson", () => ({
  default: {
    kml: vi.fn(),
    gpx: vi.fn()
  }
}));

vi.mock("shpjs", () => ({
  default: vi.fn()
}));

describe("default plugin render smoke", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    document.head.querySelector("#ofv-leaflet-css")?.remove();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each(smokeCases())("renders $name inside a narrow host", async (testCase) => {
    const container = document.createElement("div");
    container.style.width = "280px";
    container.style.height = "360px";
    document.body.append(container);

    const onError = vi.fn();
    const viewer = createViewer({
      container,
      file: await resolveSource(testCase.file),
      fileName: testCase.fileName,
      mimeType: testCase.mimeType,
      width: "280px",
      height: "360px",
      plugins: testCase.plugins,
      onError
    });

    await waitFor(
      () =>
        Boolean(container.querySelector(testCase.selector)) &&
        (!testCase.text || container.textContent?.includes(testCase.text) === true)
    );

    expect(container.querySelector(".ofv-root")).toBeNull();
    expect(container.classList.contains("ofv-root")).toBe(true);
    expect(container.getBoundingClientRect().width).toBeLessThanOrEqual(280);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    if (testCase.text) {
      expect(container.textContent).toContain(testCase.text);
    }
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
  });
});

function smokeCases(): SmokeCase[] {
  return [
    {
      name: "plain text",
      file: new Blob(["A very long plain text line that should wrap inside the narrow preview host."], {
        type: "text/plain"
      }),
      fileName: "notes.txt",
      plugins: [textPlugin()],
      selector: ".ofv-code-container.is-wrapped",
      text: "plain text"
    },
    {
      name: "extensionless project file",
      file: new Blob(["install:\n\tpnpm install\nbuild:\n\tpnpm build"], { type: "" }),
      fileName: "Makefile",
      plugins: [textPlugin()],
      selector: ".ofv-code-container",
      text: "makefile"
    },
    {
      name: "extensionless README",
      file: new Blob(["# Open File Viewer"], { type: "" }),
      fileName: "README",
      plugins: [textPlugin()],
      selector: ".ofv-markdown-body",
      text: "Open File Viewer"
    },
    {
      name: "hidden config file",
      file: new Blob(["node_modules\n.DS_Store"], { type: "" }),
      fileName: ".gitignore",
      plugins: [textPlugin()],
      selector: ".ofv-code-container.is-wrapped",
      text: "node_modules"
    },
    {
      name: "notebook JSON",
      file: new Blob([JSON.stringify({ cells: [], metadata: { project: "Open File Viewer" } }, null, 2)], {
        type: "application/x-ipynb+json"
      }),
      fileName: "analysis.ipynb",
      plugins: [textPlugin()],
      selector: ".ofv-code-container",
      text: "Open File Viewer"
    },
    {
      name: "image fallback",
      file: new Blob(["not an image"], { type: "image/png" }),
      fileName: "broken.png",
      plugins: [imagePlugin()],
      selector: ".ofv-image-content"
    },
    {
      name: "audio",
      file: new Blob(["audio"], { type: "audio/mpeg" }),
      fileName: "track.mp3",
      plugins: [audioPlugin()],
      selector: ".ofv-audio audio",
      text: "track.mp3"
    },
    {
      name: "video DASH fallback",
      file: new Blob(["<MPD />"], { type: "application/dash+xml" }),
      fileName: "stream.mpd",
      plugins: [videoPlugin()],
      selector: ".ofv-fallback",
      text: "下载视频"
    },
    {
      name: "PDF fallback",
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "locked.pdf",
      plugins: [pdfPlugin({ pdfjs: failingPdfJs() as any })],
      selector: ".ofv-fallback",
      text: "PDF 预览失败"
    },
    {
      name: "EPUB",
      file: minimalEpub,
      fileName: "book.epub",
      plugins: [epubPlugin()],
      selector: ".ofv-epub-reader",
      text: "Smoke EPUB"
    },
    {
      name: "XPS",
      file: minimalXps,
      fileName: "report.xps",
      plugins: [xpsPlugin()],
      selector: ".ofv-xps-pages",
      text: "Hello XPS"
    },
    {
      name: "OFD",
      file: minimalOfd,
      fileName: "invoice.ofd",
      plugins: [ofdPlugin()],
      selector: ".ofv-ofd-pages",
      text: "OFD 文本"
    },
    {
      name: "workbook",
      file: workbookCsv(),
      fileName: "sheet.csv",
      plugins: [officePlugin()],
      selector: ".ofv-table-scroll",
      text: "Alice"
    },
    {
      name: "archive",
      file: minimalZip,
      fileName: "bundle.zip",
      plugins: [archivePlugin()],
      selector: ".ofv-archive-item",
      text: "readme.txt"
    },
    {
      name: "email",
      file: minimalEmail(),
      fileName: "message.eml",
      plugins: [emailPlugin()],
      selector: ".ofv-email"
    },
    {
      name: "drawing",
      file: new Blob([JSON.stringify({ elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 50 }] })], {
        type: "application/json"
      }),
      fileName: "board.excalidraw",
      plugins: [drawingPlugin()],
      selector: ".ofv-svg-stage"
    },
    {
      name: "CAD guidance",
      file: new Blob(["ISO-10303-21;"], { type: "application/x-step" }),
      fileName: "building.ifc",
      plugins: [cadPlugin()],
      selector: ".ofv-cad",
      text: "CAD 基础预览"
    },
    {
      name: "GIS",
      file: new Blob([JSON.stringify({ type: "FeatureCollection", features: [] })], {
        type: "application/geo+json"
      }),
      fileName: "map.geojson",
      plugins: [gisPlugin()],
      selector: ".ofv-map-stage"
    },
    {
      name: "3D placeholder",
      file: new Blob(["FBX"], { type: "application/vnd.autodesk.fbx" }),
      fileName: "model.fbx",
      plugins: [model3dPlugin()],
      selector: ".ofv-fallback",
      text: "3D 预览不可用"
    },
    {
      name: "asset",
      file: new Uint8Array([0x00, 0x01, 0x00, 0x00]).buffer,
      fileName: "font.ttf",
      plugins: [assetPlugin()],
      selector: ".ofv-asset",
      text: "字体文件预览"
    },
    {
      name: "fallback",
      file: new Blob(["unknown"], { type: "application/octet-stream" }),
      fileName: "unknown.bin",
      plugins: [fallbackPlugin()],
      selector: ".ofv-fallback",
      text: "unknown.bin"
    }
  ];
}

async function resolveSource(source: SmokeCase["file"]): Promise<PreviewSource> {
  return typeof source === "function" ? source() : source;
}

function workbookCsv(): Blob {
  return new Blob(["name,score\nAlice,100"], { type: "text/csv" });
}

async function minimalZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("readme.txt", "Hello archive");
  return zip.generateAsync({ type: "arraybuffer" });
}

async function minimalEpub(): Promise<Blob> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml" />
      </rootfiles>
    </container>`
  );
  zip.file(
    "OPS/package.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Smoke EPUB</dc:title>
      </metadata>
      <manifest>
        <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml" />
      </manifest>
      <spine>
        <itemref idref="c1" />
      </spine>
    </package>`
  );
  zip.file("OPS/chapter.xhtml", "<html><body><h1>Smoke EPUB</h1></body></html>");
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

async function minimalXps(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "Documents/1/Pages/1.fpage",
    `<FixedPage xmlns="http://schemas.microsoft.com/xps/2005/06" Width="800" Height="600">
      <Glyphs UnicodeString="Hello XPS" />
    </FixedPage>`
  );
  zip.file("FixedDocSeq.fdseq", "<FixedDocumentSequence />");
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.ms-xpsdocument" });
}

async function minimalOfd(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "Doc_0/Pages/Page_0/Content.xml",
    `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
      <ofd:Content>
        <ofd:Layer>
          <ofd:TextObject Boundary="20 30 120 16" Size="12">
            <ofd:TextCode X="0" Y="0">OFD 文本</ofd:TextCode>
          </ofd:TextObject>
        </ofd:Layer>
      </ofd:Content>
    </ofd:Page>`
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

function minimalEmail(): Blob {
  return new Blob(
    [
      [
        "From: sender@example.com",
        "To: viewer@example.com",
        "Subject: Hello email",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Hello email body"
      ].join("\r\n")
    ],
    { type: "message/rfc822" }
  );
}

function failingPdfJs() {
  return {
    version: "4.0.0-test",
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(() => ({
      promise: Promise.reject(new Error("broken pdf")),
      destroy: vi.fn()
    }))
  };
}

async function waitFor(predicate: () => boolean, timeout = 1500): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[id^="ofv-prism-css"]')) {
      link.dispatchEvent(new Event("error"));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
